// lc-gate: a gate's steps, declared in .agents/project.yaml, each leaving a record; `check` refuses
// when a step has no valid record. Node 18+, no dependencies.
//
//   lc-gate run <phase|pr> [id] [--candidate <sha>] [--base <sha>] [--rerun <step>[,<step>]]
//                       idempotent walk: each step without a record gets the next thing for its kind;
//                       a session step stale on a new candidate waits for --rerun or a carry
//   lc-gate record <gate> <id> <step> pass|fail|na --evidence <path|url> [--reason …] [--carry]
//   lc-gate status <gate> <id> [--candidate <sha>] [--write] [--trailer]
//                       a table; --write generates the phase record, --trailer prints Verified-By
//   lc-gate check <gate> <id> [--candidate <sha>]      exits 1 listing missing, stale or failed steps
//   lc-gate check phase --diff <base> <head>           the CI form, on the roadmap and phase records
//   lc-gate hook        the PreToolUse hook (hooks/hooks.json): the PR gate at its start and at merge
//
// Step kinds: command (runs in the repo at the candidate, records its exit), workflow (dispatches
// the GitHub workflow with -f candidate=<sha>, records the run whose title holds the candidate),
// session (writes a brief from templates/gate-brief.md and lc-spawns it), here (the session
// running the gate does it and records), owner (asks on the board; the answer is the record).
// A `session` or `workflow` step starts at once; a command, here or owner step waits until every
// step above it has a record. With `if <key>`, a diff with no file under paths.<key> is N/A.
// The PR gate's id is its branch (branchId). The phase gate needs --base on its first run.
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
import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, parseProject } from '../board/config.mjs';

export const KINDS = ['command', 'workflow', 'session', 'here', 'owner'];
const STATUS = ['pass', 'fail', 'na'];
const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMAND_TIMEOUT = 3_600_000; // a command step that runs longer is recorded as FAIL
const GH_TIMEOUT = 60_000;

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

const gatesRoot = (cfg) => join(cfg.handoffDir || join(cfg.repo, '.agents'), 'gates');
export const gateDir = (cfg, gate, id) => join(gatesRoot(cfg), gate, id);
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
// The PR gate's id: the branch name, as-is (a slash nests directories). `run pr` and the hook both use it.
export const branchId = (branch) => branch;

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
  if ((flags.write || flags.trailer) && problems.length) {
    console.error(`lc-gate: ${gate} ${id} does not hold at ${sha.slice(0, 12)}:\n  ${problems.join('\n  ')}`);
    return 1;
  }
  if (flags.trailer) {
    const steps = g.steps.map((s) => `${s.id}=${g.records[s.id].status}${g.records[s.id].carried ? '(carried)' : ''}`);
    console.log(`Verified-By: lc-gate ${gate} ${id} ${sha} ${steps.join(' ')}`);
    return 0;
  }
  if (flags.write) return writeRecord(g, gate, id, sha);
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

// --- run ---------------------------------------------------------------------------------------

