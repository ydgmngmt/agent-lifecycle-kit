// The check's invariants. Run: node --test gate/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerProblems, check, parseSteps, prCurrent, questions } from './gate.mjs';
import { parseProject } from '../board/config.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const steps = [
  { id: 'build', kind: 'command' },
  { id: 'review', kind: 'session' },
];
const pass = (step, extra = {}) => ({ step, status: 'pass', sha: A, evidence: '/e', by: 'lead', reason: '', ...extra });

test('every step passing at the candidate holds', () => {
  assert.deepEqual(check(steps, { build: pass('build'), review: pass('review') }, A), []);
});

test('a missing step fails', () => {
  assert.deepEqual(check(steps, { build: pass('build') }, A), ['review: missing']);
});

test('a record for another commit fails', () => {
  const [p] = check(steps, { build: pass('build'), review: pass('review', { sha: B }) }, A);
  assert.match(p, /^review: recorded for bbbbbbbbbbbb, not the candidate/);
});

test('a FAIL fails', () => {
  assert.deepEqual(check(steps, { build: pass('build', { status: 'fail' }), review: pass('review') }, A), ['build: FAIL']);
});

test('N/A needs a reason', () => {
  assert.deepEqual(check(steps, { build: pass('build', { status: 'na' }), review: pass('review') }, A), ['build: N/A without a reason']);
  assert.deepEqual(check(steps, { build: pass('build', { status: 'na', reason: 'no build here' }), review: pass('review') }, A), []);
});

test('N/A or a carry by a spawned session fails', () => {
  const na = pass('review', { status: 'na', reason: 'r', by: 'gate-x-review', spawned: true });
  assert.match(check(steps, { build: pass('build'), review: na }, A)[0], /N\/A recorded by spawned session gate-x-review; only the lead may/);
  const carried = pass('review', { reason: 'r', by: 'gate-x-review', spawned: true, carried: { from: B } });
  assert.match(check(steps, { build: pass('build'), review: carried }, A)[0], /carried by spawned session/);
});

