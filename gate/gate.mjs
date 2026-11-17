// lc-gate: a gate's steps, declared in .agents/project.yaml, each leaving a record; `check` refuses
// when a step has no valid record. Node 18+, no dependencies.
//
//   lc-gate record <gate> <id> <step> pass|fail|na --evidence <path|url> [--reason …] [--carry]
//   lc-gate status <gate> <id> [--candidate <sha>]
//   lc-gate check <gate> <id> [--candidate <sha>]      exits 1 listing missing, stale or failed steps
//
// A gate is `phase` or `pr`; its steps are the block `gate_<gate>:` of the project file, one line
// each: `<step>: <kind> <argument> [if <paths key>]`, kind command, workflow, session, here or owner.
// State: <handoff_dir>/gates/<gate>/<id>/ (else <repo>/.agents/gates/…): gate.json (candidate, base),
// records/<step>.json (step, status, sha, evidence, by, at, reason; carried, spawned), findings/,
// evidence/, briefs/.
// Who may record: a session lc-spawn started for a gate step has LC_GATE_STEP=<gate>/<id>/<step>; it
// records only that step, only with findings/<step>.md present, and never N/A or a carry. Any other
// caller is the lead (`by` is LC_SESSION, else "lead").
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../board/config.mjs';

export const KINDS = ['command', 'workflow', 'session', 'here', 'owner'];
const STATUS = ['pass', 'fail', 'na'];

class GateError extends Error {}
const die = (msg) => {
  throw new GateError(msg);
};

// A child process with a timeout that fails visibly. Returns { status, stdout, stderr }.
export function exec(cmd, args, { cwd, timeout = 30_000, env, ok = false } = {}) {
  const r = spawnSync(cmd, args, { cwd, timeout, env, encoding: 'utf8', maxBuffer: 64 << 20 });
  const line = `${cmd} ${args.join(' ')}`.slice(0, 160);
  if (r.error?.code === 'ETIMEDOUT') die(`${line}: timed out after ${timeout / 1000}s`);
  if (r.error) die(`${line}: ${r.error.message}`);
  if (r.status !== 0 && !ok) die(`${line}: exit ${r.status}: ${r.stderr.trim().split('\n').at(-1) ?? ''}`);
  return r;
}
const git = (repo, ...args) => exec('git', ['-C', repo, ...args]).stdout.trim();

// --- the step list -----------------------------------------------------------------------------