const verify = (repo, rev) => git(repo, 'rev-parse', '--verify', `${rev}^{commit}`);
const mainRef = (repo) => (exec('git', ['-C', repo, 'rev-parse', '--verify', '-q', 'origin/HEAD'], { ok: true }).status === 0 ? 'origin/HEAD' : 'main');
const globRe = (glob) =>
  new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?|\*|\?/g, (m) => (m === '?' ? '[^/]' : m === '*' ? '[^/]*' : '.*'))}$`);

function run(repo, [gate, idArg], flags) {
  const id = idArg ?? (gate === 'pr' ? branchId(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')) : undefined);
  const g = load(repo, gate, id);
  const sha = flags.candidate ? verify(repo, flags.candidate) : gate === 'phase' && g.state.candidate ? g.state.candidate : verify(repo, 'HEAD');
  const base = flags.base ? verify(repo, flags.base) : gate === 'pr' ? git(repo, 'merge-base', mainRef(repo), sha) : g.state.base;
  if (!base) die(`the phase gate's first run needs --base <main before the phase's first merge>`);
  if (g.state.candidate && g.state.candidate !== sha) {
    console.log(`new candidate ${sha.slice(0, 12)} (was ${g.state.candidate.slice(0, 12)}): its records are stale; each step reruns, or the lead carries it with lc-gate record … --carry --reason`);
  }
  writeJson(join(g.dir, 'gate.json'), { gate, id, candidate: sha, base });
  const ctx = { ...g, repo, gate, id, sha, base };
  const current = currentFor(g, gate, sha);
  let diff;
  const touches = (key) => {
    diff ??= git(repo, 'diff', '--name-only', base, sha).split('\n').filter(Boolean);
    const globs = g.cfg.conf[`paths.${key}`].split(/[\s,]+/).filter(Boolean).map(globRe);
    return diff.some((f) => globs.some((re) => re.test(f)));
  };
  ctx.width = Math.max(...g.steps.map((s) => s.id.length));
  console.log(`${gate} ${id}: candidate ${sha.slice(0, 12)}, base ${base.slice(0, 12)}`);
  // --rerun <step>[,<step>]: ignore the step's record and do it again (the only way a stale session
  // step is started again on a new candidate; otherwise the lead carries it).
  const rerun = new Set((flags.rerun ?? '').split(',').filter(Boolean));
  for (const x of rerun) if (!g.steps.some((s) => s.id === x)) die(`--rerun ${x}: no such step`);
  let above = true; // every step above has a record for the candidate
  for (const s of g.steps) {
    let r = g.records[s.id] && current(g.records[s.id].sha) && !rerun.has(s.id) ? g.records[s.id] : null;
    const old = g.records[s.id];
    const waits = ['command', 'here', 'owner'].includes(s.kind) && !above;
    if (rerun.has(s.id) && s.kind === 'session') rmSync(join(g.dir, 'briefs', `${s.id}-${sha.slice(0, 12)}.md`), { force: true });
    if (r && !(s.kind === 'command' && r.status === 'fail' && !waits)) say(ctx, s, `${label(r)}, by ${r.by}${r.reason ? ` (${r.reason})` : ''}`);
    else if (!r && s.if && !touches(s.if)) r = put(ctx, s, 'na', '', `no file changed between ${base.slice(0, 12)} and ${sha.slice(0, 12)} matches paths.${s.if}`, 'lc-gate');
    else if (s.kind === 'session' && old && !rerun.has(s.id)) {
      say(ctx, s, `stale: ${label(old)} for ${old.sha.slice(0, 12)}. Rerun it with lc-gate run ${gate} ${id} --rerun ${s.id}, or carry it with lc-gate record ${gate} ${id} ${s.id} pass --carry --reason …`);
    }
    else if (waits) say(ctx, s, r ? `${label(r)}; reruns once the steps above have records` : 'waits until every step above has a record');
    else {
      try {
        r = STEP[s.kind](ctx, s) ?? r;
      } catch (err) {
        if (!(err instanceof GateError)) throw err;
        say(ctx, s, `not started: ${err.message}`);
      }
    }
    above &&= Boolean(r);
  }
  const problems = check(g.steps, readRecords(g.dir), sha, current);
  console.log(problems.length ? `${problems.length} step(s) not done; rerun lc-gate run to advance` : `every step holds: lc-gate status ${gate} ${id}${gate === 'phase' ? ' --write' : ' --trailer'}`);
  return 0;
}

function say(ctx, s, text) {
  console.log(`  ${s.id.padEnd(ctx.width)}  ${s.kind.padEnd(8)}  ${text}`);
  return null;
}

// A record the runner writes itself (a command's exit, a workflow run, an owner's answer, an `if` N/A).
function put(ctx, s, status, evidence, reason, by) {
  const rec = { step: s.id, status, sha: ctx.sha, evidence, by, at: new Date().toISOString(), reason };
  writeJson(join(ctx.dir, 'records', `${s.id}.json`), rec);
  say(ctx, s, `${label(rec)}${reason ? ` (${reason})` : ''}`);
  return rec;
}

// What `run` does for a step without a record; returns the record when it wrote one.
const STEP = {
  command(ctx, s) {
    const head = git(ctx.repo, 'rev-parse', 'HEAD');
    if (head !== ctx.sha) return say(ctx, s, `check out the candidate ${ctx.sha.slice(0, 12)} to run it (HEAD is ${head.slice(0, 12)})`);
    const evidence = join(ctx.dir, 'evidence');
    mkdirSync(evidence, { recursive: true });
    const log = join(evidence, `${s.id}.log`);
    say(ctx, s, `running: ${s.arg}`);
    const fd = openSync(log, 'w');
    const env = { ...process.env, LC_GATE_CANDIDATE: ctx.sha, LC_GATE_BASE: ctx.base, LC_GATE_EVIDENCE: evidence };
    const r = spawnSync('bash', ['-c', s.arg], { cwd: ctx.repo, stdio: ['ignore', fd, fd], timeout: COMMAND_TIMEOUT, env });
    closeSync(fd);
    const why = r.error?.code === 'ETIMEDOUT' ? `timed out after ${COMMAND_TIMEOUT / 1000}s` : r.error ? r.error.message : r.status ? `exit ${r.status}` : r.signal ? `killed by ${r.signal}` : '';
    return put(ctx, s, why ? 'fail' : 'pass', log, why ? `${why}; log ${log}` : '', 'lc-gate');
  },

  // The run is bound to the candidate by its title (the workflow's run-name holds the candidate SHA),
  // not by head_sha: a dispatched run reports the head of the branch it ran from.
  workflow(ctx, s) {
    const out = exec('gh', ['run', 'list', '--workflow', s.arg, '--limit', '50', '--json', 'displayTitle,status,conclusion,url'], { cwd: ctx.repo, timeout: GH_TIMEOUT });
    const found = JSON.parse(out.stdout).find((x) => x.displayTitle.includes(ctx.sha));
    const marker = join(ctx.dir, 'evidence', `${s.id}.dispatched`);
    if (!found) {
      if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === ctx.sha) return say(ctx, s, `dispatched; no run titled with ${ctx.sha.slice(0, 12)} yet (does its run-name hold inputs.candidate?)`);
      exec('gh', ['workflow', 'run', s.arg, '-f', `candidate=${ctx.sha}`], { cwd: ctx.repo, timeout: GH_TIMEOUT });
      mkdirSync(dirname(marker), { recursive: true });
      writeFileSync(marker, ctx.sha);
      return say(ctx, s, `dispatched ${s.arg} for ${ctx.sha.slice(0, 12)}`);
    }
    if (found.status !== 'completed') return say(ctx, s, `${found.status}: ${found.url}`);
    return put(ctx, s, found.conclusion === 'success' ? 'pass' : 'fail', found.url, found.conclusion === 'success' ? '' : `concluded ${found.conclusion}`, 'lc-gate');
  },

  session(ctx, s) {
    const name = `gate-${ctx.id}-${s.id}`.replace(/[^\w.-]/g, '-');
    const brief = join(ctx.dir, 'briefs', `${s.id}-${ctx.sha.slice(0, 12)}.md`);
    if (existsSync(brief)) return say(ctx, s, `session ${name} started; waiting for its record`);
    const findings = join(ctx.dir, 'findings', `${s.id}.md`);
    mkdirSync(dirname(findings), { recursive: true });
    mkdirSync(dirname(brief), { recursive: true });
    // Findings of an earlier candidate are kept beside, so the new session starts from an empty file.
    if (existsSync(findings)) renameSync(findings, join(ctx.dir, 'findings', `${s.id}.before-${ctx.sha.slice(0, 12)}.md`));
    const values = { gate: ctx.gate, id: ctx.id, step: s.id, session: name, question: s.arg, base: ctx.base, candidate: ctx.sha, evidence: join(ctx.dir, 'evidence'), findings };
    writeFileSync(brief, readFileSync(join(KIT, 'templates/gate-brief.md'), 'utf8').replace(/\{\{(\w+)\}\}/g, (_, k) => values[k]));
    try {
      exec(join(KIT, 'bin/lc-spawn'), [name, ctx.repo, brief], { cwd: ctx.repo, timeout: 30_000, env: { ...process.env, LC_GATE_STEP: `${ctx.gate}/${ctx.id}/${s.id}` } });
    } catch (err) {
      unlinkSync(brief); // the brief marks a started session; the next run tries again
      throw err;
    }
    return say(ctx, s, `started session ${name}; brief ${brief}`);
  },

  here(ctx, s) {
    return say(ctx, s, `yours: ${s.arg}. Then lc-gate record ${ctx.gate} ${ctx.id} ${s.id} pass|fail --evidence <file>`);
  },

  // One board question per candidate; the owner's last answer to it is the record.
  owner(ctx, s) {
    const qid = `gate-${ctx.gate}-${ctx.id}-${s.id}-${ctx.sha.slice(0, 7)}`.replace(/[^\w.-]/g, '-');
    const data = ctx.cfg.dataDir;
    if (!readJson(join(data, 'questions.json'), []).some((q) => q.id === qid)) {
      mkdirSync(data, { recursive: true });
      const body = s.arg || `Every step before this one holds at ${ctx.sha}.`;
      exec(join(KIT, 'bin/lc-board'), ['ask', qid, '--title', `${ctx.gate} ${ctx.id}: ${s.id} at ${ctx.sha.slice(0, 12)}`, '--body', body, '--option', 'Accept|The candidate is accepted', '--option', 'Not yet|Say in the note what is missing'], { cwd: ctx.repo, timeout: 30_000 });
      return say(ctx, s, `asked the owner on the board (${qid})`);
    }
    const answers = existsSync(join(data, 'answers.jsonl')) ? readFileSync(join(data, 'answers.jsonl'), 'utf8').split('\n').filter(Boolean) : [];
    const answer = answers.map((l) => { try { return JSON.parse(l); } catch { return {}; } }).filter((a) => a.id === qid).at(-1);
    if (!answer) return say(ctx, s, `waiting for the owner's answer to ${qid} on the board`);
    const accepted = answer.choice === 0;
    return put(ctx, s, accepted ? 'pass' : 'fail', `board answer ${qid}`, answer.text?.trim() || (accepted ? '' : 'not accepted'), 'owner');
  },
};