const sh = (cwd, cmd) => {
  const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

test('a spawned session cannot record N/A or a carry, nor another step', () => {
  const repo = mkdtempSync(join(tmpdir(), 'lc-gate-'));
  sh(repo, 'git init -q && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m one');
  mkdirSync(join(repo, '.agents'));
  writeFileSync(join(repo, '.agents/project.yaml'), `handoff_dir: ${repo}/state\ngate_pr:\n  build: command true\n  review: session q.md\n`);
  const gate = fileURLToPath(new URL('./gate.mjs', import.meta.url));
  const run = (env, ...args) => spawnSync('node', [gate, ...args, '--candidate', 'HEAD'], { cwd: repo, encoding: 'utf8', env: { ...process.env, ...env } });
  const spawned = { LC_SESSION: 'gate-x-review', LC_GATE_STEP: 'pr/x/review' };
  assert.match(run(spawned, 'record', 'pr', 'x', 'review', 'na', '--reason', 'r').stderr, /may not record N\/A/);
  assert.match(run(spawned, 'record', 'pr', 'x', 'build', 'pass', '--evidence', 'q').stderr, /may record only that step/);
  assert.match(run(spawned, 'record', 'pr', 'x', 'review', 'pass', '--carry', '--reason', 'r').stderr, /may not carry/);
  assert.equal(run({}, 'record', 'pr', 'x', 'review', 'na', '--reason', 'r').status, 0);
});

test('a PR record holds after update-branch merges main, not after a new commit', () => {
  const repo = mkdtempSync(join(tmpdir(), 'lc-gate-'));
  const c = 'git -c user.name=t -c user.email=t@t';
  sh(repo, `git init -q -b main && ${c} commit -q --allow-empty -m base && git checkout -q -b pr && ${c} commit -q --allow-empty -m change`);
  const recorded = sh(repo, 'git rev-parse HEAD');
  sh(repo, `git checkout -q main && ${c} commit -q --allow-empty -m other && git checkout -q pr && ${c} merge -q --no-edit main`);
  const merged = sh(repo, 'git rev-parse HEAD');
  assert.equal(prCurrent(repo, merged)(recorded), true);
  sh(repo, `${c} commit -q --allow-empty -m more`);
  const moved = sh(repo, 'git rev-parse HEAD');
  assert.equal(prCurrent(repo, moved)(recorded), false);
  assert.equal(prCurrent(repo, recorded)(merged), false);
});

// A repository with this project file committed, and lc-gate to run in it.
function project(yaml) {
  const repo = mkdtempSync(join(tmpdir(), 'lc-gate-'));
  sh(repo, 'git init -q -b main && git config user.name t && git config user.email t@t');
  mkdirSync(join(repo, '.agents'));
  writeFileSync(join(repo, '.agents/project.yaml'), yaml.replaceAll('$STATE', `${repo}/state`));
  sh(repo, 'git add -A && git commit -qm one');
  const gate = fileURLToPath(new URL('./gate.mjs', import.meta.url));
  const lc = (env, ...args) => spawnSync('node', [gate, ...args], { cwd: repo, encoding: 'utf8', env: { ...process.env, LC_GATE_STEP: '', ...env } });
  return { repo, lc, git: (cmd) => sh(repo, cmd) };
}

test('a PR record does not hold across a merge of a branch that is not on main', () => {
  const { git } = project('x: 1\n');
  git('git checkout -q -b pr && git commit -q --allow-empty -m change');
  const recorded = git('git rev-parse HEAD');
  git('git checkout -q -b side main && echo unreviewed > u.txt && git add u.txt && git commit -qm side');
  git('git checkout -q pr && git merge -q --no-ff --no-edit side');
  assert.equal(prCurrent(git('pwd'), git('git rev-parse HEAD'))(recorded), false);
});

test("a spawned session's record names the candidate it was briefed on", () => {
  const { lc, git } = project('handoff_dir: $STATE\ngate_pr:\n  review: session q.md\n');
  const a = git('git rev-parse HEAD');
  git('git commit -q --allow-empty -m two');
  const s = { LC_SESSION: 'gate-x-review', LC_GATE_STEP: 'pr/x/review' };
  assert.equal(lc({}, 'record', 'pr', 'x', 'review', 'na', '--reason', 'seed', '--candidate', 'HEAD').status, 0);
  mkdirSync(`${git('pwd')}/state/gates/pr/x/findings`, { recursive: true });
  writeFileSync(`${git('pwd')}/q.md`, '1. Is it right?\n');
  writeFileSync(`${git('pwd')}/state/gates/pr/x/findings/review.md`, '| Q1 | Is it right? | yes | a.js:1 | sound |\n');
  assert.match(lc(s, 'record', 'pr', 'x', 'review', 'pass', '--evidence', `${git('pwd')}/state/gates/pr/x/findings/review.md`).stderr, /--candidate/);
  assert.equal(lc(s, 'record', 'pr', 'x', 'review', 'pass', '--evidence', `${git('pwd')}/state/gates/pr/x/findings/review.md`, '--candidate', a).status, 0);
  assert.match(lc({}, 'check', 'pr', 'x').stderr, /review: recorded for/);
});

test('a step line the reader cannot parse is an error, not a dropped step', () => {
  for (const line of ['  review.security: session q.md', '\treview: session q.md']) {
    const conf = parseProject(`gate_pr:\n  build: command true\n${line}\n`);
    assert.throws(() => parseSteps(conf, 'pr'), /cannot read/);
  }
});

test('a FAIL cannot be carried', () => {
  const { lc, git } = project('handoff_dir: $STATE\ngate_pr:\n  build: command true\n');
  writeFileSync(join(git('pwd'), 'log.txt'), 'failed');
  assert.equal(lc({}, 'record', 'pr', 'x', 'build', 'fail', '--evidence', 'log.txt', '--candidate', 'HEAD').status, 0);
  git('git commit -q --allow-empty -m fix');
  const r = lc({}, 'record', 'pr', 'x', 'build', 'pass', '--carry', '--reason', 'r', '--candidate', 'HEAD');
  assert.match(r.stderr, /only a pass or N\/A is carried/);
});

test('a command step does not run on a dirty tree', () => {
  const { repo, lc } = project('handoff_dir: $STATE\ngate_pr:\n  build: command true\n');
  writeFileSync(join(repo, '.agents/project.yaml'), `handoff_dir: ${repo}/state\ngate_pr:\n  build: command true\n# dirty\n`);
  const out = lc({}, 'run', 'pr', 'x', '--base', 'HEAD');
  assert.match(out.stdout, /uncommitted changes/);
  assert.match(lc({}, 'check', 'pr', 'x').stderr, /build: missing/);
});

// The order: `after <step>[,<step>]` starts a step once each named step holds with PASS or N/A.
test('a step with after waits for the steps it names, then starts', () => {
  const { repo, lc } = project('handoff_dir: $STATE\ngate_pr:\n  build: command test -f $LC_GATE_EVIDENCE/../go\n  look: command true after build\n');
  const first = lc({}, 'run', 'pr', 'x', '--base', 'HEAD');
  assert.match(first.stdout, /build\s+command\s+FAIL/, first.stdout + first.stderr);
  assert.match(first.stdout, /look\s+command\s+waits until build passes or is N\/A/);
  writeFileSync(join(repo, 'state/gates/pr/x/go'), 'yes');
  const second = lc({}, 'run', 'pr', 'x');
  assert.match(second.stdout, /build\s+command\s+PASS/);
  assert.match(second.stdout, /look\s+command\s+PASS/);
});

test('a leftover after-gate is refused, naming after <step>; after names only a step above', () => {
  const read = (lines) => () => parseSteps(parseProject(`gate_pr:\n${lines}`), 'pr');
  assert.throws(read('  build: command true\n  review: command node pipeline.mjs review after-gate\n'), /"after-gate" is gone; write "after <step>\[,<step>\]"/);
  assert.throws(read('  fit: command check if mech after-gate\n'), /after-gate/);
  assert.throws(read('  review: session q.md after build\n  build: command true\n'), /"after build" names no step declared above/);
  assert.throws(read('  review: session q.md after review\n'), /names no step declared above/);
  const { lc } = project('handoff_dir: $STATE\ngate_pr:\n  review: command true after-gate\n');
  assert.match(lc({}, 'run', 'pr', 'main').stderr, /after-gate" is gone/);
});

test('a step line reads kind, argument, if and after; a trailing "plan" stays part of the command', () => {
  const conf = parseProject('paths:\n  mech: src/**\ngate_pr:\n  build: command true\n  fit: command check-review if mech after build\n  tf: command terraform plan\n  both: session q.md after build, fit\n');
  const [, fit, tf, both] = parseSteps(conf, 'pr');
  assert.deepEqual(fit, { id: 'fit', kind: 'command', arg: 'check-review', if: 'mech', after: ['build'] });
  assert.deepEqual(tf, { id: 'tf', kind: 'command', arg: 'terraform plan', if: null });
  assert.deepEqual(both.after, ['build', 'fit']);
});

test('a step with no argument keeps its condition', () => {
  const conf = parseProject('paths:\n  protected: .agents/**\ngate_pr:\n  gate-review: session q.md\n  ci: checks if protected after gate-review\n  say: command Some text. if protected\n  plain: checks\n');
  const [, ci, say, plain] = parseSteps(conf, 'pr');
  assert.deepEqual(ci, { id: 'ci', kind: 'checks', arg: '', if: 'protected', after: ['gate-review'] });
  assert.deepEqual(say, { id: 'say', kind: 'command', arg: 'Some text.', if: 'protected' });
  assert.deepEqual(plain, { id: 'plain', kind: 'checks', arg: '', if: null });
  assert.throws(() => parseSteps(parseProject('gate_pr:\n  ci: checks verify-pr\n'), 'pr'), /takes no argument/);
  assert.throws(() => parseSteps(parseProject('gate_pr:\n  ok: here look at it\n'), 'pr'), /is not "<kind> <argument>/);
  assert.throws(() => parseSteps(parseProject('gate_pr:\n  ok: owner\n'), 'pr'), /is not "<kind> <argument>/);
});

// A fake gh on PATH: logs its arguments to gh.log; `pr view --json body` prints body.json, any other
// `pr view` view.json (view2.json once `pr update-branch` ran, which fails with update.err when that
// exists); `api …check-runs…` prints runs.json, one check run per line; `pr create` and `pr edit`
// keep their --body-file in body.out.
function fakeGh() {
  const dir = mkdtempSync(join(tmpdir(), 'lc-gh-'));
  writeFileSync(join(dir, 'gh'), `#!/bin/sh
d=$(dirname "$0")
echo "$*" >> "$d/gh.log"
case "$*" in
  *"pr update-branch"*) [ -f "$d/update.err" ] && { cat "$d/update.err" >&2; exit 1; }; touch "$d/updated"; exit 0 ;;
  *"--json body"*) cat "$d/body.json"; exit 0 ;;
  *"pr view"*) if [ -f "$d/updated" ]; then cat "$d/view2.json"; else cat "$d/view.json"; fi; exit 0 ;;
  *check-runs*) cat "$d/runs.json" 2>/dev/null; exit 0 ;;
  *"pr create"*|*"pr edit"*) while [ $# -gt 0 ]; do [ "$1" = "--body-file" ] && cp "$2" "$d/body.out"; shift; done; exit 0 ;;
esac
exit 0
`, { mode: 0o755 });
  return {
    dir,
    env: { PATH: `${dir}:${process.env.PATH}` },
    set: (f, text) => writeFileSync(join(dir, f), text),
    log: () => (existsSync(join(dir, 'gh.log')) ? readFileSync(join(dir, 'gh.log'), 'utf8') : ''),
  };
}
const checkRun = (name, status, conclusion, id, at = '2026-01-01T00:00:00Z') => JSON.stringify({ name, status, conclusion, started_at: at, id, html_url: `https://github.com/o/r/runs/${id}` });

test('a checks step passes, fails or waits on the newest run of each required check on the exact commit', () => {
  const { repo, lc, git } = project('handoff_dir: $STATE\nci:\n  required_checks: verify-pr pr-body\ngate_pr:\n  ci: checks\n');
  git('git checkout -q -b feat && git commit -q --allow-empty -m work');
  const head = git('git rev-parse HEAD');
  const gh = fakeGh();
  gh.set('runs.json', '');
  let r = lc(gh.env, 'run', 'pr', 'feat');
  assert.match(r.stdout, /ci\s+checks\s+waits for the checks on [0-9a-f]{12}: not started: verify-pr, pr-body: no check run on [0-9a-f]{12} at all; is the head pushed\?/, r.stdout + r.stderr);
  assert.match(gh.log(), new RegExp(`api --paginate repos/\\{owner\\}/\\{repo\\}/commits/${head}/check-runs`));
  gh.set('runs.json', checkRun('verify-pr', 'in_progress', null, 1));
  r = lc(gh.env, 'run', 'pr', 'feat');
  assert.match(r.stdout, /waits for the checks on [0-9a-f]{12}: running: verify-pr; not started: pr-body$/m);
  assert.match(lc({}, 'check', 'pr', 'feat').stderr, /ci: missing/);
  // An older failure under a newer success of the same name: the newest counts. Skipped passes.
  gh.set('runs.json', [checkRun('verify-pr', 'completed', 'failure', 1), checkRun('verify-pr', 'completed', 'success', 2, '2026-01-01T00:05:00Z'), checkRun('pr-body', 'completed', 'skipped', 3)].join('\n'));
  r = lc(gh.env, 'run', 'pr', 'feat');
  assert.match(r.stdout, /ci\s+checks\s+PASS/);
  const rec = JSON.parse(readFileSync(join(repo, 'state/gates/pr/feat/records/ci.json'), 'utf8'));
  assert.equal(rec.evidence, `https://github.com/o/r/commit/${head}/checks`);
  assert.equal(lc({}, 'check', 'pr', 'feat').status, 0);
  // A failure fails, even while another check still runs.
  git('git commit -q --allow-empty -m more');
  gh.set('runs.json', [checkRun('verify-pr', 'completed', 'failure', 4), checkRun('pr-body', 'in_progress', null, 5)].join('\n'));
  r = lc(gh.env, 'run', 'pr', 'feat');
  assert.match(r.stdout, /ci\s+checks\s+FAIL \(verify-pr failure on [0-9a-f]{12}\)/);
  // Never carried, never passed by hand.
  git('git commit -q --allow-empty -m again');
  assert.match(lc({}, 'record', 'pr', 'feat', 'ci', 'pass', '--carry', '--reason', 'same code', '--candidate', 'HEAD').stderr, /never by carry/);
  writeFileSync(join(repo, 'ok.txt'), 'green');
  assert.match(lc({}, 'record', 'pr', 'feat', 'ci', 'pass', '--evidence', 'ok.txt', '--candidate', 'HEAD').stderr, /only the runner records its pass/);
});

test('a merge of main holds a record unless a line of it was resolved by hand; a checks record holds only at its commit', () => {
  const { git } = project('x: 1\n');
  const repo = git('pwd');
  git("printf 'one\\ntwo\\n' > f.txt && git add f.txt && git commit -qm f");
  git('git checkout -q -b pr && echo a > a.txt && git add a.txt && git commit -qm a');
  const recorded = git('git rev-parse HEAD');
  git('git checkout -q main && echo m > m.txt && git add m.txt && git commit -qm m && git checkout -q pr && git merge -q --no-edit main');
  const clean = prCurrent(repo, git('git rev-parse HEAD'));
  assert.equal(clean(recorded, { id: 'review', kind: 'session' }), true);
  assert.equal(clean(recorded, { id: 'ci', kind: 'checks' }), false);
  git("git checkout -q main && sed -i 's/two/MAIN/' f.txt && git commit -qam m2 && git checkout -q pr && sed -i 's/two/PR/' f.txt && git commit -qam p2");
  const before = git('git rev-parse HEAD');
  git("git merge -q --no-edit main >/dev/null 2>&1 || true; printf 'one\\nRESOLVED\\n' > f.txt && git add f.txt && git commit -qm 'merge main by hand'");
  assert.equal(prCurrent(repo, git('git rev-parse HEAD'))(before, { id: 'review', kind: 'session' }), false);
});

test("a command step with if holds across the PR's own change outside its paths, and runs again inside them", () => {
  const { repo, lc, git } = project('handoff_dir: $STATE\npaths:\n  live: src/**\ngate_pr:\n  live: command echo ran >> "$LC_GATE_EVIDENCE/../runs" if live\n');
  const runs = () => readFileSync(join(repo, 'state/gates/pr/feat/runs'), 'utf8').split('\n').filter(Boolean).length;
  git('git checkout -q -b feat && mkdir -p src && echo a > src/a.js && git add src && git commit -qm code');
  assert.match(lc({}, 'run', 'pr', 'feat').stdout, /live\s+command\s+PASS/);
  git('mkdir -p docs && echo d > docs/n.md && git add docs && git commit -qm docs');
  const docs = lc({}, 'run', 'pr', 'feat');
  assert.match(docs.stdout, /records that hold: live; none that does not/, docs.stdout);
  assert.equal(runs(), 1);
  assert.equal(lc({}, 'check', 'pr', 'feat').status, 0);
  git('echo b > src/b.js && git add src && git commit -qm fix');
  assert.match(lc({}, 'run', 'pr', 'feat').stdout, /no record holds; that do not: live/);
  assert.equal(runs(), 2);
  // A hand-resolved merge of main that touches its paths runs it again too.
  git("git checkout -q main && mkdir -p src && echo main > src/b.js && git add src && git commit -qm m && git checkout -q feat");
  git("git merge -q --no-edit main >/dev/null 2>&1 || true; echo both > src/b.js && git add src && git commit -qm 'merge main by hand'");
  lc({}, 'run', 'pr', 'feat');
  assert.equal(runs(), 3);
});

// lc-gate merge against the fake gh: the PR behind main, its checks, then the merge itself.
const MERGE = 'handoff_dir: $STATE\ngate_pr_mode: enforce\nci:\n  required_checks: verify-pr\ngate_pr:\n  ci: checks\n  look: session q.md after ci\n';
function behind() {
  const p = project(MERGE);
  p.git('git checkout -q -b feat && echo a > a.txt && git add a.txt && git commit -qm work');
  const old = p.git('git rev-parse HEAD');
  assert.equal(p.lc({}, 'record', 'pr', 'feat', 'look', 'na', '--reason', 'nothing for a session to read', '--candidate', 'HEAD').status, 0);
  p.git('git checkout -q main && echo m > m.txt && git add m.txt && git commit -qm m && git checkout -q feat && git merge -q --no-edit main');
  p.updated = p.git('git rev-parse HEAD');
  p.gh = fakeGh();
  const view = (head, state) => JSON.stringify({ number: 7, headRefOid: head, headRefName: 'feat', baseRefName: 'main', mergeStateStatus: state });
  p.gh.set('view.json', view(old, 'BEHIND'));
  p.gh.set('view2.json', view(p.updated, 'CLEAN'));
  p.gh.set('runs.json', checkRun('verify-pr', 'completed', 'success', 1));
  p.merge = (env = {}) => p.lc({ ...p.gh.env, ...env }, 'merge', 'pr', 'feat');
  return p;
}

test('lc-gate merge updates a behind branch, reads its checks on the new head, and merges exactly that head', () => {
  const p = behind();
  const r = p.merge();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const log = p.gh.log();
  assert.match(log, /^pr update-branch 7$/m);
  assert.match(log, new RegExp(`commits/${p.updated}/check-runs`));
  assert.match(log, new RegExp(`^pr merge 7 --merge --match-head-commit ${p.updated} --body Verified-By: lc-gate pr feat ${p.updated} ci=pass look=na$`, 'm'));
  assert.doesNotMatch(log, /--admin|--auto|--delete-branch/);
  assert.ok(!existsSync(join(p.repo, 'state/gates/merge.lock')));
  // A conflict: GitHub refuses the update, and main is merged in by hand.
  const q = behind();
  q.gh.set('update.err', 'merge conflict between base and head (HTTP 422)\n');
  const c = q.merge();
  assert.equal(c.status, 1);
  assert.match(c.stderr, /would not update feat from main .*Merge main into feat by hand \(git merge, never a rebase\)/);
  assert.doesNotMatch(q.gh.log(), /pr merge/);
});

test('lc-gate merge refuses on a failing check, and waits no longer than LC_GATE_MERGE_WAIT', () => {
  const p = behind();
  p.gh.set('runs.json', checkRun('verify-pr', 'completed', 'failure', 1));
  const r = p.merge();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ci: FAIL \(verify-pr failure on [0-9a-f]{12}\); nothing merged/);
  assert.doesNotMatch(p.gh.log(), /pr merge/);
  assert.ok(!existsSync(join(p.repo, 'state/gates/merge.lock')));
  p.gh.set('runs.json', checkRun('verify-pr', 'in_progress', null, 2));
  const slow = p.merge({ LC_GATE_MERGE_WAIT: '1', LC_GATE_MERGE_POLL: '1' });
  assert.equal(slow.status, 1);
  assert.match(slow.stderr, /running: verify-pr, still after 1s \(LC_GATE_MERGE_WAIT\); nothing merged/);
});

test('lc-gate merge refuses while another merge holds the lock, naming its holder', () => {
  const p = behind();
  mkdirSync(join(p.repo, 'state/gates'), { recursive: true });
  writeFileSync(join(p.repo, 'state/gates/merge.lock'), JSON.stringify({ holder: 'lead-other', branch: 'other', at: '2026-01-01T00:00:00Z' }));
  const r = p.merge();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /one merge at a time: .*merge\.lock is held by lead-other \(merging other since 2026-01-01T00:00:00Z/);
  assert.equal(p.gh.log(), '');
});

// A git before 2.36 has no --remerge-diff: no record holds across a merge, so the hook refuses.
test('when git cannot run --remerge-diff, a merge of main holds nothing and the merge hook refuses', () => {
  const { repo, lc, git } = project('handoff_dir: $STATE\ngate_pr_mode: enforce\ngate_pr:\n  review: session q.md\n');
  git('git checkout -q -b feat && echo a > a.txt && git add a.txt && git commit -qm work');
  assert.equal(lc({}, 'record', 'pr', 'feat', 'review', 'na', '--reason', 'nothing to read', '--candidate', 'HEAD').status, 0);
  git('git checkout -q main && echo m > m.txt && git add m.txt && git commit -qm m && git checkout -q feat && git merge -q --no-edit main');
  const gh = fakeGh();
  gh.set('view.json', JSON.stringify({ headRefName: 'feat', headRefOid: git('git rev-parse HEAD') }));
  const old = mkdtempSync(join(tmpdir(), 'lc-oldgit-'));
  writeFileSync(join(old, 'git'), `#!/bin/sh\ncase "$*" in *--remerge-diff*) echo "fatal: unrecognized argument: --remerge-diff" >&2; exit 128 ;; esac\nexec ${git('command -v git')} "$@"\n`, { mode: 0o755 });
  const gate = fileURLToPath(new URL('./gate.mjs', import.meta.url));
  const hook = (path) => spawnSync('node', [gate, 'hook'], { cwd: repo, encoding: 'utf8', env: { ...process.env, LC_GATE_STEP: '', PATH: path }, input: JSON.stringify({ tool_name: 'Bash', cwd: repo, tool_input: { command: 'gh pr merge feat' } }) });
  const held = hook(`${gh.dir}:${process.env.PATH}`);
  assert.equal(held.status, 0, held.stderr);
  const refused = hook(`${old}:${gh.dir}:${process.env.PATH}`);
  assert.equal(refused.status, 2, refused.stdout + refused.stderr);
  assert.match(refused.stderr, /review: recorded for [0-9a-f]{12}, not the candidate/);
});

test("lc-gate merge takes over a lock whose holder is gone, and a signal removes its own lock", async () => {
  const p = behind();
  mkdirSync(join(p.repo, 'state/gates'), { recursive: true });
  const lock = join(p.repo, 'state/gates/merge.lock');
  const dead = spawnSync('true').pid;
  writeFileSync(lock, JSON.stringify({ holder: 'lead-gone', branch: 'other', pid: dead, at: '2026-01-01T00:00:00Z' }));
  const r = p.merge();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`took over .*merge\\.lock from lead-gone \\(merging other since 2026-01-01T00:00:00Z, pid ${dead}\\): that process is gone`));
  assert.ok(!existsSync(lock));
  // Killed while it waits for the checks: the lock goes with it.
  const q = behind();
  q.gh.set('runs.json', checkRun('verify-pr', 'in_progress', null, 1));
  const qlock = join(q.repo, 'state/gates/merge.lock');
  const child = spawn('node', [fileURLToPath(new URL('./gate.mjs', import.meta.url)), 'merge', 'pr', 'feat'], { cwd: q.repo, env: { ...process.env, ...q.gh.env, LC_GATE_STEP: '', LC_GATE_MERGE_WAIT: '120', LC_GATE_MERGE_POLL: '1' }, stdio: 'ignore' });
  const exited = new Promise((done) => child.on('exit', (code) => done(code)));
  for (let i = 0; i < 100 && !(existsSync(qlock) && /check-runs/.test(q.gh.log())); i++) await new Promise((ok) => setTimeout(ok, 100));
  assert.ok(existsSync(qlock), 'the merge holds the lock while it waits');
  child.kill('SIGTERM');
  assert.equal(await exited, 143);
  assert.ok(!existsSync(qlock));
});

test('nobody records a command step pass by hand; the runner does', () => {
  const { repo, lc } = project('handoff_dir: $STATE\ngate_pr:\n  build: command true\n');
  writeFileSync(join(repo, 'log.txt'), 'ran it myself');
  const r = lc({}, 'record', 'pr', 'x', 'build', 'pass', '--evidence', 'log.txt', '--candidate', 'HEAD');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /lc-gate run pr x --rerun build/);
  assert.equal(lc({}, 'record', 'pr', 'x', 'build', 'fail', '--evidence', 'log.txt', '--candidate', 'HEAD').status, 0);
  assert.equal(lc({}, 'record', 'pr', 'x', 'build', 'na', '--reason', 'nothing to build', '--candidate', 'HEAD').status, 0);
});

