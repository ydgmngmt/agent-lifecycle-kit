// lc-gate: a gate's steps, declared in .agents/project.yaml, each leaving a record; `check` refuses
// when a step has no valid record. Node 18+, no dependencies.
//
//   lc-gate run <phase|pr> [id] [--candidate <sha>] [--base <sha>] [--rerun <step>[,<step>]]
//                       idempotent walk, in file order: each step without a record that holds gets the
//                       next thing for its kind; a session step stale on a new candidate waits for
//                       --rerun or a carry
//   lc-gate record <gate> <id> <step> pass|fail|na --evidence <path|url> [--reason …] [--carry]
//   lc-gate record <gate> <id> <step> plan --evidence <file> | plan na --reason …
//                       a planned step's plan, at the base, refused once the work has a commit
//   lc-gate status <gate> <id> [--candidate <sha>] [--write] [--trailer]
//                       a table; --write generates the phase record, --trailer prints Verified-By
//   lc-gate check <gate> <id> [--candidate <sha>]      exits 1 listing missing, stale or failed steps
//   lc-gate merge pr [branch]
//                       the one way a PR merges: updates a behind branch, waits for its checks step on
//                       the head (LC_GATE_MERGE_WAIT seconds, 1800), requires every record, merges with
//                       --match-head-commit and the Verified-By trailer; one merge at a time (merge.lock)
//   lc-gate check phase --diff <base> <head>           the CI form, on the roadmap and phase records
//   lc-gate plan-check [--staged] [--files <path>…]
//                       exit 1 when a planned gate_pr step applies to these files on this branch and has
//                       no plan record (gate_pr_plan: enforce); the git pre-commit hook and the edit hook
//   lc-gate hook        the PreToolUse hook (hooks/hooks.json): the PR gate at merge (gh pr merge, or
//                       git merge of a branch into the default branch);
//                       the plan on every Edit/Write and git commit, and no --no-verify while it applies
//   lc-gate enforcement [--strict] [--md]
//                       what makes each gate step binding here, layer by layer, and whether each is on
//   lc-gate protect [--yes]   branch protection on the default branch from ci.required_checks
//                       (gate/enforcement.mjs)
//   lc-gate questions <file>  a question file's questions, Q1, Q2, …: the rows a session's findings answer
//
// gate_pr_mode and gate_pr_plan are off, observe, enforce, or `observe <n>`: enforce once <n> PRs have
// merged with every record. The hook and lc-gate merge mark each merge they let through:
// gates/pr/<id>/merged.json.
//
// Step kinds: command (runs in the repo at the candidate, records its exit), workflow (dispatches
// the GitHub workflow with -f candidate=<sha>, records the run whose title holds the candidate),
// checks (no argument: the host's newest check run of each name in ci.required_checks on the exact
// commit), session (writes a brief from templates/gate-brief.md and lc-spawns it: a full review first;
// after a fail or a pass at an earlier candidate this one descends from, a follow-up review of the PR's
// own change since, `git log -p --first-parent --remerge-diff`; none after two reviews after a fix
// still fail; a PR's brief names the implementer's brief from the board's spawned.tsv), here (the
// session running the gate does it and records), owner (asks on the board; the answer is the record,
// or the lead's N/A in a scratch or dry run, which the phase record states and read-afterwards.jsonl
// in the board's data dir lists).
// A step with `after <step>[,<step>]` starts once each named step has a record that holds with PASS
// or N/A. Without it, a session, workflow or checks step starts at once, and a command, here or owner
// step waits until every step above it has a record. With `if <key>`, a diff with no file under
// paths.<key> is N/A. The PR gate's id is its branch (branchId). The phase gate needs --base on its
// first run.
//
// A gate is `phase` or `pr`; its steps are the block `gate_<gate>:` of the project file, one line
// each, walked in file order: `<step>: <kind> <argument> [if <paths key>] [plan] [after <step>[,<step>]]`,
// kind command, workflow, checks, session, here or owner; `after` names steps declared above. A here
// or session step with `plan`, or a command step with `plan` and `after`, also needs
// records/<step>.plan.json, made before the first commit of the work (an N/A plan, from the lead, when
// the work had commits before the gate saw it).
// A PR record holds for a later head when every commit between is a merge of main with no hand-resolved
// line (prCurrent); a command step with `if` also holds across the PR's own change outside its paths;
// a checks record only for its exact commit.
// State: <handoff_dir>/gates/<gate>/<id>/ (else <repo>/.agents/gates/…): gate.json (candidate, base),
// records/<step>.json (step, status, sha, evidence, by, at, reason; carried, spawned), records/<step>.plan.json
// (the same with plan: true, sha the base, evidence a copy kept in evidence/), findings/,
// evidence/, briefs/.
// Who may record: a session lc-spawn started for a gate step has LC_GATE_STEP=<gate>/<id>/<step>; it
// records only that step, only with findings/<step>.md answering each question of its question file
// in a row (questions, answerProblems), and never N/A or a carry. Any other
// caller is the lead (`by` is LC_SESSION, else "lead"). Nobody records a command step's pass (the runner
// does, from its exit), and only the spawned session records a session step's pass (the lead: N/A, carry).
// A session step runs on sessions.gate_model and sessions.gate_effort (opus, xhigh), never the lead's;
// with sessions.gate_parallel <n>, run starts a session step only while fewer than <n> are running;
// with sessions.gate_setup, its sessions read in one worktree at the candidate, set up by it (gateWorktree).
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, posix, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadConfig, parseProject } from '../board/config.mjs';
import { enforcement, protect } from './enforcement.mjs';

export const KINDS = ['command', 'workflow', 'checks', 'session', 'here', 'owner'];
const STATUS = ['pass', 'fail', 'na'];
const PLANNED_KINDS = ['here', 'session']; // the kinds a session does, so the kinds that can plan first
export const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMAND_TIMEOUT = 3_600_000; // a command step that runs longer is recorded as FAIL
const GH_TIMEOUT = 60_000;
const IDLE = 60_000; // a started session whose window shows nothing new for this long is reported

