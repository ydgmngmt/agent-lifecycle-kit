// One-line board updates, so nobody reads or rewrites state.json to change one thing.
// Usage: node cli.mjs <repo dir> <command> …   (lc-board passes everything but start, stop and status)
//   set headline|note "<text>" [--phase p]
//   item <label match> [--pr N] [--status s] [--owner name] [--note text] [--phase p] [--new]
//   journey <id> [--status s] [--note text] [--evidence url] [--phase p]
//   criterion <id> <status> [--evidence url] [--phase p]
//   session <name> "<note>"
//   ask <id> --title t [--body b] --option "label|description" … [--recommended n]
//   outcome <question id> "<what was done>"
//   answers [--wait]        new answers since the last call; --wait blocks until there is one
//   stale                   what the board shows that is probably out of date (GET /api/stale)
//   log                     running-log lines added since the last call (board.running_log)
// Every write bumps `updated` and is checked before it replaces the file.
import { readFileSync, writeFileSync, renameSync, existsSync, statSync, openSync, readSync, closeSync, watchFile, unwatchFile } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.mjs';

const [repoArg, cmd, ...rest] = process.argv.slice(2);
const { dataDir, port, runningLog } = loadConfig(repoArg ?? '.');
const fail = (msg) => {
  console.error(`lc-board: ${msg}`);
  process.exit(1);
};

// Positional words, then --flags (a repeated flag collects into a list).
const pos = [];
const flags = {};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (!a.startsWith('--')) pos.push(a);
  else if (a === '--new' || a === '--wait') flags[a.slice(2)] = true;
  else {
    const v = rest[++i];
    if (v === undefined) fail(`${a} needs a value`);
    (flags[a.slice(2)] ??= []).push(v);
  }
}
const flag = (k) => flags[k]?.at(-1);

const file = (name) => join(dataDir, name);
const readJson = (name, fallback) => (existsSync(file(name)) ? JSON.parse(readFileSync(file(name), 'utf8')) : fallback);
const writeJson = (name, value) => {
  const tmp = file(`${name}.tmp`);
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  JSON.parse(readFileSync(tmp, 'utf8'));
  renameSync(tmp, file(name));
};
const now = () => new Date().toISOString();
const DONE = /^(done|pass|passed|verified)$/i;

// The phase a setter writes to: --phase, else the board's current phase. `derived` is that phase as
// the server reads it from the roadmap (null when the server is down and --phase was given).
async function phaseOf() {
  const want = flag('phase');
  let data;
  try {
    data = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
  } catch {
    if (want) return { id: want, derived: null };
    fail(`the board server is not running on port ${port} (lc-board start), and no --phase was given`);
  }
  const p = want ? data.phases.find((x) => x.id === want) : (data.phases.find((x) => x.kind === 'current') ?? data.phases.find((x) => x.kind === 'next'));
  if (!p && !want) fail('no current phase in the roadmap; pass --phase');
  return { id: p?.id ?? want, derived: p ?? null };
}

function save(state) {
  for (const [id, p] of Object.entries(state.phases ?? {})) {
    if (typeof p !== 'object' || Array.isArray(p)) fail(`phase ${id} is not an object`);
    for (const [c, v] of Object.entries(p.criteria ?? {})) if (DONE.test(v) && !p.evidence?.[c]) fail(`criterion ${c} is done without evidence`);
  }
  state.updated = now();
  writeJson('state.json', state);
}

const state = () => {
  const s = readJson('state.json', {});
  s.phases ??= {};
  s.sessions ??= {};
  return s;
};

