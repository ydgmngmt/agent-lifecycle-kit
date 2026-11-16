// ADLC board: one local page with the phases, their journeys and changes, PRs, sessions and the
// owner's open questions. Node 18+, no dependencies, binds 127.0.0.1 only.
// Usage: node server.mjs <repository dir>   (lc-board starts it)
//
// What it derives, so nobody keeps it by hand:
//   the roadmap strip, history, current and coming phases, their main journeys (a numbered list
//   with "Stories …; journeys …"), changes (State tables, linked to journeys by stories) and scope
//   (bullet lead-ins) from the roadmap (docs.roadmap; templates/roadmap.md);
//   merges per day for 14 days, and all merged, from `gh pr list`;
//   journey names from the journey index (docs.journeys): table rows whose first cell is an ID;
//   acceptance criteria from the phase's acceptance file, linked from its roadmap section;
//   PR state and CI from `gh pr list`; sessions from tmux (sessions.tmux_session).
// What stays in <data dir>/state.json, because no file holds it: a headline, per-phase notes,
// journey and criterion status not yet shown by a phase run, extra items, and a note per session.
// Questions for the owner: <data dir>/questions.json; answers are appended to answers.jsonl.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFile, appendFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(process.argv[2] ?? process.cwd());

// --- .agents/project.yaml: the few keys the board reads (two levels, `key: value`) -------------
const conf = {};
try {
  let block = '';
  for (const line of (await readFile(join(repo, '.agents/project.yaml'), 'utf8')).split('\n')) {
    const m = line.match(/^( *)([\w-]+):\s*(.*)$/);
    if (!m) continue;
    const value = m[3].replace(/\s+#.*$/, '').replace(/\s+—.*$/, '').replace(/^["']|["']$/g, '').trim();
    if (!m[1]) block = m[2];
    conf[m[1] ? `${block}.${m[2]}` : m[2]] = value;
  }
} catch {
  console.error(`no .agents/project.yaml in ${repo}; using defaults`);
}
const home = (p) => p?.replace(/^~(?=\/|$)/, homedir());
const port = Number(process.env.LC_BOARD_PORT || conf['board.port'] || 4777);
const dataDir = home(process.env.LC_BOARD_DIR || conf['board.data_dir'] || (conf.handoff_dir && `${conf.handoff_dir}/board`) || join(repo, '.agents/board'));
const tmuxSession = process.env.LC_TMUX_SESSION || conf['sessions.tmux_session'] || '';
const roadmapPath = conf['docs.roadmap'] && join(repo, conf['docs.roadmap']);
const journeysPath = conf['docs.journeys'] && join(repo, conf['docs.journeys']);

// --- helpers ---------------------------------------------------------------------------------
const run = (cmd, args) =>
  new Promise((done) =>
    execFile(cmd, args, { cwd: repo, timeout: 20_000, maxBuffer: 8 << 20 }, (error, stdout) => done(error ? '' : stdout)),
  );
const text = (file) => readFile(file, 'utf8').catch(() => '');
const json = async (file, fallback) => {
  try {
    return JSON.parse(await readFile(join(dataDir, file), 'utf8'));
  } catch {
    return fallback;
  }
};
const cached = (ms, load) => {
  let at = 0;
  let value;
  return async () => {
    if (Date.now() - at > ms) {
      value = await load();
      at = Date.now();
    }
    return value;
  };
};
const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const plain = (s) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '').trim();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ID = /\b([A-Z][A-Z0-9]*-\d+)\b/g;

// Markdown tables in a block of lines, as arrays of {header -> cell}.
function tables(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('|') || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) continue;
    const head = cells(lines[i]).map((h) => h.toLowerCase());
    // The table's title: the nearest bold lead-in above it, e.g. "**Track 1, screens.** ...".
    let title = '';
    for (let k = i - 1; k >= 0 && !lines[k].startsWith('#'); k--) {
      const m = lines[k].match(/^\*\*([^*]+?)[.:]?\*\*/);
      if (m) {
        title = m[1];
        break;
      }
    }
    const rows = [];
    for (i += 2; i < lines.length && lines[i].trim().startsWith('|'); i++) {
      const c = cells(lines[i]);
      rows.push(Object.fromEntries(head.map((h, k) => [h, c[k] ?? ''])));
    }
    out.push({ head, rows, title });
  }
  return out;
}