test("a session step's pass comes only from the session started for it", () => {
  const { repo, lc } = project('handoff_dir: $STATE\ngate_pr:\n  review: session q.md\n');
  const findings = join(repo, 'state/gates/pr/x/findings/review.md');
  mkdirSync(join(findings, '..'), { recursive: true });
  writeFileSync(join(repo, 'q.md'), '1. Is it right?\n');
  writeFileSync(findings, '| Q1 | Is it right? | yes | a.js:1 | sound |\n');
  const lead = lc({}, 'record', 'pr', 'x', 'review', 'pass', '--evidence', findings, '--candidate', 'HEAD');
  assert.equal(lead.status, 1);
  assert.match(lead.stderr, /session step/);
  const own = { LC_SESSION: 'gate-x-review', LC_GATE_STEP: 'pr/x/review' };
  const r = lc(own, 'record', 'pr', 'x', 'review', 'pass', '--evidence', findings, '--candidate', 'HEAD');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(lc({}, 'record', 'pr', 'x', 'review', 'na', '--reason', 'no change to review', '--candidate', 'HEAD').status, 0);
});

// A review session answers per item: one findings row per question of its question file.
const QFILE = '# Review: x\n\nIntro text.\n\n1. **Types.** Are boundaries checked?\n2. **Errors.** Is an error swallowed?\n\n## Asked on every diff\n\n- Who owns each new dependency?\n  - an indented note, not a question\n\n```\n- not a question either\n```\n';
const row = (n, applies, checked, verdict) => `| Q${n} | q | ${applies} | ${checked} | ${verdict} |`;