const commands = {
  async set() {
    const [what, text] = pos;
    if (text === undefined) fail('usage: set headline|note "<text>"');
    const s = state();
    if (what === 'headline') Object.assign(s, { headline: text, headlineAt: now() });
    else if (what === 'note') ((s.phases[(await phaseOf()).id] ??= {}).note = text);
    else fail(`set ${what}: only headline or note`);
    save(s);
  },

  // A roadmap row gets an override (its label is the key); a hand item is changed in place;
  // --new adds a hand item. The match must be unique.
  async item() {
    const [match] = pos;
    if (!match) fail('usage: item <label match> [--pr N] [--status s] [--owner name] [--note text]');
    const change = {};
    if (flag('pr')) change.pr = Number(flag('pr').replace('#', ''));
    if (flag('status')) change.status = flag('status');
    if (flag('owner')) change.owner = flag('owner');
    if (flag('note') !== undefined) change.note = flag('note');
    if (DONE.test(change.status ?? '') && !change.pr) fail('an item is done when its PR merged: pass --pr, the board derives done from it');
    const { id, derived } = await phaseOf();
    const s = state();
    const hand = (s.phases[id] ??= {});
    hand.items ??= [];
    if (flags.new) {
      hand.items.push({ label: match, ...change });
      return save(s);
    }
    const m = match.toLowerCase();
    const own = hand.items.filter((it) => it.label.toLowerCase().includes(m));
    const rows = (derived?.items ?? []).filter((it) => it.label.toLowerCase().includes(m));
    const all = [...own.map((it) => it.label), ...rows.map((it) => it.label)];
    if (all.length !== 1) fail(all.length ? `"${match}" matches ${all.length} items: ${all.join(' | ')}` : `no item matches "${match}" (add one with --new)`);
    if (own.length) Object.assign(own[0], change);
    else Object.assign(((hand.overrides ??= {})[rows[0].label] ??= {}), change);
    save(s);
  },

  async journey() {
    const [jid] = pos;
    if (!jid) fail('usage: journey <id> [--status s] [--note text] [--evidence url]');
    if (DONE.test(flag('status') ?? '') && !flag('evidence')) fail('a journey is done only with evidence (a gate run or a live check): pass --evidence');
    const { id } = await phaseOf();
    const s = state();
    const j = (((s.phases[id] ??= {}).journeys ??= {})[jid] ??= {});
    if (flag('status')) j.status = flag('status');
    if (flag('note') !== undefined) j.note = flag('note');
    if (flag('evidence')) j.evidence = flag('evidence');
    j.at = now();
    save(s);
  },

  async criterion() {
    const [cid, status] = pos;
    if (!status) fail('usage: criterion <id> <status> [--evidence url]');
    if (DONE.test(status) && !flag('evidence')) fail(`criterion ${cid} is done only with evidence: pass --evidence <run or trace url>`);
    const { id } = await phaseOf();
    const s = state();
    const p = (s.phases[id] ??= {});
    (p.criteria ??= {})[cid] = DONE.test(status) ? 'done' : status;
    if (flag('evidence')) (p.evidence ??= {})[cid] = flag('evidence');
    save(s);
  },

  session() {
    const [name, note] = pos;
    if (note === undefined) fail('usage: session <name> "<note>"');
    const s = state();
    s.sessions[name] = note;
    save(s);
  },

  // The recommended option goes first; the page always offers free text as well.
  ask() {
    const [qid] = pos;
    const options = (flags.option ?? []).map((o) => {
      const [label, ...d] = o.split('|');
      return { label: label.trim(), description: d.join('|').trim() };
    });
    if (!qid || !flag('title') || options.length === 0) fail('usage: ask <id> --title t [--body b] --option "label|description" … [--recommended n]');
    const rec = Number(flag('recommended') ?? 0);
    if (rec) {
      if (!options[rec - 1]) fail(`--recommended ${rec}: there are ${options.length} options`);
      const [r] = options.splice(rec - 1, 1);
      options.unshift({ ...r, recommended: true });
    }
    const qs = readJson('questions.json', []);
    if (qs.some((q) => q.id === qid)) fail(`a question ${qid} exists already`);
    qs.push({ id: qid, title: flag('title'), body: flag('body') ?? '', options, at: now() });
    writeJson('questions.json', qs);
    save(state());
  },

  outcome() {
    const [qid, text] = pos;
    if (!text) fail('usage: outcome <question id> "<what was done>"');
    if (!readJson('questions.json', []).some((q) => q.id === qid)) fail(`no question ${qid}`);
    const s = state();
    (s.outcomes ??= {})[qid] = { text, at: now() };
    save(s);
  },

  // Prints answers appended since the last call (a byte offset in answers.cursor), one JSON line
  // each with the question's title and the chosen option's label. Watches the file, never processes.
  async answers() {
    const path = file('answers.jsonl');
    const cursor = file('answers.cursor');
    const from = existsSync(cursor) ? Number(readFileSync(cursor, 'utf8')) || 0 : 0;
    const size = () => (existsSync(path) ? statSync(path).size : 0);
    if (flags.wait && size() <= from) {
      await new Promise((done) => {
        watchFile(path, { interval: 1000 }, () => {
          if (size() > from) {
            unwatchFile(path);
            done();
          }
        });
      });
    }
    const end = size();
    if (end <= from) return;
    const buf = Buffer.alloc(end - from);
    const fd = openSync(path, 'r');
    readSync(fd, buf, 0, buf.length, from);
    closeSync(fd);
    const qs = new Map(readJson('questions.json', []).map((q) => [q.id, q]));
    for (const line of buf.toString('utf8').split('\n').filter(Boolean)) {
      const a = JSON.parse(line);
      const q = qs.get(a.id);
      console.log(JSON.stringify({ id: a.id, title: q?.title, choice: a.choice != null ? q?.options[a.choice]?.label : null, text: a.text, at: a.at }));
    }
    writeFileSync(cursor, String(end));
  },

  async stale() {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/api/stale`)).json();
      for (const x of list) console.log(`${x.kind}\t${x.id}\t${x.why}`);
      if (!list.length) console.log('nothing stale');
    } catch {
      fail(`the board server is not running on port ${port} (lc-board start)`);
    }
  },

  // Running-log lines added since the last call; the offset is kept in log.cursor.
  log() {
    if (!runningLog || !existsSync(runningLog)) fail('no running log: set board.running_log in .agents/project.yaml');
    const cursor = file('log.cursor');
    const end = statSync(runningLog).size;
    // The first call starts at the end: the keeper needs what happens from now on, not the history.
    if (!existsSync(cursor)) {
      writeFileSync(cursor, String(end));
      return console.log(`(log cursor set at the end of ${runningLog}; earlier lines skipped)`);
    }
    let from = Number(readFileSync(cursor, 'utf8')) || 0;
    if (end < from) from = 0;
    if (end > from) {
      const buf = Buffer.alloc(end - from);
      const fd = openSync(runningLog, 'r');
      readSync(fd, buf, 0, buf.length, from);
      closeSync(fd);
      process.stdout.write(buf.toString('utf8'));
    }
    writeFileSync(cursor, String(end));
  },
};

if (!commands[cmd]) fail(`unknown command ${cmd ?? ''}; see the top of board/cli.mjs`);
await commands[cmd]();