// The steps of `gate_<gate>:` in file order: { id, kind, arg, if }.
export function parseSteps(conf, gate) {
  const steps = [];
  const prefix = `gate_${gate}.`;
  for (const [key, value] of Object.entries(conf)) {
    if (!key.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    const m = value.match(/^(\S+)\s*(.*?)(?:\s+if\s+([\w-]+))?$/);
    if (!m || !KINDS.includes(m[1])) die(`${prefix}${id}: "${value}" is not "<kind> <argument> [if <paths key>]" with kind ${KINDS.join(', ')}`);
    if (m[3] && !conf[`paths.${m[3]}`]) die(`${prefix}${id}: "if ${m[3]}" names no paths.${m[3]}`);
    steps.push({ id, kind: m[1], arg: m[2], if: m[3] ?? null });
  }
  return steps;
}

// --- the check ---------------------------------------------------------------------------------

// Problems with a gate's records for candidate `sha`, one line per step; none means the gate holds.
// `records` maps a step id to its record; `current(recordSha)` says whether a record's commit
// counts for the candidate (exact match, or the PR gate's update-branch rule, prCurrent).
export function check(steps, records, sha, current = (s) => s === sha) {
  const problems = [];
  for (const s of steps) {
    const r = records[s.id];
    const who = r?.spawned ? `spawned session ${r.by}` : '';
    if (!r) problems.push(`${s.id}: missing`);
    else if (!STATUS.includes(r.status)) problems.push(`${s.id}: unknown status ${r.status}`);
    else if (!r.sha || !current(r.sha)) problems.push(`${s.id}: recorded for ${String(r.sha).slice(0, 12)}, not the candidate ${sha.slice(0, 12)}`);
    else if (r.status === 'fail') problems.push(`${s.id}: FAIL${r.reason ? ` (${r.reason})` : ''}`);
    else if (r.status === 'na' && !r.reason?.trim()) problems.push(`${s.id}: N/A without a reason`);
    else if (r.status === 'na' && who) problems.push(`${s.id}: N/A recorded by ${who}; only the lead may`);
    else if (r.carried && who) problems.push(`${s.id}: carried by ${who}; only the lead may`);
    else if (r.carried && !r.reason?.trim()) problems.push(`${s.id}: carried without a reason`);
  }
  return problems;
}

// The PR gate's rule: a record made at `sha` holds for head `head` when sha is the head, or an
// ancestor of it with only merges between them on the first-parent line (`gh pr update-branch`).
export function prCurrent(repo, head) {
  const memo = new Map();
  return (sha) => {
    if (sha === head) return true;
    if (!memo.has(sha)) {
      const ancestor = exec('git', ['-C', repo, 'merge-base', '--is-ancestor', sha, head], { ok: true }).status === 0;
      memo.set(sha, ancestor && git(repo, 'rev-list', '--no-merges', '--first-parent', `${sha}..${head}`) === '');
    }
    return memo.get(sha);
  };
}

// --- state -------------------------------------------------------------------------------------

export function gateDir(cfg, gate, id) {
  return join(cfg.handoffDir || join(cfg.repo, '.agents'), 'gates', gate, id);
}
const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
const writeJson = (file, value) => {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n');
  renameSync(`${file}.tmp`, file);
};
export function readRecords(dir) {
  const out = {};
  const rdir = join(dir, 'records');
  if (!existsSync(rdir)) return out;
  for (const f of readdirSync(rdir).filter((f) => f.endsWith('.json'))) {
    const r = readJson(join(rdir, f));
    out[r.step] = r;
  }
  return out;
}
const nonEmpty = (path) => existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;
const isUrl = (s) => /^https?:\/\//.test(s ?? '');

// The gate as the commands see it: config, steps, state dir, stored candidate and records.
function load(repo, gate, id) {
  if (gate !== 'phase' && gate !== 'pr') die(`gate must be phase or pr, not ${gate}`);
  if (!id) die(`which ${gate}? pass its id`);
  const cfg = loadConfig(repo);
  const steps = parseSteps(cfg.conf, gate);
  if (!steps.length) die(`no gate_${gate}: block in ${join(cfg.repo, '.agents/project.yaml')}`);
  const dir = gateDir(cfg, gate, id);
  return { cfg, steps, dir, state: readJson(join(dir, 'gate.json'), {}), records: readRecords(dir) };
}

function candidateOf(g, flags) {
  const sha = flags.candidate ? git(g.cfg.repo, 'rev-parse', '--verify', `${flags.candidate}^{commit}`) : g.state.candidate;
  if (!sha) die(`no candidate yet for this gate: lc-gate run it, or pass --candidate`);
  return sha;
}
const currentFor = (g, gate, sha) => (gate === 'pr' ? prCurrent(g.cfg.repo, sha) : (s) => s === sha);

// --- commands ----------------------------------------------------------------------------------

function record(repo, [gate, id, step, status], flags) {
  const g = load(repo, gate, id);
  const s = g.steps.find((x) => x.id === step);
  if (!s) die(`no step ${step} in gate_${gate}; steps: ${g.steps.map((x) => x.id).join(', ')}`);
  if (!STATUS.includes(status)) die(`status must be pass, fail or na, not ${status}`);
  const sha = candidateOf(g, flags);
  const own = process.env.LC_GATE_STEP;
  const reason = flags.reason?.trim() || '';
  if (own) {
    if (own !== `${gate}/${id}/${step}`) die(`this session is step ${own}; it may record only that step`);
    if (status === 'na') die('a spawned session may not record N/A; only the lead may');
    if (flags.carry) die('a spawned session may not carry a record; only the lead may');
    if (!nonEmpty(join(g.dir, 'findings', `${step}.md`))) die(`write findings/${step}.md in ${g.dir} first`);
  }
  const old = g.records[step];
  let evidence = flags.evidence ?? '';
  if (flags.carry) {
    if (!old) die(`nothing to carry: ${step} has no record`);
    if (old.sha === sha) die(`${step} is already recorded for the candidate`);
    if (!reason) die('a carry needs --reason');
    evidence ||= old.evidence;
  } else if (status === 'na') {
    if (!reason) die('N/A needs --reason');
  } else {
    if (!evidence) die(`${status} needs --evidence <path|url>`);
    if (!isUrl(evidence)) {
      evidence = resolve(evidence);
      if (!nonEmpty(evidence)) die(`evidence ${evidence} is missing or empty`);
    }
    if ((s.kind === 'session' || s.kind === 'here') && isUrl(evidence)) die(`a ${s.kind} step's evidence is a file, so the phase record can carry it`);
  }
  const rec = { step, status, sha, evidence, by: process.env.LC_SESSION || 'lead', at: new Date().toISOString(), reason };
  if (flags.carry) rec.carried = { from: old.sha, at: old.at };
  if (own) rec.spawned = true;
  if (!g.state.candidate) writeJson(join(g.dir, 'gate.json'), { gate, id, candidate: sha });
  writeJson(join(g.dir, 'records', `${step}.json`), rec);
  console.log(`recorded ${gate} ${id} ${step}: ${status}${rec.carried ? ' (carried)' : ''} for ${sha.slice(0, 12)}`);
}

const label = (r) => (r ? `${r.status === 'na' ? 'N/A' : r.status.toUpperCase()}${r.carried ? ' carried' : ''}` : '-');

function status(repo, [gate, id], flags) {
  const g = load(repo, gate, id);
  const sha = candidateOf(g, flags);
  const current = currentFor(g, gate, sha);
  const problems = check(g.steps, g.records, sha, current);
  const rows = [['step', 'kind', 'status', 'commit', 'by', 'evidence / reason']];
  for (const s of g.steps) {
    const r = g.records[s.id];
    const stale = r && !current(r.sha) ? ' (stale)' : '';
    rows.push([s.id, s.kind, label(r) + stale, r ? r.sha.slice(0, 12) : '', r?.by ?? '', [r?.evidence, r?.reason].filter(Boolean).join(' · ')]);
  }
  const width = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`${gate} ${id}, candidate ${sha}`);
  for (const r of rows) console.log(r.map((c, i) => (i < r.length - 1 ? c.padEnd(width[i]) : c)).join('  ').trimEnd());
  console.log(problems.length ? `\n${problems.length} step(s) not done:\n  ${problems.join('\n  ')}` : '\nevery step holds');
}

