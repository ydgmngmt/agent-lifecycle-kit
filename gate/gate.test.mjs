// The check's invariants. Run: node --test gate/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, parseSteps, prCurrent } from './gate.mjs';
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
  writeFileSync(join(repo, '.agents/project.yaml'), `handoff_dir: ${repo}/state\ngate_phase:\n  build: command true\n  review: session q.md\n`);
  const gate = fileURLToPath(new URL('./gate.mjs', import.meta.url));
  const run = (env, ...args) => spawnSync('node', [gate, ...args, '--candidate', 'HEAD'], { cwd: repo, encoding: 'utf8', env: { ...process.env, ...env } });
  const spawned = { LC_SESSION: 'gate-x-review', LC_GATE_STEP: 'phase/x/review' };
  assert.match(run(spawned, 'record', 'phase', 'x', 'review', 'na', '--reason', 'r').stderr, /may not record N\/A/);
  assert.match(run(spawned, 'record', 'phase', 'x', 'build', 'pass', '--evidence', 'q').stderr, /may record only that step/);
  assert.match(run(spawned, 'record', 'phase', 'x', 'review', 'pass', '--carry', '--reason', 'r').stderr, /may not carry/);
  assert.equal(run({}, 'record', 'phase', 'x', 'review', 'na', '--reason', 'r').status, 0);
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
  const { lc, git } = project('handoff_dir: $STATE\ngate_phase:\n  review: session q.md\n');
  const a = git('git rev-parse HEAD');
  git('git commit -q --allow-empty -m two');
  const s = { LC_SESSION: 'gate-x-review', LC_GATE_STEP: 'phase/x/review' };
  assert.equal(lc({}, 'record', 'phase', 'x', 'review', 'na', '--reason', 'seed', '--candidate', 'HEAD').status, 0);
  mkdirSync(`${git('pwd')}/state/gates/phase/x/findings`, { recursive: true });
  writeFileSync(`${git('pwd')}/state/gates/phase/x/findings/review.md`, 'No findings.');
  assert.match(lc(s, 'record', 'phase', 'x', 'review', 'pass', '--evidence', `${git('pwd')}/state/gates/phase/x/findings/review.md`).stderr, /--candidate/);
  assert.equal(lc(s, 'record', 'phase', 'x', 'review', 'pass', '--evidence', `${git('pwd')}/state/gates/phase/x/findings/review.md`, '--candidate', a).status, 0);
  assert.match(lc({}, 'check', 'phase', 'x').stderr, /review: recorded for/);
});

test('a step line the reader cannot parse is an error, not a dropped step', () => {
  for (const line of ['  review.security: session q.md', '\treview: session q.md']) {
    const conf = parseProject(`gate_phase:\n  build: command true\n${line}\n`);
    assert.throws(() => parseSteps(conf, 'phase'), /cannot read/);
  }
});

test('CI checks the steps of base and head, and the record of the phase being closed', () => {
  const yaml = 'docs:\n  roadmap: road.md\n  phase_records: records/\ngate_phase:\n  build: command true\n  lint: command true\n';
  const { repo, lc, git } = project(yaml);
  const base = git('git rev-parse HEAD');
  const row = (step) => `| ${step} | command | PASS | ${base} | lc-gate | \`true\` exit 0 |  |`;
  const record = (id, ...steps) => `# Phase record: ${id}\n\n- **Gate:** phase ${id}\n- **Candidate:** ${base}\n\n| Step | Kind | Status | Commit | By | Evidence | Reason |\n| --- | --- | --- | --- | --- | --- | --- |\n${steps.map(row).join('\n')}\n`;
  mkdirSync(join(repo, 'records'));
  writeFileSync(join(repo, 'records/one.md'), record('one', 'build'));
  writeFileSync(join(repo, '.agents/project.yaml'), yaml.replace('  lint: command true\n', ''));
  writeFileSync(join(repo, 'road.md'), '## One (done) [record](records/one.md)\n');
  git('git add -A && git commit -qm "one done, lint step dropped"');
  assert.match(lc({}, 'check', 'phase', '--diff', base, 'HEAD').stderr, /lint: missing/);
  git(`git checkout -q ${base} -- .agents/project.yaml && git commit -qm "lint back"`);
  writeFileSync(join(repo, 'records/one.md'), record('one', 'build', 'lint'));
  writeFileSync(join(repo, 'road.md'), '## Two (closed) [record](records/one.md)\n');
  git('git add -A && git commit -qm "two closed with one\'s record"');
  assert.match(lc({}, 'check', 'phase', '--diff', base, 'HEAD').stderr, /is the record of phase one, not two/);
});

test('a FAIL cannot be carried', () => {
  const { lc, git } = project('handoff_dir: $STATE\ngate_phase:\n  build: command true\n');
  writeFileSync(join(git('pwd'), 'log.txt'), 'failed');
  assert.equal(lc({}, 'record', 'phase', 'x', 'build', 'fail', '--evidence', 'log.txt', '--candidate', 'HEAD').status, 0);
  git('git commit -q --allow-empty -m fix');
  const r = lc({}, 'record', 'phase', 'x', 'build', 'pass', '--carry', '--reason', 'r', '--candidate', 'HEAD');
  assert.match(r.stderr, /only a pass or N\/A is carried/);
});