test("a question file's questions are its top-level numbered and bulleted items", () => {
  assert.deepEqual(questions(QFILE), ['**Types.** Are boundaries checked?', '**Errors.** Is an error swallowed?', 'Who owns each new dependency?']);
});

test('a findings file answers every question, with what it checked', () => {
  const qs = questions(QFILE);
  const full = [row(1, 'yes', 'src/a.js:3', 'sound'), row(2, 'yes', 'src/b.js:9', 'comment'), row(3, 'no', 'no new dependency', 'n/a')].join('\n');
  assert.deepEqual(answerProblems(qs, `| Q | Question | Applies | Checked | Verdict |\n| --- | --- | --- | --- | --- |\n${full}\n`), []);
  assert.match(answerProblems(qs, row(1, 'yes', 'src/a.js:3', 'sound')).join('\n'), /Q2 .*no row[^]*Q3 .*no row/);
  assert.match(answerProblems(qs, full.replace('src/b.js:9', 'looked at it')).join('\n'), /Q2.*path:line/);
  assert.match(answerProblems(qs, full.replace('| no |', '| maybe |')).join('\n'), /Q3.*yes or no/);
  assert.match(answerProblems(qs, full.replace('comment', 'fine')).join('\n'), /Q2.*verdict/);
  for (const v of ['P1: F1', 'P2: F2', 'P3: F3']) assert.deepEqual(answerProblems(qs, full.replace('comment', v)), []);
  assert.match(answerProblems(qs, full.replace('comment', 'P4')).join('\n'), /Q2.*verdict/);
});