export class GateError extends Error {}
export const die = (msg) => {
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

// The steps of `gate_<gate>:` in file order: { id, kind, arg, if, plan?, after? }.
export function parseSteps(conf, gate) {
  const steps = [];
  const prefix = `gate_${gate}.`;
  const unread = (conf.unread ?? []).filter((u) => u.block === `gate_${gate}`);
  if (unread.length) die(`cannot read gate_${gate} line "${unread[0].line.trim()}": a step is \`  <id>: <kind> <argument>\`, two spaces, id of letters, digits, - and _`);
  for (const [key, value] of Object.entries(conf)) {
    if (!key.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    // `after-gate` (before 1.8) is never read as part of the argument: the order is now `after <step>`.
    if (/(^|\s)after-gate(\s|$)/.test(value)) die(`${prefix}${id}: "after-gate" is gone; write "after <step>[,<step>]" last on the line, naming the steps this one waits for (docs/upgrading.md, 1.8)`);
    // A trailing `after <step>[,<step>]`: the step starts once those have a record that holds, PASS or N/A.
    const a = value.match(/\s+after\s+([\w-]+(?:\s*,\s*[\w-]+)*)$/);
    const after = a ? a[1].split(/\s*,\s*/) : null;
    let rest = a ? value.slice(0, a.index) : value;
    for (const x of after ?? []) {
      if (x === id || !steps.some((p) => p.id === x)) die(`${prefix}${id}: "after ${x}" names no step declared above it in gate_${gate}`);
    }
    // A `plan` before it marks a here or session step as planned, and a command step with `after` too
    // (the author plans first, the command's result is the final record); on any other step it stays
    // part of the argument, as it always was.
    const kind = rest.match(/^\S+/)?.[0];
    const plan = (PLANNED_KINDS.includes(kind) || (kind === 'command' && after)) && /\splan$/.test(rest);
    if (plan) rest = rest.replace(/\s+plan$/, '');
    // A trailing `if <key>`, read first, so a step with no argument keeps its condition.
    const cond = rest.match(/\s+if\s+([\w-]+)$/);
    if (cond) rest = rest.slice(0, cond.index);
    const m = rest.match(/^(\S+)\s*(.*)$/);
    if (m) m[3] = cond?.[1];
    if (!m || !KINDS.includes(m[1])) die(`${prefix}${id}: "${value}" is not "<kind> <argument> [if <paths key>] [plan] [after <step>[,<step>]]" with kind ${KINDS.join(', ')}`);
    if (m[3] && !conf[`paths.${m[3]}`]) die(`${prefix}${id}: "if ${m[3]}" names no paths.${m[3]}`);
    if (m[1] === 'checks' && m[2]) die(`${prefix}${id}: a checks step takes no argument; it reads ci.required_checks`);
    steps.push({ id, kind: m[1], arg: m[2], if: m[3] ?? null, ...(plan ? { plan } : {}), ...(after ? { after } : {}) });
  }
  return steps;
}

// --- the check ---------------------------------------------------------------------------------

// Problems with a gate's records for candidate `sha`, one line per step; none means the gate holds.
// `records` maps a step id to its record; `current(recordSha, step)` says whether a record's commit
// counts for the candidate (exact match, or the PR gate's rule, prCurrent).
export function check(steps, records, sha, current = (s) => s === sha) {
  const problems = [];
  for (const s of steps) {
    const r = records[s.id];
    const who = r?.spawned ? `spawned session ${r.by}` : '';
    if (!r) problems.push(`${s.id}: missing`);
    else if (!STATUS.includes(r.status)) problems.push(`${s.id}: unknown status ${r.status}`);
    else if (!r.sha || !current(r.sha, s)) problems.push(`${s.id}: recorded for ${String(r.sha).slice(0, 12)}, not the candidate ${sha.slice(0, 12)}`);
    else if (r.status === 'fail') problems.push(`${s.id}: FAIL${r.reason ? ` (${r.reason})` : ''}`);
    else if (r.status === 'na' && !r.reason?.trim()) problems.push(`${s.id}: N/A without a reason`);
    else if (r.status === 'na' && who) problems.push(`${s.id}: N/A recorded by ${who}; only the lead may`);
    else if (r.carried && who) problems.push(`${s.id}: carried by ${who}; only the lead may`);
    else if (r.carried && !r.reason?.trim()) problems.push(`${s.id}: carried without a reason`);
    if (s.plan && r?.status !== 'na') problems.push(...planProblems(s, records[`${s.id}.plan`]));
  }
  return problems;
}

// A planned step's plan record (records/<step>.plan.json): made before the branch's first commit, so
// its commit is the base, not the candidate; `record … plan` refused it once the work had started.
function planProblems(s, p) {
  if (!p) return [`${s.id}: no plan recorded before the work`];
  if (p.status !== 'pass' && p.status !== 'na') return [`${s.id}: plan has unknown status ${p.status}`];
  if (p.status === 'na' && !p.reason?.trim()) return [`${s.id}: plan N/A without a reason`];
  if (p.status === 'na' && p.spawned) return [`${s.id}: plan N/A recorded by spawned session ${p.by}; only the lead may`];
  return [];
}

// --- answers per question ----------------------------------------------------------------------

// A question file's questions: its top-level numbered and bulleted items, outside code fences, in
// file order; they are Q1, Q2, … in the findings file.
export function questions(text) {
  const out = [];
  let fence = false;
  for (const line of text.split('\n')) {
    if (/^(```|~~~)/.test(line)) fence = !fence;
    const m = !fence && line.match(/^(?:\d+[.)]|[-*+])\s+(\S.*)$/);
    if (m) out.push(m[1].trim());
  }
  return out;
}

// P1 to P3 name findings (P4 is a line in the row, not a finding); comment and must-fix are the levels
// of question files before 1.6: must-fix counts as P2, so a P1, P2 or must-fix row fails the step.
const VERDICTS = ['sound', 'p1', 'p2', 'p3', 'comment', 'must-fix', 'n/a'];
const FAILS = /^(p1|p2|must-fix)\b/i;
// A findings file's rows `| Q<n> | question | applies | checked | verdict |`, by n, as cells.
function answerRows(findings) {
  const rows = new Map();
  for (const line of findings.split('\n').map((l) => l.trim())) {
    const c = line.replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    const n = line.startsWith('|') && c[0].match(/^Q(\d+)$/i)?.[1];
    if (n) rows.set(Number(n), c);
  }
  return rows;
}
// What is wrong with a findings file's rows for these questions, one line each: a question with no
// row, applies not yes or no, a yes with no path:line it checked, a no with no reason, an unknown verdict.
export function answerProblems(qs, findings) {
  const rows = answerRows(findings);
  return qs.flatMap((q, i) => {
    const id = `Q${i + 1} (${q.replace(/\*\*/g, '').slice(0, 50)})`;
    const c = rows.get(i + 1);
    if (!c) return [`${id}: no row`];
    if (c.length < 5) return [`${id}: a row is | Q${i + 1} | question | applies | checked | verdict |`];
    const [, , applies, checked, verdict] = c;
    if (!/^(yes|no)\b/i.test(applies)) return [`${id}: applies is yes or no, not "${applies}"`];
    if (/^yes/i.test(applies) && !/[\w.-]+:\d+/.test(checked)) return [`${id}: applies, but names no path:line it checked`];
    if (!checked) return [`${id}: says nothing of why it does not apply`];
    if (!VERDICTS.some((v) => verdict.toLowerCase().startsWith(v))) return [`${id}: verdict is ${VERDICTS.join(', ')}; not "${verdict}"`];
    return [];
  });
}

// A session step's question file, as the repository has it, else at the candidate.
function questionFile(g, s, sha) {
  const path = resolve(g.cfg.repo, s.arg);
  if (existsSync(path)) return readFileSync(path, 'utf8');
  const r = exec('git', ['-C', g.cfg.repo, 'show', `${sha}:${s.arg}`], { ok: true });
  if (r.status) die(`question file ${s.arg} of step ${s.id} is not in ${g.cfg.repo} nor at ${sha.slice(0, 12)}`);
  return r.stdout;
}

// The PR gate's rule: a record made at `sha` holds for head `head` when sha is the head, or an
// ancestor of it and every commit between them on the first-parent line is a merge of a commit
// already on main (`gh pr update-branch`, or main merged by hand) with no hand-resolved line: its
// `git show --remerge-diff` prints nothing. A command step with `if <key>` (with `conf`) also holds
// when the PR's own change between touches no path of paths.<key>: the files of the non-merge commits
// on the first-parent line, a merge of main's remerge-diff files, and every file another merge brings.
// A checks record holds only at its own commit. A commit missing locally is an error: fetch first.
export function prCurrent(repo, head, { main = mainRef(repo), conf = null } = {}) {
  const memo = new Map();
  const remerge = new Map();
  const isAncestor = (a, b) => {
    const s = exec('git', ['-C', repo, 'merge-base', '--is-ancestor', a, b], { ok: true }).status;
    if (s > 1) die(`${a.slice(0, 12)} or ${b} is not in ${repo}; fetch first`);
    return s === 0;
  };
  const resolved = (c) => {
    if (!remerge.has(c)) remerge.set(c, git(repo, 'show', '--remerge-diff', '--format=', '--name-only', c).split('\n').filter(Boolean));
    return remerge.get(c);
  };
  const ofMain = ({ parents }) => parents.length === 2 && isAncestor(parents[1], main);
  // The commits between, { commit, parents }, or null when sha is not an ancestor of the head.
  const between = (sha) => {
    if (!memo.has(sha)) {
      memo.set(sha, isAncestor(sha, head)
        ? git(repo, 'rev-list', '--first-parent', '--parents', `${sha}..${head}`).split('\n').filter(Boolean).map((l) => {
          const [commit, ...parents] = l.split(' ');
          return { commit, parents };
        })
        : null);
    }
    return memo.get(sha);
  };
  const ownFiles = (commits) => commits.flatMap((c) =>
    c.parents.length < 2 ? git(repo, 'diff-tree', '--no-commit-id', '--name-only', '-r', c.commit).split('\n').filter(Boolean)
    : ofMain(c) ? resolved(c.commit)
    : git(repo, 'diff', '--name-only', c.parents[0], c.commit).split('\n').filter(Boolean));
  return (sha, step) => {
    if (sha === head) return true;
    if (step?.kind === 'checks') return false;
    const commits = between(sha);
    if (!commits) return false;
    if (commits.every((c) => ofMain(c) && !resolved(c.commit).length)) return true;
    return Boolean(conf && step?.kind === 'command' && step.if) && !matchesPaths(conf, step.if, ownFiles(commits));
  };
}

// --- state -------------------------------------------------------------------------------------

export const gatesRoot = (cfg) => join(cfg.handoffDir || join(cfg.repo, '.agents'), 'gates');
export const gateDir = (cfg, gate, id) => join(gatesRoot(cfg), gate, id);
const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
export const writeJson = (file, value) => {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(`${file}.${process.pid}.tmp`, JSON.stringify(value, null, 2) + '\n');
  renameSync(`${file}.${process.pid}.tmp`, file);
};
export function readRecords(dir) {
  const out = {};
  const rdir = join(dir, 'records');
  if (!existsSync(rdir)) return out;
  for (const f of readdirSync(rdir).filter((f) => f.endsWith('.json'))) {
    const r = readJson(join(rdir, f));
    out[r.plan ? `${r.step}.plan` : r.step] = r;
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
const currentFor = (g, gate, sha) => (gate === 'pr' ? prCurrent(g.cfg.repo, sha, { conf: g.cfg.conf }) : (s) => s === sha);

// --- commands ----------------------------------------------------------------------------------

function record(repo, [gate, id, step, status, planStatus], flags) {
  const g = load(repo, gate, id);
  const s = g.steps.find((x) => x.id === step);
  if (!s) die(`no step ${step} in gate_${gate}; steps: ${g.steps.map((x) => x.id).join(', ')}`);
  if (status === 'plan') return recordPlan(g, gate, id, s, planStatus ?? 'pass', flags);
  if (!STATUS.includes(status)) die(`status must be pass, fail or na, not ${status}`);
  if (s.kind === 'owner' && status !== 'na') die(`${step} is an owner step: only the owner's answer on the board records it (lc-gate run); the lead may record N/A with --reason (a scratch or dry run)`);
  const own = process.env.LC_GATE_STEP;
  // A spawned session names the candidate of its brief, so its record never lands on a later one.
  if (own && !flags.candidate) die('a spawned session records with --candidate <the candidate of its brief>');
  const sha = candidateOf(g, flags);
  const reason = flags.reason?.trim() || '';
  if (own) {
    if (own !== `${gate}/${id}/${step}`) die(`this session is step ${own}; it may record only that step`);
    if (status === 'na') die('a spawned session may not record N/A; only the lead may');
    if (flags.carry) die('a spawned session may not carry a record; only the lead may');
    const findings = join(g.dir, 'findings', `${step}.md`);
    if (!nonEmpty(findings)) die(`write findings/${step}.md in ${g.dir} first`);
    if (s.kind === 'session') {
      const text = readFileSync(findings, 'utf8');
      const qs = questions(questionFile(g, s, sha));
      const problems = answerProblems(qs, text);
      if (problems.length) die(`${findings} answers each question of ${s.arg} in a row (the review skill):\n  ${problems.join('\n  ')}`);
      const failing = [...answerRows(text)].filter(([n, c]) => n <= qs.length && FAILS.test(c[4]));
      const word = (c) => (/^must-fix/i.test(c[4]) ? 'must-fix' : 'P1 or P2');
      if (status === 'pass' && failing.length) die(`${failing.map(([n]) => `Q${n}`).join(', ')} ${failing.length > 1 ? 'are' : 'is'} ${word(failing[0][1])}: record fail`);
    }
  }
  const old = g.records[step];
  let evidence = flags.evidence ?? '';
  // A command step's pass is its exit at the candidate, so only the runner records it (a carry would
  // record a pass for a commit it never ran on). A session step's pass comes from the session the
  // runner started for it; the lead carries an earlier one or records N/A.
  const runnerPass = () => {
    if (status !== 'pass') return;
    const rerun = `lc-gate run ${gate} ${id} --rerun ${step}`;
    if (s.kind === 'command') die(`${step} is a command step: only the runner records its pass, from its exit at the candidate. ${rerun} runs it`);
    if (s.kind === 'checks') die(`${step} is a checks step: only the runner records its pass, from the host's check runs on the candidate. ${rerun} reads them`);
    if (s.kind === 'session' && !own && !flags.carry) die(`${step} is a session step: its pass is recorded only by the session lc-gate run starts for it (${rerun}); the lead records N/A with --reason, or carries an earlier pass with --carry --reason`);
  };
  if (flags.carry) {
    if (s.kind === 'checks') die(`${step} is a checks step: its record holds only for the commit the checks ran on, never by carry; lc-gate run ${gate} ${id} reads them for the candidate`);
    if (!old) die(`nothing to carry: ${step} has no record`);
    if (old.sha === sha) die(`${step} is already recorded for the candidate`);
    if (old.status === 'fail') die(`${step} is FAIL at ${old.sha.slice(0, 12)}: only a pass or N/A is carried; rerun the step`);
    if (status !== old.status) die(`a carry keeps the status: ${step} is ${label(old)}, not ${status}`);
    runnerPass();
    if (evidence) die('a carry keeps the old evidence; drop --evidence');
    if (!reason) die('a carry needs --reason');
    evidence = old.evidence;
  } else if (status === 'na') {
    if (!reason) die('N/A needs --reason');
  } else {
    runnerPass();
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
  // An owner step the lead set aside: the owner reads it afterwards. The board's page doesn't show
  // this list yet; it is <data_dir>/read-afterwards.jsonl.
  if (s.kind === 'owner' && status === 'na') {
    const list = join(g.cfg.dataDir, 'read-afterwards.jsonl');
    mkdirSync(dirname(list), { recursive: true });
    appendFileSync(list, JSON.stringify({ gate, id, step, commit: sha, reason, by: rec.by, at: rec.at }) + '\n');
    console.log(`listed for the owner to read afterwards: ${list}`);
  }
  // The session's work is done: its window closes after LC_CLOSE_DELAY seconds (10), so this command's
  // output still reaches it.
  if (own && process.env.LC_SESSION) {
    const env = { ...process.env, LC_TMUX_SESSION: g.cfg.tmuxSession || 'agents' };
    spawn('bash', ['-c', 'sleep "$1"; exec "$2" "$3"', '_', process.env.LC_CLOSE_DELAY || '10', join(KIT, 'bin/lc-close'), process.env.LC_SESSION], { detached: true, stdio: 'ignore', env }).unref();
    console.log(`this window (${process.env.LC_SESSION}) closes in ${process.env.LC_CLOSE_DELAY || '10'}s: stop here`);
  }
}

// Closes a finished gate session's tmux window (lc-close).
function closeWindow(cfg, name) {
  exec(join(KIT, 'bin/lc-close'), [name], { ok: true, timeout: 10_000, env: { ...process.env, LC_TMUX_SESSION: cfg.tmuxSession || 'agents' } });
}

// `record <gate> <id> <step> plan --evidence <file>`: the plan of a step whose line ends in `plan`,
// made at the base before the work's first commit; `plan na --reason …` (the lead only) when the
// branch already had commits when the gate first saw it. Kept beside the final record, not over it.
function recordPlan(g, gate, id, s, status, flags) {
  if (!s.plan) die(`${s.id} has no plan: its line in gate_${gate} does not end with "plan"`);
  if (status !== 'pass' && status !== 'na') die(`a plan is recorded with "plan --evidence <file>", or by the lead with "plan na --reason …"; not "plan ${status}"`);
  if (flags.carry) die('a plan is not carried: it is made once, before the work');
  const own = process.env.LC_GATE_STEP;
  if (own && own !== `${gate}/${id}/${s.id}`) die(`this session is step ${own}; it may record only that step`);
  if (own && status === 'na') die('a spawned session may not record N/A; only the lead may');
  const reason = flags.reason?.trim() || '';
  const repo = g.cfg.repo;
  const branch = gate === 'pr' && exec('git', ['-C', repo, 'rev-parse', '--verify', '-q', `refs/heads/${id}`], { ok: true }).status === 0;
  const head = verify(repo, branch ? `refs/heads/${id}` : 'HEAD');
  const base = flags.base ? verify(repo, flags.base) : gate === 'pr' ? git(repo, 'merge-base', mainRef(repo), head) : g.state.base;
  if (!base) die(`the phase gate's plan needs --base <main before the phase's first merge>`);
  let evidence = '';
  if (status === 'na') {
    if (!reason) die('a plan N/A needs --reason: why no plan was recorded before the work');
  } else {
    const commits = Number(git(repo, 'rev-list', '--count', `${base}..${head}`));
    if (commits) die(`the plan comes before the first commit: ${gate === 'pr' ? `branch ${id}` : 'the phase'} already has ${commits} commit(s) beyond its base ${base.slice(0, 12)}. If the work started before the gate saw it, the lead records lc-gate record ${gate} ${id} ${s.id} plan na --reason …`);
    if (!flags.evidence || isUrl(flags.evidence)) die('a plan needs --evidence <file>: per piece of work, "I will call <function> (<docs page>) for <what>"');
    const from = resolve(flags.evidence);
    if (!nonEmpty(from)) die(`evidence ${from} is missing or empty`);
    // A copy, so completing the lines with file:line afterwards leaves the plan as it was made.
    evidence = join(g.dir, 'evidence', `${s.id}.plan${extname(from) || '.md'}`);
    mkdirSync(dirname(evidence), { recursive: true });
    if (from !== evidence) copyFileSync(from, evidence);
  }
  const rec = { step: s.id, plan: true, status, sha: base, evidence, by: process.env.LC_SESSION || 'lead', at: new Date().toISOString(), reason };
  if (own) rec.spawned = true;
  writeJson(join(g.dir, 'records', `${s.id}.plan.json`), rec);
  console.log(`recorded ${gate} ${id} ${s.id} plan: ${label(rec)} at the base ${base.slice(0, 12)}`);
}

const label = (r) =>(r ? `${r.status === 'na' ? 'N/A' : r.status.toUpperCase()}${r.carried ? ' carried' : ''}` : '-');

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
    console.log(trailer(gate, id, sha, g.steps, g.records));
    return 0;
  }
  if (flags.write) return writeRecord(g, gate, id, sha);
  const rows = [['step', 'kind', 'status', 'commit', 'by', 'evidence / reason']];
  for (const s of g.steps) {
    const r = g.records[s.id];
    const stale = r && !current(r.sha, s) ? ' (stale)' : '';
    rows.push([s.id, s.kind, label(r) + stale, r ? r.sha.slice(0, 12) : '', r?.by ?? '', [r?.evidence, r?.reason].filter(Boolean).join(' · ')]);
    const p = s.plan ? g.records[`${s.id}.plan`] : null;
    if (s.plan) rows.push([`${s.id} (plan)`, '', p ? `${label(p)} at base` : '-', p ? p.sha.slice(0, 12) : '', p?.by ?? '', [p?.evidence, p?.reason].filter(Boolean).join(' · ')]);
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
// A glob ending in / is the whole directory.
export const globRe = (glob) =>
  new RegExp(`^${glob.replace(/\/$/, '/**').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?|\*|\?/g, (m) => (m === '?' ? '[^/]' : m === '*' ? '[^/]*' : '.*'))}$`);
// Whether any of `files` (repo-relative) is under a glob of paths.<key>.
const matchesPaths = (conf, key, files) => {
  const globs = conf[`paths.${key}`].split(/[\s,]+/).filter(Boolean).map(globRe);
  return files.some((f) => globs.some((re) => re.test(f)));
};

async function run(repo, [gate, idArg], flags) {
  const id = idArg ?? (gate === 'pr' ? branchId(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')) : undefined);
  const g = load(repo, gate, id);
  const sha = flags.candidate ? verify(repo, flags.candidate) : gate === 'phase' && g.state.candidate ? g.state.candidate : verify(repo, 'HEAD');
  const base = flags.base ? verify(repo, flags.base) : gate === 'pr' ? git(repo, 'merge-base', mainRef(repo), sha) : g.state.base;
  if (!base) die(`the phase gate's first run needs --base <main before the phase's first merge>`);
  const current = currentFor(g, gate, sha);
  if (g.state.candidate && g.state.candidate !== sha) {
    const had = g.steps.filter((s) => g.records[s.id]);
    const holds = had.filter((s) => current(g.records[s.id].sha, s)).map((s) => s.id);
    const not = had.filter((s) => !holds.includes(s.id)).map((s) => s.id);
    console.log(`new candidate ${sha.slice(0, 12)} (was ${g.state.candidate.slice(0, 12)}): ${holds.length ? `records that hold: ${holds.join(', ')}` : 'no record holds'}; ${not.length ? `that do not: ${not.join(', ')} (each reruns, or the lead carries it with lc-gate record … --carry --reason)` : 'none that does not'}`);
  }
  writeJson(join(g.dir, 'gate.json'), { gate, id, candidate: sha, base });
  // The evidence folder's git-only part, whatever the freeze step does (templates/phase-review.md).
  const evidence = join(g.dir, 'evidence');
  mkdirSync(evidence, { recursive: true });
  writeFileSync(join(evidence, 'prs.txt'), exec('git', ['-C', repo, 'log', '--first-parent', '--merges', '--format=%h %s', `${base}..${sha}`]).stdout);
  writeFileSync(join(evidence, 'files.txt'), exec('git', ['-C', repo, 'diff', '--name-only', base, sha]).stdout);
  const ctx = { ...g, repo, gate, id, sha, base };
  let diff;
  const touches = (key) => {
    diff ??= git(repo, 'diff', '--name-only', base, sha).split('\n').filter(Boolean);
    return matchesPaths(g.cfg.conf, key, diff);
  };
  ctx.width = Math.max(...g.steps.map((s) => s.id.length));
  console.log(`${gate} ${id}: candidate ${sha.slice(0, 12)}, base ${base.slice(0, 12)}`);
  // --rerun <step>[,<step>]: ignore the step's record and do it again (the only way a stale session
  // step is started again on a new candidate; otherwise the lead carries it).
  const rerun = new Set((flags.rerun ?? '').split(',').filter(Boolean));
  for (const x of rerun) if (!g.steps.some((s) => s.id === x)) die(`--rerun ${x}: no such step`);
  let above = true; // every step above has a record for the candidate
  let commits;
  // sessions.gate_parallel: at most that many gate sessions at a time (unset: no limit). A live session
  // of a step still without its record counts.
  const parallel = Number(g.cfg.conf['sessions.gate_parallel']) || 0;
  if (g.cfg.conf['sessions.gate_parallel'] && !(Number.isInteger(parallel) && parallel > 0)) die(`sessions.gate_parallel is "${g.cfg.conf['sessions.gate_parallel']}": a whole number above 0, or unset`);
  ctx.parallel = parallel;
  ctx.running = parallel ? g.steps.filter((s) => s.kind === 'session' && !(g.records[s.id] && current(g.records[s.id].sha, s)) && liveWindow(g.cfg, sessionName(ctx, s))).length : 0;
  const held = {}; // this walk's record that holds, per step above
  for (const s of g.steps) {
    let r = g.records[s.id] && current(g.records[s.id].sha, s) && !rerun.has(s.id) ? g.records[s.id] : null;
    const old = g.records[s.id];
    if (s.plan && !g.records[`${s.id}.plan`] && r?.status !== 'na' && !(s.if && !touches(s.if))) {
      commits ??= Number(git(repo, 'rev-list', '--count', `${base}..${sha}`));
      say(ctx, s, commits
        ? `no plan recorded before the work, and the work has ${commits} commit(s) already: the lead records lc-gate record ${gate} ${id} ${s.id} plan na --reason …`
        : `plan now, before the first commit: from the project's chosen tools and their docs, one line per piece of work, "I will call <function> (<docs page>) for <what>"; then lc-gate record ${gate} ${id} ${s.id} plan --evidence <file>`);
    }
    // `after`: each named step's record holds with PASS or N/A; else today's rule, every step above recorded.
    const pending = s.after?.filter((x) => !['pass', 'na'].includes(held[x]?.status)) ?? [];
    const waits = s.after ? pending.length > 0 : ['command', 'here', 'owner'].includes(s.kind) && !above;
    if (rerun.has(s.id) && s.kind === 'session') rmSync(join(g.dir, 'briefs', `${s.id}-${sha.slice(0, 12)}.md`), { force: true });
    if (r && s.kind === 'session' && liveWindow(g.cfg, sessionName(ctx, s))) {
      closeWindow(g.cfg, sessionName(ctx, s));
      say(ctx, s, `${label(r)}, by ${r.by}; closed its window ${sessionName(ctx, s)}`);
    } else if (r && !(['command', 'checks'].includes(s.kind) && r.status === 'fail' && !waits)) say(ctx, s, `${label(r)}, by ${r.by}${r.reason ? ` (${r.reason})` : ''}`);
    else if (!r && s.if && !touches(s.if)) r = put(ctx, s, 'na', '', `no file changed between ${base.slice(0, 12)} and ${sha.slice(0, 12)} matches paths.${s.if}`, 'lc-gate');
    else if (s.kind === 'session' && old && !rerun.has(s.id) && !waits) {
      say(ctx, s, `stale: ${label(old)} for ${old.sha.slice(0, 12)}. Rerun it with lc-gate run ${gate} ${id} --rerun ${s.id}, or carry it with lc-gate record ${gate} ${id} ${s.id} pass --carry --reason …`);
    }
    else if (waits) say(ctx, s, s.after ? `${r ? `${label(r)}; reruns once` : 'waits until'} ${pending.join(', ')} ${pending.length > 1 ? 'pass or are' : 'passes or is'} N/A` : r ? `${label(r)}; reruns once the steps above have records` : 'waits until every step above has a record');
    else {
      try {
        r = (await STEP[s.kind](ctx, s)) ?? r;
      } catch (err) {
        if (!(err instanceof GateError)) throw err;
        say(ctx, s, `not started: ${err.message}`);
      }
    }
    if (r) held[s.id] = r;
    above &&= Boolean(r);
  }
  const problems = check(g.steps, readRecords(g.dir), sha, current);
  console.log(
    !problems.length ? `every step holds: ${gate === 'phase' ? `lc-gate status phase ${id} --write` : `lc-gate merge pr ${id}`}`
    : `${problems.length} step(s) not done; rerun lc-gate run to advance`,
  );
  return 0;
}

// The brief lc-spawn last started a session on in the PR branch's worktree (the board's spawned.tsv:
// name, brief, workdir), not a gate session's; null when none is known.
function prBrief(ctx) {
  const real = (p) => { try { return realpathSync(p); } catch { return p; } };
  const dirs = exec('git', ['-C', ctx.repo, 'worktree', 'list', '--porcelain'], { ok: true }).stdout.split('\n\n')
    .filter((b) => b.split('\n').includes(`branch refs/heads/${ctx.id}`)).map((b) => real(b.match(/^worktree (.*)$/m)?.[1] ?? ''));
  const tsv = join(ctx.cfg.dataDir, 'spawned.tsv');
  const rows = existsSync(tsv) ? readFileSync(tsv, 'utf8').split('\n').map((l) => l.split('\t')) : [];
  const hit = rows.filter(([name, brief, dir]) => dir && !name.startsWith('gate-') && dirs.includes(real(dir)) && existsSync(brief)).at(-1);
  return hit?.[1] ?? null;
}

const sessionName = (ctx, s) => `gate-${ctx.id}-${s.id}`.replace(/[^\w.-]/g, '-');

// The id of lc-spawn's tmux window of this name, else null.
function liveWindow(cfg, name) {
  try {
    const r = exec('tmux', ['list-windows', '-t', cfg.tmuxSession || 'agents', '-F', '#{window_id}\t#W'], { ok: true, timeout: 10_000 });
    return r.status === 0 ? (r.stdout.split('\n').map((l) => l.split('\t')).find((w) => w[1] === name)?.[0] ?? null) : null;
  } catch {
    return null;
  }
}

// A started session's activity: its window's text changing. briefs/<step>.seen.json keeps the last
// look; unchanged for IDLE, the session is reported with the window's last line (a prompt it waits on).
function idleNote(ctx, s, window) {
  let pane;
  try {
    const r = exec('tmux', ['capture-pane', '-p', '-t', window], { ok: true, timeout: 10_000 });
    if (r.status) return '';
    pane = r.stdout;
  } catch {
    return '';
  }
  const file = join(ctx.dir, 'briefs', `${s.id}.seen.json`);
  const hash = createHash('sha1').update(pane).digest('hex');
  const seen = readJson(file, null);
  if (seen?.hash !== hash) {
    writeJson(file, { hash, at: Date.now() });
    return '';
  }
  const idle = Date.now() - seen.at;
  if (idle < IDLE) return '';
  const last = pane.split('\n').map((l) => l.trim()).filter(Boolean).at(-1) ?? '(nothing)';
  return `shows no activity for ${Math.round(idle / 1000)}s; its window shows: ${last.slice(0, 120)}`;
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

// sessions.gate_setup: one worktree of the gate at the candidate, the command run in it once (say,
// installing dependencies, so a session can run a check); its output in setup.log. A new candidate
// gets a new worktree. Unset, each session reads in a worktree of its own.
function gateWorktree(ctx, setup) {
  if (ctx.setupFailed) die(ctx.setupFailed);
  const dir = join(ctx.dir, 'worktree');
  const made = join(ctx.dir, 'worktree.json');
  if (readJson(made, {}).candidate !== ctx.sha) {
    rmSync(made, { force: true });
    if (existsSync(dir)) exec('git', ['-C', ctx.repo, 'worktree', 'remove', '--force', dir], { ok: true });
    rmSync(dir, { recursive: true, force: true });
    exec('git', ['-C', ctx.repo, 'worktree', 'prune']);
    exec('git', ['-C', ctx.repo, 'worktree', 'add', '-q', '--detach', dir, ctx.sha]);
    const log = join(ctx.dir, 'setup.log');
    const fd = openSync(log, 'w');
    const r = spawnSync('bash', ['-c', setup], { cwd: dir, stdio: ['ignore', fd, fd], timeout: COMMAND_TIMEOUT });
    closeSync(fd);
    if (r.status !== 0) die((ctx.setupFailed = `sessions.gate_setup failed in ${dir} (${r.error?.message ?? `exit ${r.status}`}); log ${log}`));
    writeJson(made, { candidate: ctx.sha });
  }
  return dir;
}

// What `run` does for a step without a record; returns the record when it wrote one.
const STEP = {
  // Runs at the candidate on a clean tree, in its own process group so a timeout kills all of it.
  async command(ctx, s) {
    const head = git(ctx.repo, 'rev-parse', 'HEAD');
    if (head !== ctx.sha) return say(ctx, s, `check out the candidate ${ctx.sha.slice(0, 12)} to run it (HEAD is ${head.slice(0, 12)})`);
    if (git(ctx.repo, 'status', '--porcelain', '-uno')) return say(ctx, s, 'not run: the checkout has uncommitted changes, so the result would not be the candidate\'s');
    const evidence = join(ctx.dir, 'evidence');
    mkdirSync(evidence, { recursive: true });
    const log = join(evidence, `${s.id}.log`);
    say(ctx, s, `running: ${s.arg}`);
    const fd = openSync(log, 'w');
    const env = { ...process.env, LC_GATE_CANDIDATE: ctx.sha, LC_GATE_BASE: ctx.base, LC_GATE_EVIDENCE: evidence };
    const child = spawn('bash', ['-c', s.arg], { cwd: ctx.repo, stdio: ['ignore', fd, fd], env, detached: true });
    const killGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // the group is gone
      }
    };
    let timedOut = false;
    const r = await new Promise((done) => {
      const timer = setTimeout(() => {
        timedOut = true;
        killGroup('SIGTERM');
        setTimeout(() => killGroup('SIGKILL'), 10_000).unref();
      }, COMMAND_TIMEOUT);
      child.on('error', (error) => (clearTimeout(timer), done({ error })));
      child.on('exit', (code, signal) => (clearTimeout(timer), done({ code, signal })));
    });
    closeSync(fd);
    if (timedOut) killGroup('SIGKILL');
    const why = timedOut ? `timed out after ${COMMAND_TIMEOUT / 1000}s` : r.error ? r.error.message : r.code ? `exit ${r.code}` : r.signal ? `killed by ${r.signal}` : '';
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
    const name = sessionName(ctx, s);
    const brief = join(ctx.dir, 'briefs', `${s.id}-${ctx.sha.slice(0, 12)}.md`);
    // One session per step at a time: a live one (for this candidate or an earlier one) is waited for.
    const window = liveWindow(ctx.cfg, name);
    if (window) {
      const idle = idleNote(ctx, s, window);
      return say(ctx, s, `session ${name} is running; waiting for its record (lc-close ${name} to stop it)${idle && `\n    ${name} ${idle}`}`);
    }
    // A review after a fix: the step failed at an earlier candidate this one descends from. After two
    // such reviews with a P1 or P2 still open, no further session: the lead decides.
    const old = ctx.records[s.id];
    const before = (old?.status === 'fail' || old?.status === 'pass') && old.sha !== ctx.sha && exec('git', ['-C', ctx.repo, 'merge-base', '--is-ancestor', old.sha, ctx.sha], { ok: true }).status === 0 ? old : null;
    const earlier = before?.status === 'fail' ? before : null;
    const roundsFile = join(ctx.dir, 'rounds.json');
    const rounds = readJson(roundsFile, {});
    const round = earlier ? (rounds[s.id]?.[earlier.sha] ?? 0) + 1 : 0;
    if (round > 2) return say(ctx, s, `a P1 or P2 is still open after two reviews after a fix (${earlier.evidence}): no further session; the lead decides (lc-gate record ${ctx.gate} ${ctx.id} ${s.id} na --reason …, or a decision on the board)`);
    if (existsSync(brief)) return say(ctx, s, `session ${name} ended without a record; start it again with --rerun ${s.id}`);
    if (ctx.parallel && ctx.running >= ctx.parallel) return say(ctx, s, `waits: ${ctx.running} session(s) running, sessions.gate_parallel is ${ctx.parallel}`);
    const findings = join(ctx.dir, 'findings', `${s.id}.md`);
    mkdirSync(dirname(findings), { recursive: true });
    mkdirSync(dirname(brief), { recursive: true });
    // Findings of an earlier candidate are kept beside, so the new session starts from an empty file.
    const kept = join(ctx.dir, 'findings', `${s.id}.before-${ctx.sha.slice(0, 12)}.md`);
    if (existsSync(findings)) renameSync(findings, kept);
    let scope = 'a full review of the whole diff, as deep as the review skill asks.';
    // A follow-up review reads only the PR's own change since: its commits and the hand-resolved lines
    // of any merge, nothing main brought in (git 2.36 for --remerge-diff).
    const own = (from) => `the PR's own change since is \`git log -p --first-parent --remerge-diff ${from}..${ctx.sha}\`: its commits and the hand-resolved lines of any merge, nothing main brought in`;
    if (earlier) {
      const was = earlier.evidence === findings ? kept : earlier.evidence;
      scope = `a review after a fix. The step failed at \`${earlier.sha.slice(0, 12)}\` with the findings in \`${was}\`; ${own(earlier.sha)}. Check that each of its P1 and P2 is resolved at the candidate and that those lines add none; raise nothing else, unless a P1 or P2 with its evidence.`;
    }
    // Commits on top of a pass: only they are reviewed.
    if (before?.status === 'pass') scope = `a review of the change since a pass. The step passed at \`${before.sha.slice(0, 12)}\`; ${own(before.sha)}. Review those lines as deep as the review skill asks; raise nothing in the rest, unless a P1 or P2 with its evidence.`;
    writeJson(roundsFile, { ...rounds, [s.id]: { ...rounds[s.id], [ctx.sha]: round } });
    const spec = ctx.gate !== 'pr' ? 'The spec: the inputs the question file names.'
      : ((b) => (b ? `The PR's brief: \`${b}\`; judge the change against it.` : "The PR's brief: none known; judge the change against the PR body."))(prBrief(ctx));
    const setup = ctx.cfg.conf['sessions.gate_setup'];
    const checkout = setup ? `read in the gate's worktree \`${gateWorktree(ctx, setup)}\`, set up by \`${setup}\`: run checks there, edit nothing` : 'read in your own detached worktree';
    const values = { gate: ctx.gate, id: ctx.id, step: s.id, session: name, question: s.arg, base: ctx.base, candidate: ctx.sha, checkout, evidence: join(ctx.dir, 'evidence'), findings, scope, spec };
    writeFileSync(brief, readFileSync(join(KIT, 'templates/gate-brief.md'), 'utf8').replace(/\{\{(\w+)\}\}/g, (_, k) => values[k]));
    // The model floor: a gate session runs on the gate's model and effort, never on the lead's.
    const conf = ctx.cfg.conf;
    const env = { ...process.env, LC_GATE_STEP: `${ctx.gate}/${ctx.id}/${s.id}`, LC_MODEL: conf['sessions.gate_model'] || 'opus', LC_EFFORT: conf['sessions.gate_effort'] || 'xhigh' };
    let out;
    try {
      out = exec(join(KIT, 'bin/lc-spawn'), [name, ctx.repo, brief], { cwd: ctx.repo, timeout: 60_000, env }).stdout;
    } catch (err) {
      unlinkSync(brief); // the brief marks a started session; the next run tries again
      throw err;
    }
    ctx.running++;
    // The window as it is now, so the next run sees whether anything changed.
    const started = liveWindow(ctx.cfg, name);
    if (started) idleNote(ctx, s, started);
    const said = out.split('\n').filter((l) => l.startsWith('lc-spawn:')).map((l) => `\n    ${l}`).join('');
    return say(ctx, s, `started session ${name} on ${env.LC_MODEL}, effort ${env.LC_EFFORT}; brief ${brief}${said}`);
  },

  // The host's verdict on this exact commit; a check still running or not started yet is waited for.
  checks(ctx, s) {
    const r = hostChecks(ctx.cfg, ctx.sha);
    return r.wait ? say(ctx, s, r.wait) : put(ctx, s, r.status, r.evidence, r.reason, 'lc-gate');
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

// The newest check run of each name in ci.required_checks on commit `sha` (the host's API, every page):
// { status: pass|fail, evidence: the commit's checks URL, reason } once the verdict is in, else { wait }.
// Success, neutral and skipped pass; any other conclusion fails, even while another check runs.
export function hostChecks(cfg, sha) {
  const names = (cfg.conf['ci.required_checks'] ?? '').split(/[\s,]+/).filter(Boolean);
  if (!names.length) die('a checks step reads ci.required_checks: set the check names the default branch requires');
  const out = exec('gh', ['api', '--paginate', `repos/{owner}/{repo}/commits/${sha}/check-runs?per_page=100`, '--jq', '.check_runs[] | {name, status, conclusion, started_at, id, html_url} | @json'], { cwd: cfg.repo, timeout: GH_TIMEOUT });
  const runs = out.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const newest = new Map();
  for (const run of runs) {
    const had = newest.get(run.name);
    if (!had || String(run.started_at ?? '') > String(had.started_at ?? '') || (run.started_at === had.started_at && run.id > had.id)) newest.set(run.name, run);
  }
  const short = sha.slice(0, 12);
  const failed = names.filter((n) => newest.get(n)?.status === 'completed' && !['success', 'neutral', 'skipped'].includes(newest.get(n).conclusion));
  if (failed.length) return { status: 'fail', evidence: checksUrl(cfg, sha, runs), reason: `${failed.map((n) => `${n} ${newest.get(n).conclusion}`).join(', ')} on ${short}` };
  const missing = names.filter((n) => !newest.has(n));
  const running = names.filter((n) => newest.has(n) && newest.get(n).status !== 'completed');
  if (missing.length || running.length) {
    const none = !runs.length ? `: no check run on ${short} at all; is the head pushed?` : '';
    return { wait: `waits for the checks on ${short}: ${[running.length && `running: ${running.join(', ')}`, missing.length && `not started: ${missing.join(', ')}`].filter(Boolean).join('; ')}${none}` };
  }
  return { status: 'pass', evidence: checksUrl(cfg, sha, runs), reason: '' };
}

// The commit's checks page: from a check run's URL (https://<host>/<owner>/<repo>/runs/<id>), else the host.
function checksUrl(cfg, sha, runs) {
  const base = runs.map((r) => String(r.html_url ?? '').match(/^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\//)?.[1]).find(Boolean)
    ?? exec('gh', ['repo', 'view', '--json', 'url', '--jq', '.url'], { cwd: cfg.repo, timeout: GH_TIMEOUT }).stdout.trim();
  return `${base}/commit/${sha}/checks`;
}

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
    const row = (x, step, ev, why) => `| ${step} | ${s.kind} | ${label(x)} | ${x.sha} | ${cell(x.by)}${x.spawned ? ' (spawned)' : ''} | ${cell(ev)} | ${cell(why)} |`;
    // A planned step's plan is its own row, <step>.plan, at the base; the CI form checks it like the step.
    const p = s.plan ? g.records[`${s.id}.plan`] : null;
    let planEvidence = p?.evidence;
    if (p?.status === 'pass' && planEvidence) {
      const to = join(g.cfg.repo, dirRel, id, `${s.id}.plan${extname(planEvidence) || '.md'}`);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(planEvidence, to);
      planEvidence = relative(g.cfg.repo, to);
    }
    return [row(r, s.id, evidence, reason), ...(p ? [row(p, `${s.id}.plan`, planEvidence, p.reason)] : [])].join('\n');
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
    // An owner step the lead recorded N/A (a scratch or dry run): no acceptance, said where it is read.
    ...g.steps.filter((s) => s.kind === 'owner' && g.records[s.id]?.status === 'na').map((s) => `- **Owner acceptance:** not given: ${s.id} is N/A by ${g.records[s.id].by} (${cell(g.records[s.id].reason)})`),
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

// A roadmap line that marks a phase done: a heading (any level) whose (…) holds done, closed or
// exited as a word, or a **Status:** line that starts with done, closed, exited or complete(d).
const DONE_HEADING = /^#{1,6}\s.*\(([^)]*\b(done|closed|exited)\b[^)]*)\)/i;
const DONE_STATUS = /\*\*Status:\*\*\s*(done|exited|closed|complete|completed)\b/i;
// A phase's id is its roadmap heading's name, slugged as the board does: `## Core journeys (…)` is
// core-journeys. `lc-gate run phase <id>` uses that id, and the record's **Gate:** line names it.
export const phaseId = (heading) =>
  heading.replace(/^#{1,6}\s+/, '').replace(/\s*\(.*$/, '').replace(/\[[^\]]*\]\([^)]*\)/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The CI form: every roadmap line the diff adds that marks a phase done links that phase's record,
// and every phase record linked or changed holds for its candidate against every step declared at
// the base or at the head (a step deleted in the same diff is still required).
function checkPhaseDiff(repo, baseRev, headRev) {
  if (!baseRev || !headRev) die('usage: lc-gate check phase --diff <base> <head>');
  const [base, head] = [verify(repo, baseRev), verify(repo, headRev)];
  const showAt = (rev, path) => {
    const r = exec('git', ['-C', repo, 'show', `${rev}:${path}`], { ok: true });
    return r.status === 0 ? r.stdout : null;
  };
  const show = (path) => showAt(head, path);
  const conf = parseProject(show('.agents/project.yaml') ?? die('no .agents/project.yaml at the head'));
  const steps = parseSteps(conf, 'phase');
  const atBase = showAt(base, '.agents/project.yaml');
  for (const s of atBase ? parseSteps(parseProject(atBase), 'phase') : []) if (!steps.some((x) => x.id === s.id)) steps.push(s);
  const roadmap = conf['docs.roadmap'];
  const recDir = conf['docs.phase_records']?.replace(/\/$/, '');
  if (!roadmap || !recDir) die('the project file at the head needs docs.roadmap and docs.phase_records');
  const records = new Map(); // path -> the phase ids whose done line links it
  const problems = [];
  const roadLines = (show(roadmap) ?? '').split('\n');
  const added = git(repo, 'diff', '-U0', base, head, '--', roadmap).split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  for (const line of added.map((l) => l.slice(1))) {
    const heading = DONE_HEADING.test(line);
    if (!heading && !DONE_STATUS.test(line)) continue;
    const at = roadLines.indexOf(line);
    const owner = heading ? line : roadLines.slice(0, at < 0 ? 0 : at).reverse().find((l) => /^#{1,6}\s/.test(l)) ?? '';
    const links = [...line.matchAll(/\]\(([^)\s#]+\.md)/g)].map((m) => m[1]).filter((t) => t.includes(`${basename(recDir)}/`));
    if (!links.length) problems.push(`${roadmap}: a phase is marked done without a link to its record: ${line.trim().slice(0, 120)}`);
    for (const t of links) {
      const path = posix.join(recDir, basename(t));
      if (!records.has(path)) records.set(path, new Set());
      records.get(path).add(phaseId(owner));
    }
  }
  for (const path of git(repo, 'diff', '--name-only', '--no-renames', '--diff-filter=AM', base, head, '--', recDir).split('\n')) {
    if (path.endsWith('.md') && posix.dirname(path) === recDir && show(path)?.includes('**Gate:** phase') && !records.has(path)) records.set(path, new Set());
  }
  if (records.size && !steps.length) problems.push('the project file declares no gate_phase steps');
  for (const [path, phases] of [...records].sort()) {
    const text = show(path);
    const gateId = text?.match(/^\s*-?\s*\*\*Gate:\*\*\s*phase\s+(\S+)/m)?.[1];
    for (const p of phases) if (text !== null && gateId !== p) problems.push(`${path}: is the record of phase ${gateId ?? '(no **Gate:** line)'}, not ${p || '(a phase with no heading)'}`);
    problems.push(...checkRecord(repo, head, path, text, steps));
  }
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
  const runPath = String(run.path ?? '').split('@')[0];
  if (runPath !== s.arg && runPath !== `.github/workflows/${s.arg}`) problems.push(`${path}: ${s.id}: run ${id} is ${run.path}, not ${s.arg}`);
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

// --- the plan, before the work -----------------------------------------------------------------

// --- modes -------------------------------------------------------------------------------------

// gate_pr_mode and gate_pr_plan: off, observe (the default), enforce, or `observe <n>`: observe until
// <n> pull requests have merged with every record (the merge hook's merged.json marks), then enforce
// without anyone editing the file. { mode: the one in effect, value, count, n, fresh }; `fresh`: the
// switch has happened and the hook has not said so yet (<gates>/<key>.enforcing marks that it did).
export function gateMode(cfg, key) {
  const value = cfg.conf[key] || 'observe';
  const m = value.match(/^(off|observe|enforce)(?:\s+([1-9]\d*))?$/);
  if (!m || (m[2] && m[1] !== 'observe')) die(`${key} is "${value}"; it must be off, observe, observe <n> or enforce`);
  if (!m[2]) return { key, value, mode: m[1] };
  const n = Number(m[2]);
  const count = mergedComplete(cfg);
  if (count < n) return { key, value, mode: 'observe', count, n };
  return { key, value, mode: 'enforce', count, n, fresh: !existsSync(join(gatesRoot(cfg), `${key}.enforcing`)) };
}

// How a mode stands, in words: enforce, observe, off, "observing, 2 of 3", or the ended count.
export const modeText = (m) =>
  !m.n ? m.mode : m.mode === 'observe' ? `observing, ${m.count} of ${m.n}` : `enforce (${m.value} ended: ${m.count} merged with every record)`;

// The once-only line at the switch from `observe <n>` to enforce; writes the mark so it isn't said again.
function announce(cfg, m) {
  if (!m.fresh) return '';
  writeJson(join(gatesRoot(cfg), `${m.key}.enforcing`), { at: new Date().toISOString(), count: m.count, n: m.n });
  return `lc-gate: ${m.key} was "${m.value}", and ${m.count} pull request(s) have merged with every record, so it enforces from now on: refusals are now real. (Said once.)`;
}

// The PR gates whose merge the hook let through with every record (merged.json, complete).
function mergedComplete(cfg) {
  const root = join(gatesRoot(cfg), 'pr');
  if (!existsSync(root)) return 0;
  return readdirSync(root, { recursive: true }).filter((f) => basename(String(f)) === 'merged.json' && readJson(join(root, String(f)), {}).complete === true).length;
}

const FAST = 10_000; // the plan check runs on every edit: a git call that takes longer has hung
const fastGit = (repo, ...args) => exec('git', ['-C', repo, ...args], { timeout: FAST, ok: true });

// The default branch: origin/HEAD's name, else main or master.
function isMainBranch(repo, branch) {
  const origin = fastGit(repo, 'symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD').stdout.trim();
  return origin ? branch === origin.replace(/^origin\//, '') : branch === 'main' || branch === 'master';
}

// The files a commit would take: staged, or, with `pending`, every changed or untracked file too
// (a `git add` in the same command line has not run yet when the hook sees it).
function changedFiles(repo, pending) {
  if (!pending) return fastGit(repo, 'diff', '--cached', '--name-only', '--no-renames', '-z').stdout.split('\0').filter(Boolean);
  const out = [];
  const entries = fastGit(repo, 'status', '--porcelain=v1', '-z', '--untracked-files=all').stdout.split('\0');
  for (let i = 0; i < entries.length; i++) {
    if (!entries[i]) continue;
    out.push(entries[i].slice(3));
    if (/^[RC]/.test(entries[i])) i++; // a rename's old path follows
  }
  return out;
}

// A path as the repository sees it: through symlinks, from its nearest existing ancestor.
function repoPath(repo, file) {
  let dir = resolve(file);
  const rest = [];
  while (!existsSync(dir) && dirname(dir) !== dir) {
    rest.unshift(basename(dir));
    dir = dirname(dir);
  }
  return relative(repo, join(realpathSync(dir), ...rest)).split('\\').join('/');
}

// Whether the work on this branch may go ahead without a plan. Nothing applies (null) without a
// project file, with gate_pr_plan off, without a planned step in gate_pr, on the default branch or a
// detached HEAD, or when no file is under the step's `if` paths (a step without `if` takes any file).
// Files under .agents/ never count: the plan itself can be written there. Otherwise { mode, branch,
// applies: the planned steps the files fall under, missing: those without a valid plan record, message }.
export function planState(repo, { files = [], staged = false, pending = false } = {}) {
  if (!existsSync(join(repo, '.agents/project.yaml'))) return null;
  const cfg = loadConfig(repo);
  const modeState = gateMode(cfg, 'gate_pr_plan');
  const { mode } = modeState;
  if (mode === 'off') return null;
  const planned = parseSteps(cfg.conf, 'pr').filter((s) => s.plan);
  if (!planned.length) return null;
  const branch = fastGit(repo, 'symbolic-ref', '-q', '--short', 'HEAD').stdout.trim();
  if (!branch || isMainBranch(repo, branch)) return null;
  const rel = (staged || pending ? changedFiles(repo, pending) : files.map((f) => repoPath(repo, f)))
    .filter((f) => f && !f.startsWith('../') && f !== '..' && !f.startsWith('.agents/'));
  const applies = rel.length ? planned.filter((s) => !s.if || matchesPaths(cfg.conf, s.if, rel)) : [];
  if (!applies.length) return null;
  const id = branchId(branch);
  const records = readRecords(gateDir(cfg, 'pr', id));
  const missing = applies.filter((s) => planProblems(s, records[`${s.id}.plan`]).length);
  const st = { cfg, mode, modeState, branch, applies, missing, files: rel, message: '' };
  if (!missing.length) return st;
  let commits = 0;
  try {
    commits = Number(git(repo, 'rev-list', '--count', `${git(repo, 'merge-base', mainRef(repo), 'HEAD')}..HEAD`));
  } catch {
    // no main to count from: say the before-the-work form
  }
  st.message = missing.map((s) => {
    const file = rel.find((f) => !s.if || matchesPaths(cfg.conf, s.if, [f]));
    const record = commits
      ? `the branch already has ${commits} commit(s), so only the lead can record it now: lc-gate record pr ${id} ${s.id} plan na --reason …`
      : `then: lc-gate record pr ${id} ${s.id} plan --evidence <file>`;
    return `no plan for step ${s.id} on ${branch}, and ${file} is ${s.if ? `under paths.${s.if}` : 'in the repository'}. The plan comes before the code: following ${s.arg} and the project's chosen tools (the pr-gate skill), write one line per piece of work, "I will call <function> (<docs page>) for <what>", in a file outside the repository or under .agents/; ${record}`;
  }).join('\n');
  return st;
}

// Whether the observe message for this commit is still unsaid: one commit is seen by the plugin hook
// (once per matching hook entry) and by the git pre-commit hook, and is told once. Keyed by the branch,
// its head and the missing steps; an exclusive create, so hooks running at once agree. A day's marks kept.
function firstTellForCommit(repo, st) {
  const dir = join(gatesRoot(st.cfg), 'told');
  mkdirSync(dir, { recursive: true });
  const head = fastGit(repo, 'rev-parse', '-q', '--verify', 'HEAD').stdout.trim();
  const key = createHash('sha1').update([repo, st.branch, head, ...st.missing.map((s) => s.id)].join('\n')).digest('hex');
  try {
    closeSync(openSync(join(dir, key), 'wx'));
  } catch (err) {
    if (err.code === 'EEXIST') return false;
    throw err;
  }
  for (const f of readdirSync(dir)) if (Date.now() - statSync(join(dir, f)).mtimeMs > 86_400_000) rmSync(join(dir, f), { force: true });
  return true;
}

// `lc-gate plan-check [--staged] [--files <path>…]`: exit 1 with what is missing when enforce
// would refuse; in observe mode the same is logged and told (for --staged, once per commit), and the exit is 0.
function planCheck(repo, pos, flags, cwd = process.cwd()) {
  const st = planState(repo, { files: pos.map((f) => resolve(cwd, f)), staged: Boolean(flags.staged) });
  if (!st?.missing.length) return 0;
  if (st.mode !== 'enforce' && flags.staged && !firstTellForCommit(repo, st)) return 0;
  const log = join(gatesRoot(st.cfg), 'observe.log');
  mkdirSync(dirname(log), { recursive: true });
  appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), point: 'plan', session: process.env.LC_SESSION || '', mode: st.mode, branch: st.branch, missing: st.missing.map((s) => s.id), files: st.files.slice(0, 20), ...(st.mode === 'enforce' ? { refused: true } : {}) }) + '\n');
  if (st.mode === 'enforce') {
    console.error(`lc-gate: ${st.message}`);
    return 1;
  }
  console.error(`lc-gate (observe mode): this goes ahead, but gate_pr_plan: enforce would refuse it: ${st.message}`);
  return 0;
}

// `git [global options] commit …` as { cwd, noVerify }, else null.
const GIT_VALUE_OPTS = new Set(['-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env']);
const COMMIT_VALUE_SHORT = 'mFCctSu'; // short options whose value follows, attached or as the next word
const COMMIT_VALUE_LONG = new Set(['--message', '--file', '--author', '--date', '--reuse-message', '--reedit-message', '--fixup', '--squash', '--template', '--cleanup', '--trailer']);
export function gitCommit(words, cwd) {
  if (!/(^|\/)git$/.test(words[0]?.text ?? '')) return null;
  let i = 1;
  for (; i < words.length && words[i].text.startsWith('-'); i++) {
    const t = words[i].text;
    if (t === '-C') cwd = resolve(cwd, (words[++i]?.text ?? '').replace(/^~(?=\/|$)/, homedir()));
    else if (GIT_VALUE_OPTS.has(t)) i++;
  }
  if (words[i]?.text !== 'commit') return null;
  let noVerify = false;
  for (i++; i < words.length; i++) {
    const t = words[i].text;
    if (t === '--') break;
    if (t === '--no-verify') noVerify = true;
    else if (COMMIT_VALUE_LONG.has(t)) i++;
    else if (/^-[^-]/.test(t)) {
      for (let k = 1; k < t.length; k++) {
        if (t[k] === 'n') noVerify = true;
        if (COMMIT_VALUE_SHORT.includes(t[k])) {
          if (k === t.length - 1 && 'mFCct'.includes(t[k])) i++;
          break;
        }
      }
    }
  }
  return { cwd, noVerify };
}

// `git [global options] merge [options] <commit>…` as { cwd, targets }, else null; null too for
// --abort, --continue, --quit and --skip, which merge nothing new.
const MERGE_VALUE = new Set(['-m', '-F', '-s', '-X', '--message', '--file', '--strategy', '--strategy-option', '--into-name', '--cleanup']);
export function gitMerge(words, cwd) {
  if (!/(^|\/)git$/.test(words[0]?.text ?? '')) return null;
  let i = 1;
  for (; i < words.length && words[i].text.startsWith('-'); i++) {
    const t = words[i].text;
    if (t === '-C') cwd = resolve(cwd, (words[++i]?.text ?? '').replace(/^~(?=\/|$)/, homedir()));
    else if (GIT_VALUE_OPTS.has(t)) i++;
  }
  if (words[i]?.text !== 'merge') return null;
  const targets = [];
  for (i++; i < words.length; i++) {
    const t = words[i].text;
    if (['--abort', '--continue', '--quit', '--skip'].includes(t)) return null;
    if (t === '--') {
      targets.push(...words.slice(i + 1));
      break;
    }
    if (/^\d*[<>]/.test(t)) {
      if (/^\d*[<>]+&?$/.test(t)) i++; // a redirection and its file
    } else if (MERGE_VALUE.has(t)) i++;
    else if (!t.startsWith('-')) targets.push(words[i]);
  }
  return targets.length ? { cwd, targets } : null;
}

// --- the hook ----------------------------------------------------------------------------------

// The simple commands of a shell line, split at ;, &, |, ( ) and newlines, as words { text, dynamic };
// `dynamic` marks a word the shell would expand ($, `), so its value is unknown here.
export function shellCommands(line) {
  const cmds = [[]];
  let word = null;
  let quote = null;
  const add = (ch, dynamic = false) => {
    word ??= { text: '', dynamic: false };
    word.text += ch;
    word.dynamic ||= dynamic;
  };
  const end = () => {
    if (word) cmds.at(-1).push(word);
    word = null;
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else add(c);
    } else if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === '\\' && i + 1 < line.length) add(line[++i]);
      else add(c, c === '$' || c === '`');
    } else if (c === "'" || c === '"') {
      quote = c;
      word ??= { text: '', dynamic: false };
    } else if (c === '\\' && i + 1 < line.length) add(line[++i]);
    else if (c === ' ' || c === '\t') end();
    else if (/[;&|()\n]/.test(c)) {
      end();
      if (cmds.at(-1).length) cmds.push([]);
    } else add(c, c === '$' || c === '`');
  }
  end();
  return cmds.filter((c) => c.length);
}

// `gh [-R repo] pr merge [flags] [target]` as { target, repo }, where target is the first word that
// is not a flag or a flag's value (none: the current branch's PR, as gh does); else null.
const GH_VALUE_FLAGS = new Set(['-t', '--subject', '-b', '--body', '-F', '--body-file', '-A', '--author-email', '--match-head-commit']);
export function ghMerge(words) {
  if (words[0]?.text !== 'gh') return null;
  const repo = [];
  let target = null;
  let i = 1;
  const flag = () => {
    const t = words[i].text;
    if (t === '-R' || t === '--repo') repo.push(t, words[++i]?.text ?? '');
    else if (t.startsWith('--repo=')) repo.push(t);
    else return false;
    return true;
  };
  for (; i < words.length && words[i].text.startsWith('-'); i++) flag();
  if (words[i]?.text !== 'pr' || words[i + 1]?.text !== 'merge') return null;
  for (i += 2; i < words.length; i++) {
    const t = words[i].text;
    if (t === '--') {
      target ??= words[i + 1] ?? null;
      break;
    }
    if (/^\d*[<>]/.test(t)) {
      if (/^\d*[<>]+&?$/.test(t)) i++; // a redirection and its file
    } else if (t.startsWith('-')) {
      if (!flag() && GH_VALUE_FLAGS.has(t)) i++;
    } else target ??= words[i];
  }
  return { target, repo };
}

// PreToolUse on Bash (hooks/hooks.json filters to the merge and the commit). Reads the hook's
// JSON on stdin and checks every `gh pr merge` and `git merge` in the command line, each from
// the directory a `cd` before it left. Per repository: nothing without gate_pr or with gate_pr_mode
// off; observe (the default) logs to <gates>/observe.log and tells the session what enforce would
// refuse; enforce exits 2 with the missing steps. Its own errors, a config error or a PR it can't
// identify are logged and told to the session, and let the command through.
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
function hook(_repo, _pos, _flags, stdin = readFileSync(0, 'utf8')) {
  const told = [];
  const refused = [];
  let input;
  try {
    input = JSON.parse(stdin);
  } catch (err) {
    told.push(`lc-gate hook: unreadable hook input (${err.message}); nothing was checked`);
  }
  const session = process.env.LC_SESSION || input?.session_id || '';
  let cwd = resolve(input?.cwd || process.cwd());
  const points = [];
  const plans = []; // edits and commits, checked against gate_pr_plan
  if (EDIT_TOOLS.has(input?.tool_name)) {
    const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
    if (file) plans.push({ point: 'edit', file: resolve(cwd, String(file)) });
  } else {
    for (const cmd of shellCommands(String(input?.tool_input?.command ?? ''))) {
      const w = cmd.slice(cmd.findIndex((x) => !/^[A-Za-z_]\w*=/.test(x.text)));
      if (w[0]?.text === 'cd' && w[1] && !w[1].dynamic) cwd = resolve(cwd, w[1].text.replace(/^~(?=\/|$)/, homedir()));
      else if (ghMerge(w)) points.push({ point: 'merge', cwd, ...ghMerge(w) });
      else if (gitMerge(w, cwd)) for (const target of gitMerge(w, cwd).targets) points.push({ point: 'merge', cwd: gitMerge(w, cwd).cwd, local: target });
      else if (gitCommit(w, cwd)) plans.push({ point: 'commit', ...gitCommit(w, cwd) });
    }
  }
  // The plan before the work (gate_pr_plan): an edit is checked on its file, a commit on every
  // changed file, and a commit's --no-verify is refused while a planned step applies to it.
  for (const p of plans) {
    let log = null;
    const note = (entry) => log && appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), point: 'plan', on: p.point, session, ...entry }) + '\n');
    try {
      let dir = p.file ? dirname(p.file) : p.cwd;
      while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
      const repo = fastGit(dir, 'rev-parse', '--show-toplevel').stdout.trim();
      if (!repo) continue;
      const st = planState(repo, p.file ? { files: [p.file] } : { pending: true });
      if (!st) continue;
      const said = announce(st.cfg, st.modeState);
      if (said) told.push(said);
      const problems = st.missing.length ? [st.message] : [];
      if (p.noVerify) problems.push(`git commit --no-verify (-n) skips the pre-commit plan check, and step(s) ${st.applies.map((s) => s.id).join(', ')} apply to this commit: commit without it`);
      if (!problems.length) continue;
      if (st.mode !== 'enforce' && p.point === 'commit' && !firstTellForCommit(repo, st)) continue;
      log = join(gatesRoot(st.cfg), 'observe.log');
      mkdirSync(dirname(log), { recursive: true });
      note({ mode: st.mode, branch: st.branch, missing: st.missing.map((s) => s.id), files: st.files.slice(0, 20), ...(p.noVerify ? { noVerify: true } : {}), ...(st.mode === 'enforce' ? { refused: true } : {}) });
      if (st.mode === 'enforce') refused.push(problems.join('\n'));
      else told.push(`lc-gate (observe mode): this ${p.point} went ahead, but gate_pr_plan: enforce would refuse it: ${problems.join('\n')}`);
    } catch (err) {
      try {
        note({ error: err.message });
      } catch {
        // nowhere to log
      }
      told.push(`lc-gate hook could not check the plan for this ${p.point}, so it goes ahead unchecked: ${err.message}`);
    }
  }
  for (const p of points) {
    let log = null;
    const note = (entry) => log && appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), point: p.point, session, ...entry }) + '\n');
    try {
      const repo = exec('git', ['-C', p.cwd, 'rev-parse', '--show-toplevel'], { ok: true }).stdout.trim();
      if (!repo || !existsSync(join(repo, '.agents/project.yaml'))) continue;
      const cfg = loadConfig(repo);
      mkdirSync(gatesRoot(cfg), { recursive: true });
      log = join(gatesRoot(cfg), 'observe.log');
      const modeState = gateMode(cfg, 'gate_pr_mode');
      const { mode } = modeState;
      if (mode === 'off') continue;
      const steps = parseSteps(cfg.conf, 'pr');
      if (!steps.length) continue;
      const said = announce(cfg, modeState);
      if (said) told.push(said);
      let branch;
      let head;
      if (p.local) {
        // git merge: checked only into the default branch, for a branch of this repository.
        const into = fastGit(p.cwd, 'symbolic-ref', '-q', '--short', 'HEAD').stdout.trim();
        if (!into || !isMainBranch(repo, into)) continue;
        if (p.local.dynamic) die(`can't tell which branch \`git merge ${p.local.text}\` merges: the shell expands it`);
        const t = p.local.text;
        const local = fastGit(repo, 'rev-parse', '--verify', '-q', `refs/heads/${t}`).status === 0;
        const remote = !local && fastGit(repo, 'rev-parse', '--verify', '-q', `refs/remotes/${t}`).status === 0;
        if (!local && !remote) die(`can't tell which branch \`git merge ${t}\` merges: no local or remote branch of that name`);
        branch = local ? t : t.replace(/^[^/]+\//, '');
        if (branch === into) continue; // the default branch's own remote copy
        head = git(repo, 'rev-parse', `${local ? 'refs/heads' : 'refs/remotes'}/${t}^{commit}`);
      } else {
        if (p.target?.dynamic) die(`can't tell which PR \`gh pr merge ${p.target.text}\` merges: the shell expands it`);
        const view = exec('gh', ['pr', 'view', ...(p.target ? [p.target.text] : []), ...p.repo, '--json', 'headRefName,headRefOid'], { cwd: p.cwd, timeout: GH_TIMEOUT });
        ({ headRefName: branch, headRefOid: head } = JSON.parse(view.stdout));
        // The PR's head and main as the remote has them (an update-branch happens on the remote).
        fetchOrigin(repo);
      }
      const id = branchId(branch);
      const missing = check(steps, readRecords(gateDir(cfg, 'pr', id)), head, prCurrent(repo, head, { conf: cfg.conf }));
      // The gate's own record of a merge it let through, complete or not: `observe <n>` counts the
      // complete ones. A merge refused here never happens, so it leaves no mark.
      if (!missing.length || mode !== 'enforce') markMerged(cfg, id, branch, head, missing);
      if (!missing.length) continue;
      const what = `the PR gate for ${branch} at ${head.slice(0, 12)} does not hold:\n  ${missing.join('\n  ')}\nRun lc-gate run pr ${id} until it holds, then lc-gate merge pr ${id}.`;
      note({ mode, branch, head, missing, ...(mode === 'enforce' ? { refused: true } : {}) });
      if (mode === 'enforce') refused.push(what);
      else told.push(`lc-gate (observe mode): this ${p.point} went ahead, but enforce mode would have refused it: ${what}`);
    } catch (err) {
      try {
        note({ error: err.message });
      } catch {
        // nowhere to log
      }
      told.push(`lc-gate hook could not check this ${p.point}, so it goes ahead unchecked: ${err.message}`);
    }
  }
  if (refused.length) {
    process.stderr.write(`lc-gate: ${[...refused, ...told].join('\n')}\n`);
    return 2;
  }
  if (told.length) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: told.join('\n') } }));
  return 0;
}