test('nobody records the owner step by hand', () => {
  const { lc, git } = project('handoff_dir: $STATE\ngate_phase:\n  acceptance: owner\n');
  writeFileSync(join(git('pwd'), 'yes.txt'), 'yes');
  assert.match(lc({}, 'record', 'phase', 'x', 'acceptance', 'pass', '--evidence', 'yes.txt', '--candidate', 'HEAD').stderr, /only the owner's answer on the board/);
});

// A plan: a step line ending in `plan` needs records/<step>.plan.json, made before the branch's first commit.
const PLANNED = 'handoff_dir: $STATE\npaths:\n  mech: src/**\ngate_pr:\n  fit: here docs/fit.md if mech plan\n';

test('a planned step without a plan record fails the check', () => {
  const [fit] = parseSteps(parseProject(PLANNED.replace('$STATE', '/s')), 'pr');
  assert.deepEqual(fit, { id: 'fit', kind: 'here', arg: 'docs/fit.md', if: 'mech', plan: true });
  assert.deepEqual(check([fit], { fit: pass('fit') }, A), ['fit: no plan recorded before the work']);
  assert.deepEqual(check([fit], { fit: pass('fit'), 'fit.plan': pass('fit', { plan: true, sha: B }) }, A), []);
  assert.deepEqual(check([fit], { fit: pass('fit', { status: 'na', reason: 'no src change' }) }, A), []);
});

test('a plan recorded after a commit is refused', () => {
  const { repo, lc, git } = project(PLANNED);
  git('git checkout -q -b feat && git commit -q --allow-empty -m work');
  writeFileSync(join(repo, 'plan.md'), 'I will call parse (docs/api.md) for the input.');
  const r = lc({}, 'record', 'pr', 'feat', 'fit', 'plan', '--evidence', 'plan.md');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /the plan comes before the first commit/);
});

test('a plan recorded at the base, then the final record, holds', () => {
  const { repo, lc, git } = project(PLANNED);
  git('git checkout -q -b feat');
  writeFileSync(join(repo, 'plan.md'), 'I will call parse (docs/api.md) for the input.');
  assert.equal(lc({}, 'record', 'pr', 'feat', 'fit', 'plan', '--evidence', 'plan.md').status, 0);
  writeFileSync(join(repo, 'plan.md'), 'I will call parse (docs/api.md) for the input: src/a.js:3');
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src/a.js'), 'parse(x);\n');
  git('git add src && git commit -qm work');
  assert.match(lc({}, 'check', 'pr', 'feat', '--candidate', 'HEAD').stderr, /fit: missing/);
  assert.equal(lc({}, 'record', 'pr', 'feat', 'fit', 'pass', '--evidence', 'plan.md', '--candidate', 'HEAD').status, 0);
  const ok = lc({}, 'check', 'pr', 'feat');
  assert.equal(ok.status, 0, ok.stderr);
});

test('an N/A plan by a spawned gate session is refused', () => {
  const { lc, git } = project(PLANNED);
  git('git checkout -q -b feat && git commit -q --allow-empty -m work');
  const spawned = { LC_SESSION: 'gate-feat-fit', LC_GATE_STEP: 'pr/feat/fit' };
  assert.match(lc(spawned, 'record', 'pr', 'feat', 'fit', 'plan', 'na', '--reason', 'r').stderr, /may not record N\/A/);
  const [fit] = parseSteps(parseProject(PLANNED.replace('$STATE', '/s')), 'pr');
  const na = pass('fit', { plan: true, status: 'na', reason: 'r', by: 'gate-feat-fit', spawned: true });
  assert.deepEqual(check([fit], { fit: pass('fit'), 'fit.plan': na }, A), ['fit: plan N/A recorded by spawned session gate-feat-fit; only the lead may']);
  assert.equal(lc({}, 'record', 'pr', 'feat', 'fit', 'plan', 'na', '--reason', 'branch had commits when the gate first saw it').status, 0);
});

test('a command step does not run on a dirty tree', () => {
  const { repo, lc } = project('handoff_dir: $STATE\ngate_phase:\n  build: command true\n');
  writeFileSync(join(repo, '.agents/project.yaml'), `handoff_dir: ${repo}/state\ngate_phase:\n  build: command true\n# dirty\n`);
  const out = lc({}, 'run', 'phase', 'x', '--base', 'HEAD');
  assert.match(out.stdout, /uncommitted changes/);
  assert.match(lc({}, 'check', 'phase', 'x').stderr, /build: missing/);
});