test("a session's record is refused without a row per question, and a pass with a must-fix row", () => {
  const { repo, lc } = project('handoff_dir: $STATE\ngate_pr:\n  review: session q.md\n');
  writeFileSync(join(repo, 'q.md'), QFILE);
  const findings = join(repo, 'state/gates/pr/x/findings/review.md');
  mkdirSync(join(findings, '..'), { recursive: true });
  const own = { LC_SESSION: 'gate-x-review', LC_GATE_STEP: 'pr/x/review' };
  const rec = (status) => lc(own, 'record', 'pr', 'x', 'review', status, '--evidence', findings, '--candidate', 'HEAD');
  writeFileSync(findings, 'No findings.');
  const none = rec('pass');
  assert.equal(none.status, 1);
  assert.match(none.stderr, /Q1 .*no row/);
  writeFileSync(findings, [row(1, 'yes', 'src/a.js:3', 'must-fix'), row(2, 'yes', 'src/b.js:9', 'sound')].join('\n'));
  assert.match(rec('fail').stderr, /Q3 .*no row/);
  writeFileSync(findings, [row(1, 'yes', 'src/a.js:3', 'must-fix'), row(2, 'yes', 'src/b.js:9', 'sound'), row(3, 'no', 'no new dependency', 'n/a')].join('\n'));
  assert.match(rec('pass').stderr, /Q1 is must-fix/);
  assert.equal(rec('fail').status, 0);
  // P1 to P4: a pass with a P1 or P2 row is refused; a P3 is recorded and does not fail the step.
  const rows = (v) => writeFileSync(findings, [row(1, 'yes', 'src/a.js:3', v), row(2, 'yes', 'src/b.js:9', 'sound'), row(3, 'no', 'no new dependency', 'n/a')].join('\n'));
  rows('P1: F1');
  assert.match(rec('pass').stderr, /Q1 is P1 or P2: record fail/);
  rows('p2: F1');
  assert.match(rec('pass').stderr, /Q1 is P1 or P2: record fail/);
  rows('P3: F1');
  assert.equal(rec('pass').status, 0);
  const listed = lc({}, 'questions', 'q.md');
  assert.match(listed.stdout, /^Q1 \*\*Types\.\*\*.*\nQ2 .*\nQ3 Who owns/);
});