// --- the phase record --------------------------------------------------------------------------

const cell = (v) => String(v ?? '').replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ');

// <docs.phase_records>/<id>.md, with each session and here step's evidence copied to <id>/<step>.<ext>
// so the record and its evidence are committed together.
function writeRecord(g, gate, id, sha) {
  if (gate !== 'phase') die('--write is for the phase gate');
  const dirRel = g.cfg.conf['docs.phase_records']?.replace(/\/$/, '');
  if (!dirRel) die('set docs.phase_records in .agents/project.yaml');
  const file = join(g.cfg.repo, dirRel, `${id}.md`);
  const rows = g.steps.map((s) => {
    const r = g.records[s.id];
    let evidence = r.evidence;
    if ((s.kind === 'session' || s.kind === 'here') && r.status !== 'na' && evidence && !isUrl(evidence)) {
      const to = join(g.cfg.repo, dirRel, id, `${s.id}${extname(evidence) || '.md'}`);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(evidence, to);
      evidence = relative(g.cfg.repo, to);
    } else if (s.kind === 'command') evidence = r.status === 'na' ? '' : `\`${s.arg}\` ${r.status === 'pass' ? 'exit 0' : r.reason}`;
    const reason = r.carried ? `carried from ${r.carried.from.slice(0, 12)}: ${r.reason}` : r.reason;
    return `| ${s.id} | ${s.kind} | ${label(r)} | ${r.sha} | ${cell(r.by)}${r.spawned ? ' (spawned)' : ''} | ${cell(evidence)} | ${cell(reason)} |`;
  });
  const text = [
    `# Phase record: ${id}`,
    '',
    `Generated by \`lc-gate status phase ${id} --write\`; \`lc-gate check phase --diff\` reads it. One row per step of \`gate_phase\`.`,
    '',
    `- **Gate:** phase ${id}`,
    `- **Candidate:** ${sha}`,
    `- **Base:** ${g.state.base ?? ''}`,
    `- **Generated:** ${new Date().toISOString()}`,
    '',
    '| Step | Kind | Status | Commit | By | Evidence | Reason |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  console.log(`wrote ${relative(g.cfg.repo, file)}; commit it with the roadmap line that marks the phase done and links it`);
  return 0;
}

// A phase marked done on an added roadmap line: its **Status:** line, or its heading's (…).
const DONE = /(\*\*Status:\*\*\s*(done|exited|closed)\b|^## .*\((done|exited|closed)\))/i;

// The CI form: every roadmap line the diff adds that marks a phase done links a phase record, and
// every phase record linked or changed holds for its candidate against the steps declared at head.
function checkPhaseDiff(repo, baseRev, headRev) {
  if (!baseRev || !headRev) die('usage: lc-gate check phase --diff <base> <head>');
  const [base, head] = [verify(repo, baseRev), verify(repo, headRev)];
  const show = (path) => {
    const r = exec('git', ['-C', repo, 'show', `${head}:${path}`], { ok: true });
    return r.status === 0 ? r.stdout : null;
  };
  const conf = parseProject(show('.agents/project.yaml') ?? die('no .agents/project.yaml at the head'));
  const steps = parseSteps(conf, 'phase');
  const roadmap = conf['docs.roadmap'];
  const recDir = conf['docs.phase_records']?.replace(/\/$/, '');
  if (!roadmap || !recDir) die('the project file at the head needs docs.roadmap and docs.phase_records');
  const records = new Set();
  const problems = [];
  const added = git(repo, 'diff', '-U0', base, head, '--', roadmap).split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  for (const line of added.map((l) => l.slice(1))) {
    if (!DONE.test(line)) continue;
    const links = [...line.matchAll(/\]\(([^)\s#]+\.md)/g)].map((m) => m[1]).filter((t) => t.includes(`${basename(recDir)}/`));
    if (!links.length) problems.push(`${roadmap}: a phase is marked done without a link to its record: ${line.trim().slice(0, 120)}`);
    for (const t of links) records.add(posix.join(recDir, basename(t)));
  }
  for (const path of git(repo, 'diff', '--name-only', '--no-renames', '--diff-filter=AM', base, head, '--', recDir).split('\n')) {
    if (path.endsWith('.md') && posix.dirname(path) === recDir && show(path)?.includes('**Gate:** phase')) records.add(path);
  }
  if (records.size && !steps.length) problems.push('the project file at the head declares no gate_phase steps');
  for (const path of [...records].sort()) problems.push(...checkRecord(repo, head, path, show(path), steps));
  for (const p of problems) console.error(p);
  console.log(`phase exit check: ${records.size} record(s), ${problems.length} problem(s)`);
  return problems.length ? 1 : 0;
}

function checkRecord(repo, head, path, text, steps) {
  if (text === null) return [`${path}: the record doesn't exist at the head`];
  const candidate = text.match(/^\s*-?\s*\*\*Candidate:\*\*\s*`?([0-9a-f]{40})\b/m)?.[1];
  if (!candidate) return [`${path}: no **Candidate:** line with a full commit SHA`];
  const rows = {};
  for (const line of text.split('\n')) {
    const c = line.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    if (!line.trim().startsWith('|') || c.length < 7 || c[0] === 'Step' || /^-+$/.test(c[0])) continue;
    const [step, , st, sha, by, evidence, reason] = c;
    const status = /^PASS/.test(st) ? 'pass' : /^FAIL/.test(st) ? 'fail' : /^N\/A/.test(st) ? 'na' : st;
    rows[step] = { step, status, sha, by: by.replace(/ \(spawned\)$/, ''), spawned: by.endsWith('(spawned)'), carried: /carried/i.test(st) ? {} : undefined, evidence, reason };
  }
  const problems = check(steps, rows, candidate).map((p) => `${path}: ${p}`);
  for (const s of steps) {
    const r = rows[s.id];
    if (r?.status !== 'pass' || r.sha !== candidate) continue;
    if (s.kind === 'workflow') problems.push(...checkRun(path, s, r.evidence, candidate));
    if ((s.kind === 'session' || s.kind === 'here') && !(Number(exec('git', ['-C', repo, 'cat-file', '-s', `${head}:${r.evidence}`], { ok: true }).stdout.trim()) > 0)) {
      problems.push(`${path}: ${s.id}: evidence ${r.evidence || '(none)'} is missing or empty at the head`);
    }
  }
  return problems;
}

function checkRun(path, s, url, candidate) {
  const id = url.match(/\/actions\/runs\/(\d+)/)?.[1];
  if (!id) return [`${path}: ${s.id}: no workflow run URL`];
  const out = exec('gh', ['api', `repos/${process.env.GITHUB_REPOSITORY || '{owner}/{repo}'}/actions/runs/${id}`], { timeout: GH_TIMEOUT, ok: true });
  if (out.status) return [`${path}: ${s.id}: run ${id} can't be read: ${out.stderr.trim()}`];
  const run = JSON.parse(out.stdout);
  const problems = [];
  if (!String(run.path ?? '').split('@')[0].endsWith(s.arg)) problems.push(`${path}: ${s.id}: run ${id} is ${run.path}, not ${s.arg}`);
  if (run.conclusion !== 'success') problems.push(`${path}: ${s.id}: run ${id} concluded ${run.conclusion}, not success`);
  if (!String(run.display_title ?? '').includes(candidate)) problems.push(`${path}: ${s.id}: run ${id}'s title "${run.display_title}" doesn't name the candidate`);
  return problems;
}

// --- the board's rows --------------------------------------------------------------------------

// The four most recently run gates of a repository, with one row per declared step (board/server.mjs).
export function gateRows(repo) {
  const cfg = loadConfig(repo);
  const root = gatesRoot(cfg);
  if (!existsSync(root)) return [];
  const out = [];
  for (const f of readdirSync(root, { recursive: true }).filter((f) => basename(String(f)) === 'gate.json')) {
    const dir = join(root, dirname(String(f)));
    const st = readJson(join(dir, 'gate.json'), {});
    let steps;
    try {
      steps = parseSteps(cfg.conf, st.gate);
    } catch {
      continue;
    }
    const records = readRecords(dir);
    out.push({
      gate: st.gate,
      id: st.id,
      candidate: st.candidate,
      at: Math.max(statSync(join(dir, 'gate.json')).mtimeMs, ...Object.keys(records).map((k) => Date.parse(records[k].at) || 0)),
      problems: check(steps, records, st.candidate ?? '').length,
      steps: steps.map((s) => {
        const r = records[s.id];
        return { id: s.id, kind: s.kind, status: !r ? 'open' : r.sha !== st.candidate ? 'stale' : r.status, carried: Boolean(r?.carried), by: r?.by ?? '', reason: r?.reason ?? '' };
      }),
    });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 4);
}

// --- the hook ----------------------------------------------------------------------------------

// PreToolUse on Bash (hooks/hooks.json filters to the gate start and the merge). Reads the hook's
// JSON on stdin. Does nothing without gate_pr or with gate_pr_mode off; observe (the default) logs
// to <gates>/observe.log and tells the session what enforce would refuse; enforce exits 2 with the
// missing steps. Its own errors are logged and let the command through.
function hook(_repo, _pos, _flags, stdin = readFileSync(0, 'utf8')) {
  let log = null;
  const note = (entry) => log && appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
  try {
    const input = JSON.parse(stdin);
    const command = String(input.tool_input?.command ?? '');
    const point = /\bno-mistakes\s+axi\s+run\b/.test(command) ? 'gate start' : /\bgh\s+pr\s+merge\b/.test(command) ? 'merge' : null;
    if (!point) return 0;
    // `cd <dir> && …` runs the gate or the merge from <dir>.
    const cd = command.match(/(?:^|&&|;)\s*cd\s+("[^"]+"|'[^']+'|\S+)\s*&&/)?.[1]?.replace(/^["']|["']$/g, '');
    const cwd = resolve(input.cwd || process.cwd(), cd ?? '.');
    const repo = exec('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { ok: true }).stdout.trim();
    if (!repo || !existsSync(join(repo, '.agents/project.yaml'))) return 0;
    const cfg = loadConfig(repo);
    const mode = cfg.conf.gate_pr_mode || 'observe';
    const steps = parseSteps(cfg.conf, 'pr');
    if (!steps.length || mode === 'off') return 0;
    mkdirSync(gatesRoot(cfg), { recursive: true });
    log = join(gatesRoot(cfg), 'observe.log');
    let branch;
    let head;
    if (point === 'merge') {
      const pr = command.match(/\bgh\s+pr\s+merge\b[^;&|\n]*?(?:\/pull\/|\s#?)(\d+)(?=\s|$|[;&|])/)?.[1];
      const view = JSON.parse(exec('gh', ['pr', 'view', ...(pr ? [pr] : []), '--json', 'headRefName,headRefOid'], { cwd: repo, timeout: GH_TIMEOUT }).stdout);
      [branch, head] = [view.headRefName, view.headRefOid];
    } else {
      [branch, head] = [git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD'), git(cwd, 'rev-parse', 'HEAD')];
    }
    const id = branchId(branch);
    const missing = check(steps, readRecords(gateDir(cfg, 'pr', id)), head, prCurrent(repo, head));
    if (!missing.length) return 0;
    const session = process.env.LC_SESSION || input.session_id || '';
    const what = `the PR gate for ${branch} at ${head.slice(0, 12)} does not hold:\n  ${missing.join('\n  ')}\nRun lc-gate run pr ${id}, then record each step.`;
    if (mode === 'enforce') {
      note({ mode, point, branch, head, missing, session, refused: true });
      process.stderr.write(`lc-gate: ${what}\n`);
      return 2;
    }
    note({ mode, point, branch, head, missing, session });
    const context = `lc-gate (observe mode): this ${point} went ahead, but enforce mode would have refused it: ${what}`;
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: context } }));
    return 0;
  } catch (err) {
    try {
      note({ error: err.message });
    } catch {
      // nowhere to log
    }
    process.stderr.write(`lc-gate hook: ${err.message} (the command goes ahead)\n`);
    return 0;
  }
}

// --- main --------------------------------------------------------------------------------------

const BOOLEAN = new Set(['carry', 'write', 'trailer']);
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
  const commands = { run, record, status, hook, check: (r, p, f) => (f.diff ? checkPhaseDiff(r, f.diff, p[1]) : checkGate(r, p, f)) };
  if (!commands[cmd]) die(`usage: lc-gate run|record|status|check …; see the top of gate/gate.mjs`);
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