// --- merge -------------------------------------------------------------------------------------

function fetchOrigin(repo) {
  if (exec('git', ['-C', repo, 'remote', 'get-url', 'origin'], { ok: true }).status === 0) exec('git', ['-C', repo, 'fetch', '-q', 'origin'], { timeout: GH_TIMEOUT });
}

// The gate's own mark of a merge it let through, complete or not: `observe <n>` counts the complete ones.
function markMerged(cfg, id, branch, head, missing) {
  writeJson(join(gateDir(cfg, 'pr', id), 'merged.json'), { branch, head, at: new Date().toISOString(), complete: !missing.length, ...(missing.length ? { missing } : {}) });
}

// The Verified-By trailer: each step's status (a step with no record: missing).
const trailer = (gate, id, sha, steps, records) =>
  `Verified-By: lc-gate ${gate} ${id} ${sha} ${steps.map((s) => `${s.id}=${records[s.id] ? `${records[s.id].status}${records[s.id].carried ? '(carried)' : ''}` : 'missing'}`).join(' ')}`;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// `lc-gate merge pr [branch]`: the one way a PR merges, one at a time (<gates>/merge.lock, with its
// holder and time; a held lock is refused). A branch behind its base is updated on the host first (a
// conflict stops it: the implementer merges main by hand, and the gate reviews the resolved lines).
// Then the gate's checks step is read on the head until the host's verdict is in (LC_GATE_MERGE_WAIT
// seconds, 1800; every LC_GATE_MERGE_POLL, 15), every record must hold there as the merge hook checks
// it, and gh merges exactly that head with the Verified-By trailer: never --admin, --auto, or a branch
// deleted. gate_pr_mode off or observe: as the hook in that mode.
async function merge(repo, [gate, branchArg]) {
  if (gate !== 'pr') die('usage: lc-gate merge pr [branch]');
  const cfg = loadConfig(repo);
  const steps = parseSteps(cfg.conf, 'pr');
  if (!steps.length) die(`no gate_pr: block in ${join(cfg.repo, '.agents/project.yaml')}`);
  const modeState = gateMode(cfg, 'gate_pr_mode');
  const branch = branchArg ?? git(repo, 'rev-parse', '--abbrev-ref', 'HEAD');
  const lock = join(gatesRoot(cfg), 'merge.lock');
  mkdirSync(dirname(lock), { recursive: true });
  try {
    writeFileSync(lock, JSON.stringify({ holder: process.env.LC_SESSION || 'lead', branch, pid: process.pid, at: new Date().toISOString() }) + '\n', { flag: 'wx' });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    let h = {};
    try {
      h = readJson(lock, {});
    } catch {
      // an unreadable lock is still held
    }
    die(`one merge at a time: ${lock} is held by ${h.holder ?? 'an unknown holder'} (merging ${h.branch ?? '?'} since ${h.at ?? '?'}, pid ${h.pid ?? '?'}); wait for it, or remove the file once that merge is gone`);
  }
  try {
    const said = announce(cfg, modeState);
    if (said) console.log(said);
    return await mergeLocked(repo, cfg, steps, modeState.mode, branch);
  } finally {
    rmSync(lock, { force: true });
  }
}