// Right after a push the host may list no run yet: a commit a remote branch holds is not asked about.
test('a checks step with no run on a commit a remote branch holds says no run yet, not "is the head pushed?"', () => {
  const { lc, git } = project('handoff_dir: $STATE\nci:\n  required_checks: verify-pr\ngate_pr:\n  ci: checks\n');
  git('git checkout -q -b feat && git commit -q --allow-empty -m work && git update-ref refs/remotes/origin/feat HEAD');
  const gh = fakeGh();
  gh.set('runs.json', '');
  const r = lc(gh.env, 'run', 'pr', 'feat');
  assert.match(r.stdout, /no check run on [0-9a-f]{12} yet; the host has not listed its runs/, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /is the head pushed/);
});

test("a step's if reads the base's paths too: a change that drops its own file from them still gets the step", () => {
  const { lc, git } = project('handoff_dir: $STATE\npaths:\n  protected: rules.txt\ngate_pr:\n  approve: command true if protected\n');
  git('echo a > rules.txt && git add rules.txt && git commit -qm rules && git checkout -q -b feat');
  git("sed -i 's#protected: rules.txt#protected: other.txt#' .agents/project.yaml && echo b > rules.txt && git commit -qam 'loosen'");
  const r = lc({}, 'run', 'pr', 'feat');
  assert.match(r.stdout, /approve\s+command\s+PASS/, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /N\/A/);
});