// The plan enforced before the work: plan-check, and the hook on edits and commits (gate_pr_plan).
function planned(mode) {
  const p = project(`${PLANNED}${mode ? `gate_pr_plan: ${mode}\n` : ''}`);
  const gate = fileURLToPath(new URL('./gate.mjs', import.meta.url));
  p.hook = (tool, input) =>
    spawnSync('node', [gate, 'hook'], { cwd: p.repo, encoding: 'utf8', env: { ...process.env, LC_GATE_STEP: '' }, input: JSON.stringify({ tool_name: tool, cwd: p.repo, tool_input: input }) });
  p.edit = (file) => p.hook('Edit', { file_path: join(p.repo, file), old_string: 'a', new_string: 'b' });
  p.plan = () => {
    writeFileSync(join(p.repo, '.agents/plan.md'), 'I will call parse (docs/api.md) for the input.');
    const r = p.lc({}, 'record', 'pr', 'feat', 'fit', 'plan', '--evidence', '.agents/plan.md');
    assert.equal(r.status, 0, r.stderr);
  };
  return p;
}

test('enforce refuses an edit to a matching file with no plan, and allows it after the plan', () => {
  const p = planned('enforce');
  p.git('git checkout -q -b feat');
  const r = p.edit('src/a.js');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /lc-gate record pr feat fit plan --evidence <file>/);
  assert.match(r.stderr, /docs\/fit\.md/);
  assert.equal(p.lc({}, 'plan-check', '--files', 'src/a.js').status, 1);
  p.plan();
  assert.equal(p.edit('src/a.js').status, 0);
  assert.equal(p.lc({}, 'plan-check', '--files', 'src/a.js').status, 0);
});

test('a file outside the step paths, and every file on main, goes through', () => {
  const p = planned('enforce');
  assert.equal(p.edit('src/a.js').status, 0); // on main
  assert.equal(p.lc({}, 'plan-check', '--files', 'src/a.js').status, 0);
  p.git('git checkout -q -b feat');
  assert.equal(p.edit('docs/notes.md').status, 0);
  assert.equal(p.lc({}, 'plan-check', '--files', 'docs/notes.md').status, 0);
});

test('observe (the default) logs and lets the edit through', () => {
  const p = planned('');
  p.git('git checkout -q -b feat');
  const r = p.edit('src/a.js');
  assert.equal(r.status, 0, r.stderr);
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /observe mode.*\n?.*lc-gate record pr feat fit plan/s);
  assert.match(readFileSync(join(p.repo, 'state/gates/observe.log'), 'utf8'), /"point":"plan".*"missing":\["fit"\]/);
  assert.equal(p.lc({}, 'plan-check', '--files', 'src/a.js').status, 0);
});

test("the lead's N/A plan lets the work through", () => {
  const p = planned('enforce');
  p.git('git checkout -q -b feat && git commit -q --allow-empty -m early');
  assert.equal(p.edit('src/a.js').status, 2);
  assert.equal(p.lc({}, 'record', 'pr', 'feat', 'fit', 'plan', 'na', '--reason', 'work began before the gate').status, 0);
  assert.equal(p.edit('src/a.js').status, 0);
});

test('a commit is checked on its files, and --no-verify is refused only where a planned step applies', () => {
  const p = planned('enforce');
  const commit = (cmd) => p.hook('Bash', { command: cmd });
  p.git('git checkout -q -b feat && mkdir -p src docs && echo x > src/a.js && echo y > docs/n.md');
  assert.equal(commit('git add -A && git commit -m work').status, 2);
  p.git('git add docs/n.md');
  assert.equal(p.lc({}, 'plan-check', '--staged').status, 0);
  p.git('git add src/a.js');
  assert.equal(p.lc({}, 'plan-check', '--staged').status, 1);
  p.plan();
  assert.equal(commit('git commit -m work').status, 0);
  const nv = commit('git commit --no-verify -m work');
  assert.equal(nv.status, 2);
  assert.match(nv.stderr, /--no-verify/);
  assert.equal(commit('git commit -anm work').status, 2);
  p.git('git commit -qm work && git checkout -q main && mkdir -p docs && echo z > docs/m.md && git add docs/m.md');
  assert.equal(commit('git commit -n -m on-main').status, 0);
  writeFileSync(join(p.repo, '.agents/project.yaml'), PLANNED.replace('$STATE', `${p.repo}/state`).replace(' plan\n', '\n') + 'gate_pr_plan: enforce\n');
  p.git('git checkout -q -b other && mkdir -p src && echo w > src/b.js && git add src/b.js');
  assert.equal(commit('git commit --no-verify -m no-planned-step').status, 0);
});

test('the pre-commit template runs plan-check on the staged files', () => {
  const p = planned('enforce');
  const kit = fileURLToPath(new URL('..', import.meta.url));
  p.git(`mkdir -p .githooks && cp ${kit}templates/githooks/pre-commit .githooks/ && git config core.hooksPath .githooks`);
  p.git('git checkout -q -b feat && mkdir -p src && echo x > src/a.js && git add src/a.js');
  const env = { ...process.env, PATH: `${kit}bin:${process.env.PATH}` };
  const r = spawnSync('git', ['commit', '-qm', 'work'], { cwd: p.repo, encoding: 'utf8', env });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /lc-gate record pr feat fit plan/);
  const bare = spawnSync('git', ['commit', '-qm', 'work'], { cwd: p.repo, encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } });
  assert.equal(bare.status, 0, bare.stderr);
  assert.match(bare.stderr, /lc-gate is not on PATH/);
});