async function mergeLocked(repo, cfg, steps, mode, branch) {
  const view = () => JSON.parse(exec('gh', ['pr', 'view', branch, '--json', 'number,headRefOid,headRefName,baseRefName,mergeStateStatus'], { cwd: repo, timeout: GH_TIMEOUT }).stdout);
  let pr = view();
  const id = branchId(pr.headRefName);
  const byHand = `The implementer merges ${pr.baseRefName} into ${pr.headRefName} by hand (git merge, never a rebase) and pushes; the gate then reviews the hand-resolved lines (lc-gate run pr ${id}). Then lc-gate merge pr ${id} again.`;
  fetchOrigin(repo);
  if (pr.mergeStateStatus === 'DIRTY') die(`${pr.headRefName} conflicts with ${pr.baseRefName}; nothing merged. ${byHand}`);
  // Behind: as the host says, or as origin's copy of the base shows (the host says BEHIND only when
  // its protection asks for an up-to-date branch).
  const base = `refs/remotes/origin/${pr.baseRefName}`;
  const known = exec('git', ['-C', repo, 'rev-parse', '--verify', '-q', base], { ok: true }).status === 0 && exec('git', ['-C', repo, 'cat-file', '-e', `${pr.headRefOid}^{commit}`], { ok: true }).status === 0;
  if (pr.mergeStateStatus === 'BEHIND' || (known && exec('git', ['-C', repo, 'merge-base', '--is-ancestor', base, pr.headRefOid], { ok: true }).status === 1)) {
    const u = exec('gh', ['pr', 'update-branch', String(pr.number)], { cwd: repo, timeout: GH_TIMEOUT, ok: true });
    if (u.status) die(`GitHub would not update ${pr.headRefName} from ${pr.baseRefName} (${u.stderr.trim().split('\n').at(-1) ?? ''}); nothing merged. ${byHand}`);
    const was = pr.headRefOid;
    for (let i = 0; i < 10 && pr.headRefOid === was; i++) {
      if (i) await sleep(3000);
      pr = view();
    }
    if (pr.headRefOid === was) die(`updated ${pr.headRefName}, but the host still shows head ${was.slice(0, 12)}; run lc-gate merge pr ${id} again`);
    console.log(`updated ${pr.headRefName} from ${pr.baseRefName}: head ${pr.headRefOid.slice(0, 12)}`);
    fetchOrigin(repo);
  }
  const head = pr.headRefOid;
  const dir = gateDir(cfg, 'pr', id);
  // The checks step at this head: the host's verdict, waited for, is its record.
  const cs = steps.find((s) => s.kind === 'checks');
  if (cs) {
    const wait = Number(process.env.LC_GATE_MERGE_WAIT || 1800);
    const until = Date.now() + wait * 1000;
    let r = hostChecks(cfg, head);
    while (r.wait && Date.now() < until) {
      await sleep(Math.min(Number(process.env.LC_GATE_MERGE_POLL || 15) * 1000, until - Date.now()));
      r = hostChecks(cfg, head);
    }
    if (r.wait) die(`${cs.id} ${r.wait}, still after ${wait}s (LC_GATE_MERGE_WAIT); nothing merged`);
    writeJson(join(dir, 'records', `${cs.id}.json`), { step: cs.id, status: r.status, sha: head, evidence: r.evidence, by: 'lc-gate', at: new Date().toISOString(), reason: r.reason });
    if (r.status === 'fail') die(`${cs.id}: FAIL (${r.reason}); nothing merged. ${r.evidence}`);
    console.log(`${cs.id}: PASS at ${head.slice(0, 12)}`);
  }
  const records = readRecords(dir);
  if (mode !== 'off') {
    const missing = check(steps, records, head, prCurrent(repo, head, { conf: cfg.conf }));
    if (missing.length) {
      const what = `the PR gate for ${pr.headRefName} at ${head.slice(0, 12)} does not hold:\n  ${missing.join('\n  ')}`;
      const log = join(gatesRoot(cfg), 'observe.log');
      appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), point: 'merge', session: process.env.LC_SESSION || '', mode, branch: pr.headRefName, head, missing, ...(mode === 'enforce' ? { refused: true } : {}) }) + '\n');
      if (mode === 'enforce') die(`${what}\nRun lc-gate run pr ${id} until it holds; nothing merged`);
      console.log(`lc-gate (observe mode): this merge goes ahead, but enforce mode would refuse it: ${what}`);
    }
    markMerged(cfg, id, pr.headRefName, head, missing);
  }
  const body = trailer('pr', id, head, steps, records);
  exec('gh', ['pr', 'merge', String(pr.number), '--merge', '--match-head-commit', head, '--body', body], { cwd: repo, timeout: GH_TIMEOUT });
  console.log(`merged #${pr.number} (${pr.headRefName}) at ${head}\n${body}`);
  return 0;
}