test('run --wait walks again until a step changes: a check finishing ends it with the walk', async () => {
  const { repo, git } = project('handoff_dir: $STATE\nci:\n  required_checks: verify-pr\ngate_pr:\n  ci: checks\n');
  git('git checkout -q -b feat && git commit -q --allow-empty -m work');
  const gh = fakeGh();
  gh.set('runs.json', checkRun('verify-pr', 'in_progress', null, 1));
  const gate = fileURLToPath(new URL('./gate.mjs', import.meta.url));
  const child = spawn('node', [gate, 'run', 'pr', 'feat', '--wait'], { cwd: repo, env: { ...process.env, ...gh.env, LC_GATE_STEP: '', LC_GATE_WAIT: '20', LC_GATE_WAIT_POLL: '0.3' } });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const done = new Promise((ok) => child.on('exit', ok));
  await new Promise((ok) => setTimeout(ok, 1500));
  assert.match(out, /waits for the checks/);
  assert.doesNotMatch(out, /--wait:/);
  gh.set('runs.json', checkRun('verify-pr', 'completed', 'success', 1));
  assert.equal(await done, 0, out);
  assert.match(out, /--wait: after \d+s, changed: ci\n[^]*ci\s+checks\s+PASS[^]*every step holds/);
});

test('run --wait ends at LC_GATE_WAIT with the last walk, and at once when nothing runs that could change a step', () => {
  const { lc, git } = project('handoff_dir: $STATE\nci:\n  required_checks: verify-pr\ngate_pr:\n  ci: checks\n  self: command false\n');
  git('git checkout -q -b feat && git commit -q --allow-empty -m work');
  const gh = fakeGh();
  gh.set('runs.json', checkRun('verify-pr', 'in_progress', null, 1));
  const r = lc({ ...gh.env, LC_GATE_WAIT: '1', LC_GATE_WAIT_POLL: '0.3' }, 'run', 'pr', 'feat', '--wait');
  assert.match(r.stdout, /--wait: nothing changed in 1s \(LC_GATE_WAIT\); the last walk:\npr feat: candidate/, r.stdout + r.stderr);
  gh.set('runs.json', checkRun('verify-pr', 'completed', 'success', 1));
  const t = Date.now();
  const idle = lc({ ...gh.env, LC_GATE_WAIT: '30' }, 'run', 'pr', 'feat', '--wait');
  assert.match(idle.stdout, /--wait: nothing runs that could change a step[^]*the next move is yours/);
  assert.ok(Date.now() - t < 10_000);
});

