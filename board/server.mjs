// ADLC board: one local page with the phases, their journeys and changes, PRs, sessions and the
// owner's open questions. Node 18+, no dependencies, binds 127.0.0.1 only.
// Usage: node server.mjs <repository dir>   (lc-board starts it)
//
// What it derives, so nobody keeps it by hand:
//   phases, goals, journeys and changes from the roadmap (docs.roadmap; templates/roadmap.md);
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
  if (/\bmerged\b|\bdone\b/.test(t)) return 'done';
  if (/in progress|in review|open:/.test(t)) return 'progress';
  if (/blocked/.test(t)) return 'blocked';
  return 'planned';
};

// Phases from the roadmap: each `## ` section with a **Goal:** line.
async function phases() {
  const md = await text(roadmapPath);
  if (!md) return [];
  const known = await journeyNames();
  const out = [];
  for (const section of md.split(/\n(?=## )/).slice(1)) {
    const lines = section.split('\n');
    const head = lines[0].replace(/^##\s*/, '');
    const body = lines.slice(1).join('\n');
    const goal = body.match(/\*\*Goal:\*\*\s*([^\n]*?)(?=\s*\*\*\w[^*]*:\*\*|\n|$)/);
    if (!goal) continue;
    const name = head.replace(/\s*\(([^)]*)\)\s*$/, '');
    const tag = (head.match(/\(([^)]*)\)\s*$/)?.[1] ?? '').toLowerCase();
    const status = /current|progress/.test(tag) ? 'progress' : /closed|done/.test(tag) ? 'done' : 'planned';
    const link = body.match(/\]\(([^)#\s]*acceptance[^)#\s]*\.md)\)/i)?.[1];
    const items = [];
    for (const t of tables(lines)) {
      const key = t.head.find((h) => h === 'state' || h === 'status');
      if (!key) continue;
      for (const row of t.rows) {
        const prs = [...row[key].matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
        items.push({ group: t.title || 'Changes', label: plain(row[t.head[0]]), state: stateOf(row[key]), stateText: plain(row[key]), pr: prs.at(-1) ?? null, owner: plain(row.owner ?? '') });
      }
    }
    out.push({
      id: slug(name),
      name,
      status,
      goal: plain(goal[1]),
      journeys: journeyIds(body, known).map((id) => ({ id, name: known.get(id) })),
      criteria: link ? await criteria(resolve(dirname(roadmapPath), link)) : [],
      acceptance: link ?? null,
      items,
    });
  }
  return out;
}

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
    const [state, derived, questions, given, prs, live] = await Promise.all([
      json('state.json', {}),
      phases(),
      json('questions.json', []),
      answers(),
      pullRequests(),
      sessions(),
    ]);
    const answered = new Map(given.map((a) => [a.id, a]));
    return send(res, 200, 'application/json', JSON.stringify({
      project: conf.name ?? '',
      sources: { roadmap: conf['docs.roadmap'] ?? null, journeys: conf['docs.journeys'] ?? null },
      state,
      phases: derived,
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