// `lc-gate questions <file>`: the rows a session's findings file answers.
function listQuestions(file, cwd) {
  if (!file) die('usage: lc-gate questions <question file>');
  const qs = questions(readFileSync(resolve(cwd, file), 'utf8'));
  if (!qs.length) die(`${file} has no numbered or bulleted item`);
  qs.forEach((q, i) => console.log(`Q${i + 1} ${q}`));
}

// --- main --------------------------------------------------------------------------------------

const BOOLEAN = new Set(['carry', 'write', 'trailer', 'staged', 'files', 'strict', 'md', 'yes']);
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

export async function main(argv, cwd = process.cwd()) {
  const [cmd, ...rest] = argv;
  const repo = exec('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { ok: true }).stdout.trim() || cwd;
  const { pos, flags } = parseArgs(rest);
  const commands = { run, record, status, hook, merge, enforcement, protect, questions: (r, p) => listQuestions(p[0], cwd), 'plan-check': (r, p, f) => planCheck(r, p, f, cwd), check: (r, p, f) => (f.diff ? checkPhaseDiff(r, f.diff, p[1]) : checkGate(r, p, f)) };
  if (!commands[cmd]) die(`usage: lc-gate run|record|status|check|merge|questions|plan-check|hook|enforcement|protect …; see the top of gate/gate.mjs`);
  return (await commands[cmd](repo, pos, flags)) ?? 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof GateError)) throw err;
    console.error(`lc-gate: ${err.message}`);
    process.exitCode = 1;
  }
}