test('lc-gate tally counts, per question of a session step, its reviews, how often it applied and its P1 to P3 rows', () => {
  const { repo, lc } = project('handoff_dir: $STATE\ngate_pr:\n  reviewer: session q.md\n');
  writeFileSync(join(repo, 'q.md'), QFILE);
  const put = (rel, rows) => {
    mkdirSync(join(repo, 'state/gates/pr', rel, '..'), { recursive: true });
    writeFileSync(join(repo, 'state/gates/pr', rel), rows.join('\n'));
  };
  put('a/findings/reviewer.md', [row(1, 'yes', 'a.js:1', 'P1: F1'), row(2, 'yes', 'b.js:2', 'sound'), row(3, 'no', 'none', 'n/a')]);
  put('a/findings/reviewer.before-0123456789ab.md', [row(1, 'yes', 'a.js:1', 'must-fix'), row(2, 'yes', 'b.js:2', 'P3: F2'), row(3, 'no', 'none', 'n/a')]);
  put('team/b/findings/reviewer.md', [row(1, 'yes', 'a.js:1', 'P2: F1'), row(2, 'no', 'none', 'n/a'), row(3, 'no', 'none', 'n/a')]);
  put('team/b/findings/reviewer.gone-0123456789ab.md', [row(1, 'yes', 'a.js:1', 'P1: F9')]);
  const r = lc({}, 'tally', 'pr', '--md');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^\| step \| Q \| reviews \| applied \| P1 \| P2 \| P3 \| question \|$/m);
  assert.match(r.stdout, /^\| reviewer \| Q1 \| 3 \| 3 \| 1 \| 2 \| 0 \| Types\. Are boundaries checked\? \|$/m);
  assert.match(r.stdout, /^\| reviewer \| Q2 \| 3 \| 2 \| 0 \| 0 \| 1 \|/m);
  assert.match(r.stdout, /^\| reviewer \| Q3 \| 3 \| 0 \| 0 \| 0 \| 0 \|/m);
  assert.match(lc({}, 'tally', 'pr').stdout, /^reviewer\s+Q1\s+3\s+3\s+1\s+2\s+0\s+Types/m);
  assert.match(lc({}, 'tally', 'pr', '--since', '2999-01-01').stdout, /^reviewer\s+Q1\s+0\s+0\s+0\s+0\s+0/m);
  assert.match(lc({}, 'tally', 'pr', '--since', 'soon').stderr, /not a date/);
});

test('a command step with if does not hold across an own change to the project file: its paths may have moved', () => {
  const { lc, git } = project('handoff_dir: $STATE\npaths:\n  code: src/\ngate_pr:\n  tests: command test ! -e src/bad if code\n');
  git('git checkout -q -b feat && mkdir -p src && echo a > src/a.js && git add src && git commit -qm c1');
  assert.match(lc({}, 'run', 'pr', 'feat').stdout, /tests\s+command\s+PASS/);
  git("sed -i 's#code: src/#code: lib/#' .agents/project.yaml && touch src/bad && echo b >> src/a.js && git add .agents src && git commit -qm c2");
  const r = lc({}, 'run', 'pr', 'feat');
  assert.match(r.stdout, /tests\s+command\s+FAIL/, r.stdout + r.stderr);
  assert.equal(lc({}, 'check', 'pr', 'feat').status, 1);
});

test('lc-gate merge refuses a PR retargeted since the gate judged it against another base', () => {
  const p = behind();
  const st = join(p.repo, 'state/gates/pr/feat/gate.json');
  writeFileSync(st, JSON.stringify({ ...JSON.parse(readFileSync(st, 'utf8')), baseBranch: 'parent' }));
  const r = p.merge();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /judged against parent, but the PR's base is now main; nothing merged\. Run lc-gate run pr feat again/);
  assert.doesNotMatch(p.gh.log(), /^pr merge/m);
});

test('--wait does not see a change in a failed command run again, and does not run it again', () => {
  const { lc, git } = project('handoff_dir: $STATE\nci:\n  required_checks: verify-pr\ngate_pr:\n  tests: command echo x >> "$LC_GATE_EVIDENCE/count"; false\n  ci: checks\n');
  git('git checkout -q -b feat && git commit -q --allow-empty -m work');
  const gh = fakeGh();
  gh.set('runs.json', checkRun('verify-pr', 'in_progress', null, 1));
  const r = lc({ ...gh.env, LC_GATE_WAIT: '2', LC_GATE_WAIT_POLL: '1' }, 'run', 'pr', 'feat', '--wait');
  assert.match(r.stdout, /--wait: nothing changed in 2s/, r.stdout + r.stderr);
  assert.equal(readFileSync(join(git('pwd'), 'state/gates/pr/feat/evidence/count'), 'utf8'), 'x\n');
});

test('lc-gate run refuses a checkout behind the pull request on the host, naming the host head', () => {
  const { repo, lc, git } = project('handoff_dir: $STATE\ngate_pr:\n  check: command true\n');
  git('git checkout -q -b feat && echo a > a.txt && git add a.txt && git commit -qm work');
  const gh = fakeGh();
  gh.set('view.json', JSON.stringify({ headRefOid: 'f'.repeat(40), baseRefName: 'main' }));
  const out = lc(gh.env, 'run', 'pr', 'feat', '--base', 'main');
  assert.equal(out.status, 1, out.stdout + out.stderr);
  assert.match(out.stderr, /head on the host is ffffffffffff, but this checkout is at [0-9a-f]{12}: pull the branch/);
  gh.set('view.json', JSON.stringify({ headRefOid: git('git rev-parse HEAD'), baseRefName: 'main' }));
  assert.equal(lc(gh.env, 'run', 'pr', 'feat', '--base', 'main').status, 0);
});