// Journey names from the journey index: a row whose first cell is an ID.
async function journeyNames() {
  const names = new Map();
  // Only an index table has a Journey (or Name) column; other tables there may also start with IDs.
  for (const t of tables((await text(journeysPath)).split('\n'))) {
    const col = t.head.find((h) => h === 'journey' || h === 'name');
    if (!col) continue;
    for (const row of t.rows) {
      const id = plain(row[t.head[0]] ?? '');
      if (/^[A-Z][A-Z0-9]*-\d+$/.test(id) && !names.has(id)) names.set(id, plain(row[col]));
    }
  }
  return names;
}

// Journey IDs named in a text, with "X-2 to X-4" expanded.
function journeyIds(s, known) {
  const ids = new Set();
  for (const m of s.matchAll(/\b([A-Z][A-Z0-9]*)-(\d+) to \1-(\d+)\b/g)) {
    for (let n = Number(m[2]); n <= Number(m[3]); n++) ids.add(`${m[1]}-${n}`);
  }
  for (const m of s.matchAll(ID)) ids.add(m[1]);
  return [...ids].filter((id) => known.has(id));
}

// Criteria from a phase's acceptance file: table rows whose first cell is an ID with "AC".
async function criteria(file) {
  const out = [];
  for (const t of tables((await text(file)).split('\n'))) {
    for (const row of t.rows) {
      const id = plain(row[t.head[0]] ?? '');
      if (!/AC\d+$/.test(id)) continue;
      const body = plain(row[t.head[1]] ?? '');
      out.push({ id, text: row.then ? `${body}: ${plain(row.then)}` : body, moved: /^moved\b/i.test(body) });
    }
  }
  return out;
}

const stateOf = (s) => {
  const t = s.toLowerCase();
  if (/merged|done/.test(t) && /planned|left|rest/.test(t)) return 'progress';
  if (/\bmerged\b|\bdone\b/.test(t)) return 'done';
  if (/in progress|in review|open:/.test(t)) return 'progress';
  if (/blocked/.test(t)) return 'blocked';
  return 'planned';
};

// Story numbers in a text: "107–112, 10, 47" (ranges with a dash or "to").
function stories(s) {
  const out = new Set();
  for (const m of s.matchAll(/(\d+)\s*(?:[–-]|to)\s*(\d+)|(\d+)/g)) {
    if (m[3]) out.add(Number(m[3]));
    else for (let n = Number(m[1]); n <= Number(m[2]) && n - Number(m[1]) < 500; n++) out.add(n);
  }
  return out;
}

// A status word of the roadmap's history table, as one of the board's states.
const historyStatus = (s) => {
  const t = s.toLowerCase();
  if (/hold/.test(t)) return 'hold';
  if (/not verified|no end/.test(t)) return 'unverified';
  if (/closed/.test(t)) return 'closed';
  if (/done|accepted|met/.test(t)) return 'done';
  return 'planned';
};
const firstSentence = (s) => {
  const t = plain(s).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+([.,;])/g, '$1').split(/(?<=\.)\s/)[0].trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// The roadmap as the board shows it:
//   history: rows of a history table (a `## ` section whose heading says history or earlier),
//            then the closed phase sections;
//   phases:  each `## ` section with a **Goal:** line. Its heading's (…) says current, next, later or closed.
//   Per phase: the numbered list of main journeys (with their stories and journey IDs), the journey
//   IDs it names, changes from its State tables (stories per change link it to the main journeys),
//   the acceptance criteria from the linked acceptance file, and the bold lead-ins of its bullets as scope.
async function roadmap() {
  const md = await text(roadmapPath);
  if (!md) return { history: [], phases: [] };
  const known = await journeyNames();
  const history = [];
  const phases = [];
  for (const section of md.split(/\n(?=## )/).slice(1)) {
    const lines = section.split('\n');
    const head = lines[0].replace(/^##\s*/, '');
    const body = lines.slice(1).join('\n');
    const goal = body.match(/\*\*Goal:\*\*\s*([^\n]*?)(?=\s*\*\*\w[^*]*:\*\*|\n|$)/);
    if (!goal) {
      if (!/history|earlier/i.test(head)) continue;
      for (const t of tables(lines)) {
        const key = t.head.find((h) => h === 'status' || h === 'state');
        if (!key) continue;
        for (const row of t.rows) {
          const [name, ...rest] = plain(row[t.head[0]]).split(':');
          const st = plain(row[key]);
          const when = st.replace(/^[^:,(]*[:,]?\s*/, '').replace(/^\((.*)\)$/, '$1');
          const summary = rest.join(':').trim();
          history.push({ name: name.trim(), status: historyStatus(st), when, summary: summary && summary.charAt(0).toUpperCase() + summary.slice(1) });
        }
      }
      continue;
    }
    const name = head.replace(/\s*\(([^)]*)\)\s*$/, '');
    const tag = (head.match(/\(([^)]*)\)\s*$/)?.[1] ?? '').toLowerCase();
    const kind = /current|progress/.test(tag) ? 'current' : /closed/.test(tag) ? 'closed' : /done/.test(tag) ? 'done' : /next/.test(tag) ? 'next' : 'later';
    const link = body.match(/\]\(([^)#\s]*acceptance[^)#\s]*\.md)\)/i)?.[1];
    const main = [];
    for (const l of lines) {
      const m = l.match(/^(\d+)\.\s+(.*)$/);
      if (!m) continue;
      main.push({ id: m[1], name: firstSentence(m[2]).replace(/\.$/, ''), stories: [...stories(m[2].match(/Stories\s+([^;.]*)/i)?.[1] ?? '')], journeys: journeyIds(m[2], known) });
    }
    const items = [];
    for (const t of tables(lines)) {
      const key = t.head.find((h) => h === 'state' || h === 'status');
      if (!key) continue;
      for (const row of t.rows) {
        const prs = [...row[key].matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
        const own = stories(row.stories ?? '');
        items.push({
          group: t.title || 'Changes',
          label: plain(row[t.head[0]]),
          state: stateOf(row[key]),
          stateText: plain(row[key]),
          pr: prs.at(-1) ?? null,
          owner: plain(row.owner ?? ''),
          j: main.filter((j) => j.stories.some((n) => own.has(n))).map((j) => j.id),
        });
      }
    }
    const scope = lines
      .map((l) => l.match(/^- (?:\*\*([^*]+?)[:.]?\*\*|([^:(]{3,60})(?::|\s\())/))
      .filter(Boolean)
      .map((m) => plain(m[1] ?? m[2]).replace(/[:.]$/, ''));
    const phase = {
      id: slug(name),
      name,
      kind,
      status: kind === 'current' ? 'progress' : kind === 'closed' || kind === 'done' ? 'done' : 'planned',
      goal: plain(goal[1]),
      summary: firstSentence(goal[1]),
      main,
      journeys: journeyIds(body, known).map((id) => ({ id, name: known.get(id) })),
      criteria: link ? await criteria(resolve(dirname(roadmapPath), link)) : [],
      acceptance: link ?? null,
      items,
      scope,
    };
    if (kind === 'closed' || kind === 'done') history.push({ name, status: kind, when: '', summary: phase.summary });
    phases.push(phase);
  }
  return { history, phases };
}

// Merged pull requests per local day for the last 14 days, and the count of all merged.
const merges = cached(300_000, async () => {
  const out = await run('gh', ['pr', 'list', '--state', 'merged', '--limit', '2000', '--json', 'mergedAt']);
  const all = out ? JSON.parse(out) : [];
  const days = [];
  for (let i = 13; i >= 0; i--) days.push({ day: new Date(Date.now() - i * 86_400_000).toLocaleDateString('sv'), count: 0 });
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const pr of all) {
    const slot = byDay.get(new Date(pr.mergedAt).toLocaleDateString('sv'));
    if (slot) slot.count += 1;
  }
  return { days, total: all.length };
});

const checkState = (rollup) => {
  const checks = (rollup ?? []).filter((c) => (c.conclusion ?? c.state) !== 'SKIPPED');
  if (checks.length === 0) return 'none';
  if (checks.some((c) => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(c.conclusion ?? c.state))) return 'red';
  if (checks.some((c) => (c.status && c.status !== 'COMPLETED') || c.state === 'PENDING')) return 'running';
  return 'green';
};

const pullRequests = cached(45_000, async () => {
  const out = await run('gh', ['pr', 'list', '--state', 'all', '--limit', '80', '--json', 'number,title,state,headRefName,statusCheckRollup,mergedAt,url']);
  if (!out) return [];
  return JSON.parse(out).map((p) => ({ number: p.number, title: p.title, state: p.state, branch: p.headRefName, checks: checkState(p.statusCheckRollup), mergedAt: p.mergedAt, url: p.url }));
});

const sessions = cached(20_000, async () => {
  if (!tmuxSession) return [];
  const names = (await run('tmux', ['list-windows', '-t', tmuxSession, '-F', '#W'])).split('\n').filter(Boolean);
  return Promise.all(
    names.map(async (name) => {
      const pane = await run('tmux', ['capture-pane', '-p', '-t', `${tmuxSession}:${name}`, '-S', '-25']);
      const lines = pane.split('\n').map((l) => l.trim()).filter(Boolean);
      const working = lines.some((l) => /…\s*\(\d|esc to interrupt/.test(l));
      const limit = lines.some((l) => /usage limit|limit reached/i.test(l));
      return { name, state: limit ? 'limit' : working ? 'working' : 'idle' };
    }),
  );
});

const answers = async () =>
  (await text(join(dataDir, 'answers.jsonl'))).split('\n').filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });

const send = (res, status, type, body) => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', await readFile(join(here, 'index.html')));
  if (req.method === 'GET' && url.pathname === '/api/state') {
    const [state, derived, questions, given, prs, live, merged] = await Promise.all([
      json('state.json', {}),
      roadmap(),
      json('questions.json', []),
      answers(),
      pullRequests(),
      sessions(),
      merges(),
    ]);
    const answered = new Map(given.map((a) => [a.id, a]));
    return send(res, 200, 'application/json', JSON.stringify({
      project: conf.name ?? '',
      sources: { roadmap: conf['docs.roadmap'] ?? null, journeys: conf['docs.journeys'] ?? null },
      state,
      history: derived.history,
      phases: derived.phases,
      merges: merged,
      prs,
      sessions: live,
      questions: questions.map((q) => ({ ...q, answer: answered.get(q.id) ?? null })),
      at: new Date().toISOString(),
    }));
  }
  if (req.method === 'POST' && url.pathname === '/api/answer') {
    // Same origin only: the page is the only caller that may record an answer.
    if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host) return send(res, 403, 'text/plain', 'forbidden');
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 100_000) return send(res, 413, 'text/plain', 'too large');
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, 'text/plain', 'not JSON');
    }
    if (typeof body.id !== 'string') return send(res, 400, 'text/plain', 'missing id');
    const entry = { id: body.id, choice: Number.isInteger(body.choice) ? body.choice : null, text: String(body.text ?? ''), at: new Date().toISOString() };
    await appendFile(join(dataDir, 'answers.jsonl'), JSON.stringify(entry) + '\n');
    return send(res, 200, 'application/json', '{"ok":true}');
  }
  send(res, 404, 'text/plain', 'not found');
}).listen(port, '127.0.0.1', () => console.log(`ADLC board on http://localhost:${port} (data ${dataDir})`));
