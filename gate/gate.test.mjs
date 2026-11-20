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
  writeFileSync(`${git('pwd')}/q.md`, '1. Is it right?\n');
  writeFileSync(`${git('pwd')}/state/gates/phase/x/findings/review.md`, '| Q1 | Is it right? | yes | a.js:1 | sound |\n');
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

// A scratch or dry run: the lead records the owner step N/A, and the phase record says so.
test('the lead may record the owner step N/A, stated in the phase record; a spawned session may not', () => {
  const { lc, repo } = project('handoff_dir: $STATE\ndocs:\n  phase_records: records/\ngate_phase:\n  acceptance: owner\n');
  const spawned = { LC_SESSION: 'gate-x-acceptance', LC_GATE_STEP: 'phase/x/acceptance' };
  assert.match(lc(spawned, 'record', 'phase', 'x', 'acceptance', 'na', '--reason', 'r', '--candidate', 'HEAD').stderr, /may not record N\/A/);
  const r = lc({ LC_SESSION: '' }, 'record', 'phase', 'x', 'acceptance', 'na', '--reason', 'dry run, no owner', '--candidate', 'HEAD');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(lc({}, 'check', 'phase', 'x').status, 0);
  assert.equal(lc({}, 'status', 'phase', 'x', '--write').status, 0);
  const text = readFileSync(join(repo, 'records/x.md'), 'utf8');
  assert.match(text, /^- \*\*Owner acceptance:\*\* not given: acceptance is N\/A by lead \(dry run, no owner\)$/m);
  assert.match(text, /^\| acceptance \| owner \| N\/A \|/m);
  const listed = JSON.parse(readFileSync(join(repo, 'state/board/read-afterwards.jsonl'), 'utf8'));
  assert.deepEqual([listed.gate, listed.id, listed.step, listed.reason], ['phase', 'x', 'acceptance', 'dry run, no owner']);
  assert.match(r.stdout, /listed for the owner to read afterwards/);
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

test('observe tells once per commit, however many hooks see it; a new commit tells again', () => {
  const p = planned('');
  p.git('git checkout -q -b feat && mkdir -p src && echo x > src/a.js');
  const told = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '') + r.stderr;
  const commit = 'git add -A && git commit -m work';
  assert.match(told(p.hook('Bash', { command: commit })), /observe mode/);
  for (let i = 0; i < 5; i++) assert.doesNotMatch(told(p.hook('Bash', { command: commit })), /observe mode/);
  p.git('git add -A');
  const staged = p.lc({}, 'plan-check', '--staged');
  assert.equal(staged.status, 0);
  assert.doesNotMatch(staged.stderr, /observe mode/, 'the git hook of the same commit says nothing more');
  p.git('git commit -qm work && echo y > src/b.js');
  assert.match(told(p.hook('Bash', { command: commit })), /observe mode/);
  assert.match(told(p.edit('src/c.js')), /observe mode/, 'an edit still tells');
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

// The order: `after <step>[,<step>]` starts a step once each named step holds with PASS or N/A.
test('a step with after waits for the steps it names, then starts', () => {
  const { repo, lc } = project('handoff_dir: $STATE\ngate_phase:\n  build: command test -f $LC_GATE_EVIDENCE/../go\n  look: here look at it after build\n');
  const first = lc({}, 'run', 'phase', 'x', '--base', 'HEAD');
  assert.match(first.stdout, /build\s+command\s+FAIL/, first.stdout + first.stderr);
  assert.match(first.stdout, /look\s+here\s+waits until build passes or is N\/A/);
  writeFileSync(join(repo, 'state/gates/phase/x/go'), 'yes');
  const second = lc({}, 'run', 'phase', 'x');
  assert.match(second.stdout, /build\s+command\s+PASS/);
  assert.match(second.stdout, /look\s+here\s+yours: look at it/);
});

test('a leftover after-gate is refused, naming after <step>; after names only a step above', () => {
  const read = (lines) => () => parseSteps(parseProject(`gate_pr:\n${lines}`), 'pr');
  assert.throws(read('  build: command true\n  review: command node pipeline.mjs review after-gate\n'), /"after-gate" is gone; write "after <step>\[,<step>\]"/);
  assert.throws(read('  fit: command check if mech plan after-gate\n'), /after-gate/);
  assert.throws(read('  review: session q.md after build\n  build: command true\n'), /"after build" names no step declared above/);
  assert.throws(read('  review: session q.md after review\n'), /names no step declared above/);
  const { lc } = project('handoff_dir: $STATE\ngate_pr:\n  review: command true after-gate\n');
  assert.match(lc({}, 'run', 'pr', 'main').stderr, /after-gate" is gone/);
});

test('a command step with after can be planned; without after, a trailing "plan" stays part of the command', () => {
  const conf = parseProject('paths:\n  mech: src/**\ngate_pr:\n  build: command true\n  fit: command check-review if mech plan after build\n  tf: command terraform plan\n  both: session q.md after build, fit\n');
  const [, fit, tf, both] = parseSteps(conf, 'pr');
  assert.deepEqual(fit, { id: 'fit', kind: 'command', arg: 'check-review', if: 'mech', plan: true, after: ['build'] });
  assert.deepEqual(tf, { id: 'tf', kind: 'command', arg: 'terraform plan', if: null });
  assert.deepEqual(both.after, ['build', 'fit']);
});

test('a step with no argument keeps its condition', () => {
  const conf = parseProject('paths:\n  protected: .agents/**\ngate_pr:\n  gate-review: session q.md\n  ok: owner if protected after gate-review\n  say: owner Some text. if protected\n  ci: checks\n');
  const [, ok, say, ci] = parseSteps(conf, 'pr');
  assert.deepEqual(ok, { id: 'ok', kind: 'owner', arg: '', if: 'protected', after: ['gate-review'] });
  assert.deepEqual(say, { id: 'say', kind: 'owner', arg: 'Some text.', if: 'protected' });
  assert.deepEqual(ci, { id: 'ci', kind: 'checks', arg: '', if: null });
  assert.throws(() => parseSteps(parseProject('gate_pr:\n  ci: checks verify-pr\n'), 'pr'), /takes no argument/);
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
const MERGE = 'handoff_dir: $STATE\ngate_pr_mode: enforce\nci:\n  required_checks: verify-pr\ngate_pr:\n  ci: checks\n  look: here look at it after ci\n';
function behind() {
  const p = project(MERGE);
  p.git('git checkout -q -b feat && echo a > a.txt && git add a.txt && git commit -qm work');
  const old = p.git('git rev-parse HEAD');
  writeFileSync(join(p.repo, 'seen.md'), 'looked at it');
  assert.equal(p.lc({}, 'record', 'pr', 'feat', 'look', 'pass', '--evidence', 'seen.md', '--candidate', 'HEAD').status, 0);
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
  assert.match(log, new RegExp(`^pr merge 7 --merge --match-head-commit ${p.updated} --body Verified-By: lc-gate pr feat ${p.updated} ci=pass look=pass$`, 'm'));
  assert.doesNotMatch(log, /--admin|--auto|--delete-branch/);
  assert.equal(JSON.parse(readFileSync(join(p.repo, 'state/gates/pr/feat/merged.json'), 'utf8')).complete, true);
  assert.ok(!existsSync(join(p.repo, 'state/gates/merge.lock')));
  // A conflict: GitHub refuses the update, and the implementer merges main by hand.
  const q = behind();
  q.gh.set('update.err', 'merge conflict between base and head (HTTP 422)\n');
  const c = q.merge();
  assert.equal(c.status, 1);
  assert.match(c.stderr, /would not update feat from main .*merges main into feat by hand \(git merge, never a rebase\)/);
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
  const { repo, lc, git } = project('handoff_dir: $STATE\ngate_pr_mode: enforce\ngate_pr:\n  review: here look at it\n');
  git('git checkout -q -b feat && echo a > a.txt && git add a.txt && git commit -qm work');
  writeFileSync(join(repo, 'seen.md'), 'looked');
  assert.equal(lc({}, 'record', 'pr', 'feat', 'review', 'pass', '--evidence', 'seen.md', '--candidate', 'HEAD').status, 0);
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

// lc-pr: the PR body, one section at a time.
const PR = fileURLToPath(new URL('../pr/pr.mjs', import.meta.url));
const lcPr = (repo, gh, ...args) => spawnSync('node', [PR, ...args], { cwd: repo, encoding: 'utf8', env: { ...process.env, ...gh.env } });

test('lc-pr section replaces one section of the PR body and leaves every other byte', () => {
  const { repo } = project('x: 1\n');
  const gh = fakeGh();
  const body = '# Title\r\n\r\nIntro,  two  spaces\r\n## Summary\r\nold\r\n### Detail\r\npart of Summary\r\n## Evidence\r\n<!-- fill -->\r\n\r\n## Notes\r\n```\r\n## not a heading\r\n```\r\ntail, no newline';
  gh.set('body.json', JSON.stringify({ body }));
  writeFileSync(join(repo, 'ev.md'), 'ran the flow: green\n');
  const r = lcPr(repo, gh, 'section', 'Evidence', '--file', 'ev.md', '--pr', '7');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(gh.dir, 'body.out'), 'utf8'), body.replace('<!-- fill -->\r\n\r\n', '\r\nran the flow: green\r\n\r\n'));
  assert.match(gh.log(), /^pr view 7 --json body$/m);
  assert.match(gh.log(), /^pr edit 7 --body-file /m);
  // A heading the body lacks is appended as a new section.
  assert.equal(lcPr(repo, gh, 'section', 'Risks', '--file', 'ev.md').status, 0);
  assert.equal(readFileSync(join(gh.dir, 'body.out'), 'utf8'), `${body}\r\n\r\n## Risks\r\n\r\nran the flow: green\r\n`);
});

test('lc-pr open fills sections from files and refuses a required section left empty', () => {
  const { repo } = project('pr:\n  required_sections: Summary, Evidence\n');
  const gh = fakeGh();
  mkdirSync(join(repo, '.github'));
  writeFileSync(join(repo, '.github/pull_request_template.md'), '## Summary\n\n<!-- what and why -->\n\n## Evidence\n\n<!-- red, then green -->\n');
  writeFileSync(join(repo, 'sum.md'), 'Adds the thing.\n');
  const r = lcPr(repo, gh, 'open', '--title', 'Add the thing', '--section', 'Summary=sum.md');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /## Evidence is still empty or only a comment \(pr\.required_sections\)/);
  assert.doesNotMatch(gh.log(), /pr create/);
  writeFileSync(join(repo, 'ev.md'), 'red at the base, green at the head\n');
  const ok = lcPr(repo, gh, 'open', '--title', 'Add the thing', '--draft', '--section', 'Summary=sum.md', '--section', 'Evidence=ev.md');
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(gh.log(), /^pr create --title Add the thing --draft --body-file /m);
  assert.equal(readFileSync(join(gh.dir, 'body.out'), 'utf8'), '## Summary\n\nAdds the thing.\n\n## Evidence\n\nred at the base, green at the head\n');
});

test('nobody records a command step pass by hand; the runner does', () => {
  const { repo, lc } = project('handoff_dir: $STATE\ngate_phase:\n  build: command true\n');
  writeFileSync(join(repo, 'log.txt'), 'ran it myself');
  const r = lc({}, 'record', 'phase', 'x', 'build', 'pass', '--evidence', 'log.txt', '--candidate', 'HEAD');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /lc-gate run phase x --rerun build/);
  assert.equal(lc({}, 'record', 'phase', 'x', 'build', 'fail', '--evidence', 'log.txt', '--candidate', 'HEAD').status, 0);
  assert.equal(lc({}, 'record', 'phase', 'x', 'build', 'na', '--reason', 'nothing to build', '--candidate', 'HEAD').status, 0);
});

test("a session step's pass comes only from the session started for it", () => {
  const { repo, lc } = project('handoff_dir: $STATE\ngate_phase:\n  review: session q.md\n');
  const findings = join(repo, 'state/gates/phase/x/findings/review.md');
  mkdirSync(join(findings, '..'), { recursive: true });
  writeFileSync(join(repo, 'q.md'), '1. Is it right?\n');
  writeFileSync(findings, '| Q1 | Is it right? | yes | a.js:1 | sound |\n');
  const lead = lc({}, 'record', 'phase', 'x', 'review', 'pass', '--evidence', findings, '--candidate', 'HEAD');
  assert.equal(lead.status, 1);
  assert.match(lead.stderr, /session step/);
  const own = { LC_SESSION: 'gate-x-review', LC_GATE_STEP: 'phase/x/review' };
  const r = lc(own, 'record', 'phase', 'x', 'review', 'pass', '--evidence', findings, '--candidate', 'HEAD');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(lc({}, 'record', 'phase', 'x', 'review', 'na', '--reason', 'no change to review', '--candidate', 'HEAD').status, 0);
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
  const { repo, lc } = project('handoff_dir: $STATE\ngate_phase:\n  review: session q.md\n');
  writeFileSync(join(repo, 'q.md'), QFILE);
  const findings = join(repo, 'state/gates/phase/x/findings/review.md');
  mkdirSync(join(findings, '..'), { recursive: true });
  const own = { LC_SESSION: 'gate-x-review', LC_GATE_STEP: 'phase/x/review' };
  const rec = (status) => lc(own, 'record', 'phase', 'x', 'review', status, '--evidence', findings, '--candidate', 'HEAD');
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