function checkGate(repo, [gate, id], flags) {
  const g = load(repo, gate, id);
  const sha = candidateOf(g, flags);
  const problems = check(g.steps, g.records, sha, currentFor(g, gate, sha));
  if (problems.length) {
    console.error(`lc-gate: ${gate} ${id} at ${sha.slice(0, 12)} does not hold:\n  ${problems.join('\n  ')}`);
    return 1;
  }
  console.log(`${gate} ${id} holds at ${sha}`);
  return 0;
}

// --- main --------------------------------------------------------------------------------------

const BOOLEAN = new Set(['carry']);
function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) pos.push(a);
    else if (BOOLEAN.has(a.slice(2))) flags[a.slice(2)] = true;
    else if (argv[i + 1] === undefined) die(`${a} needs a value`);
    else flags[a.slice(2)] = argv[++i];
  }
  return { pos, flags };
}

export function main(argv, cwd = process.cwd()) {
  const [cmd, ...rest] = argv;
  const repo = exec('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { ok: true }).stdout.trim() || cwd;
  const { pos, flags } = parseArgs(rest);
  const commands = { record, status, check: checkGate };
  if (!commands[cmd]) die(`usage: lc-gate record|status|check …; see the top of gate/gate.mjs`);
  return commands[cmd](repo, pos, flags) ?? 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof GateError)) throw err;
    console.error(`lc-gate: ${err.message}`);
    process.exitCode = 1;
  }
}
