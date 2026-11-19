// The sessions lc-gate run starts: their model, the folder-trust prompt, and a session that sits idle.
// tmux is a fake on PATH that logs its calls and shows a pane from a file. Run: node --test gate/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const GATE = join(KIT, 'gate/gate.mjs');
const TRUST = 'Quick safety check: Is this a project you created or one you trust?\n\n ❯ 1. Yes, I trust this folder\n   2. No, exit\n';

function fixture(yaml) {
  const repo = mkdtempSync(join(tmpdir(), 'lc-sess-'));
  const sh = (cmd, cwd = repo) => {
    const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  sh('git init -q -b main && git config user.name t && git config user.email t@t');
  mkdirSync(join(repo, '.agents'));
  writeFileSync(join(repo, '.agents/project.yaml'), yaml.replaceAll('$STATE', `${repo}/state`));
  writeFileSync(join(repo, 'q.md'), '1. Is it right?\n');
  sh('git add -A && git commit -qm one');
  const fake = mkdtempSync(join(tmpdir(), 'lc-tmux-'));
  writeFileSync(join(fake, 'tmux'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"${fake}/calls"
case "$1" in
  list-windows) cat "${fake}/windows" 2>/dev/null ;;
  capture-pane) cat "${fake}/pane" 2>/dev/null ;;
  new-window|new-session) n=$(cat "${fake}/n" 2>/dev/null || echo 6); n=$((n + 1)); echo $n >"${fake}/n"; echo @$n ;;
  send-keys) if [ -s "${fake}/drop" ]; then d=$(cat "${fake}/drop"); [ "$d" -gt 1 ] && echo $((d - 1)) >"${fake}/drop" || : >"${fake}/drop"; else [ -e "${fake}/sticky" ] || echo working >"${fake}/pane"; fi ;;
esac
exit 0
`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${fake}:${KIT}bin:${process.env.PATH}`, LC_GATE_STEP: '', LC_TRUST_WAIT: '2', LC_MODEL: 'sonnet', LC_EFFORT: 'low', LC_OPEN_TAB: '' };
  const run = (cmd, args, cwd = repo) => spawnSync(cmd, args, { cwd, encoding: 'utf8', env });
  return {
    repo, fake, sh,
    calls: () => readFileSync(join(fake, 'calls'), 'utf8'),
    pane: (text) => writeFileSync(join(fake, 'pane'), text),
    windows: (text) => writeFileSync(join(fake, 'windows'), text),
    lc: (...args) => run('node', [GATE, ...args]),
    spawn: (dir, cwd) => run(join(KIT, 'bin/lc-spawn'), ['s1', dir, join(repo, 'q.md')], cwd),
  };
}

const SESSION = 'handoff_dir: $STATE\ngate_phase:\n  review: session q.md\n';

test('a gate session runs on sessions.gate_model and gate_effort, opus and xhigh by default, not the lead\'s', () => {
  const f = fixture(SESSION);
  f.pane('working\n');
  const r = f.lc('run', 'phase', 'x', '--base', 'HEAD');
  assert.match(r.stdout, /started session gate-x-review/, r.stdout + r.stderr);
  const started = f.calls().split('\n').find((l) => l.startsWith('new-'));
  assert.match(started, /--model opus --effort xhigh/);
  assert.doesNotMatch(started, /sonnet|low/);
  const g = fixture(`${SESSION}sessions:\n  model: haiku\n  gate_model: fable\n  gate_effort: max\n`);
  g.pane('working\n');
  g.lc('run', 'phase', 'x', '--base', 'HEAD');
  assert.match(g.calls(), /--model fable --effort max/);
});

test('lc-spawn moves to "Yes" when the folder-trust prompt starts on "No"', () => {
  const f = fixture(SESSION.replace('$STATE', mkdtempSync(join(tmpdir(), 'lc-handoff-'))));
  f.pane('Quick safety check: Is this a project you created or one you trust?\n\n ❯ No, exit\n   Yes, I trust this folder\n');
  const wt = join(f.repo, '..', `${f.repo.split('/').at(-1)}-wt2`);
  f.sh(`git worktree add -q --detach ${wt}`);
  const r = f.spawn(wt, f.repo);
  assert.equal(r.status, 0, r.stderr);
  assert.match(f.calls(), /^send-keys -t @7 Down\nsend-keys -t @7 Enter$/m);
});

test("lc-spawn answers the folder-trust prompt for a folder of the repository's worktrees or handoff dir", () => {
  const handoff = mkdtempSync(join(tmpdir(), 'lc-handoff-'));
  const f = fixture(SESSION.replace('$STATE', handoff));
  f.pane(TRUST);
  const wt = join(f.repo, '..', `${f.repo.split('/').at(-1)}-wt`);
  f.sh(`git worktree add -q --detach ${wt}`);
  const r = f.spawn(wt, f.repo);
  assert.equal(r.status, 0, r.stderr);
  assert.match(f.calls(), /^send-keys -t @7 Enter$/m);
  assert.match(r.stdout, /answered Claude Code's folder-trust prompt/);
  mkdirSync(join(handoff, 'briefs'), { recursive: true });
  f.pane(TRUST);
  const h = f.spawn(join(handoff, 'briefs'), f.repo);
  assert.match(h.stdout, /answered/, h.stdout + h.stderr);
  assert.equal(f.calls().match(/^send-keys/gm).length, 2);
});

test('lc-spawn leaves the prompt for a folder outside them, and says what the session waits on', () => {
  const f = fixture(SESSION);
  f.pane(TRUST);
  const outside = mkdtempSync(join(tmpdir(), 'lc-outside-'));
  const r = f.spawn(outside, f.repo);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(f.calls(), /send-keys/);
  assert.match(r.stdout, /s1 is waiting on Claude Code's folder-trust prompt for .*lc-outside-/);
});

test('lc-spawn says the prompt was answered only once the pane no longer shows it', () => {
  const f = fixture(SESSION);
  f.pane(TRUST);
  writeFileSync(join(f.fake, 'sticky'), '');
  const r = f.spawn(f.repo, f.repo);
  assert.equal(r.status, 0, r.stderr);
  assert.match(f.calls(), /^send-keys/m);
  assert.doesNotMatch(r.stdout, /answered/);
  assert.match(r.stdout, /s1 is still waiting on Claude Code's folder-trust prompt for .*: answer it in tmux window/);
});

test('sessions.gate_parallel: lc-gate run starts that many session steps at a time; unset, all', () => {
  const TWO = 'handoff_dir: $STATE\ngate_phase:\n  one: session q.md\n  two: session q.md\n  three: session q.md\n';
  const all = fixture(TWO);
  all.pane('working\n');
  assert.equal(all.lc('run', 'phase', 'x', '--base', 'HEAD').stdout.match(/started session/g).length, 3);
  const f = fixture(`${TWO}sessions:\n  gate_parallel: 1\n`);
  f.pane('working\n');
  const first = f.lc('run', 'phase', 'x', '--base', 'HEAD').stdout;
  assert.equal(first.match(/started session/g).length, 1, first);
  assert.match(first, /two\s+session\s+waits: 1 session\(s\) running, sessions\.gate_parallel is 1/);
  f.windows('@7\tgate-x-one\n');
  const second = f.lc('run', 'phase', 'x').stdout;
  assert.doesNotMatch(second, /started session/);
  assert.match(second, /three\s+session\s+waits/);
  f.windows('');
  f.sh(`mkdir -p state/gates/phase/x/records && printf '%s' '{"step":"one","status":"pass","sha":"'$(git rev-parse HEAD)'","by":"s","at":"t"}' > state/gates/phase/x/records/one.json`);
  const third = f.lc('run', 'phase', 'x').stdout;
  assert.match(third, /two\s+session\s+started session gate-x-two/, third);
  assert.match(third, /three\s+session\s+waits/);
});

test('lc-gate run reports a started session that shows no activity for 60 seconds', () => {
  const f = fixture(SESSION);
  f.pane('Do something\n> \n');
  assert.match(f.lc('run', 'phase', 'x', '--base', 'HEAD').stdout, /started session/);
  f.windows('@7\tgate-x-review\n');
  const soon = f.lc('run', 'phase', 'x');
  assert.match(soon.stdout, /is running; waiting for its record/);
  assert.doesNotMatch(soon.stdout, /no activity/);
  const seen = join(f.repo, 'state/gates/phase/x/briefs/review.seen.json');
  writeFileSync(seen, JSON.stringify({ ...JSON.parse(readFileSync(seen, 'utf8')), at: Date.now() - 90_000 }));
  const late = f.lc('run', 'phase', 'x');
  assert.match(late.stdout, /gate-x-review shows no activity for 9\ds; its window shows: >$/m);
  f.pane('Do something\nreading q.md\n');
  assert.doesNotMatch(f.lc('run', 'phase', 'x').stdout, /no activity/);
});

// A finished gate session's window is closed once its record lands; run closes any left over.
test("a gate session's window is closed when its record lands, and run closes one left open", async () => {
  const f = fixture(SESSION);
  f.pane('working\n');
  f.lc('run', 'phase', 'x', '--base', 'HEAD');
  const findings = join(f.repo, 'state/gates/phase/x/findings/review.md');
  writeFileSync(findings, '| Q1 | Is it right? | yes | q.md:1 | sound |\n');
  const env = { ...process.env, PATH: `${f.fake}:${KIT}bin:${process.env.PATH}`, LC_SESSION: 'gate-x-review', LC_GATE_STEP: 'phase/x/review', LC_CLOSE_DELAY: '0' };
  const r = spawnSync('node', [GATE, 'record', 'phase', 'x', 'review', 'pass', '--evidence', findings, '--candidate', 'HEAD'], { cwd: f.repo, encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  const closed = () => /^kill-window -t agents:gate-x-review$/m.test(f.calls());
  for (let i = 0; i < 40 && !closed(); i++) await new Promise((ok) => setTimeout(ok, 100));
  assert.ok(closed(), f.calls());
  const g = fixture(SESSION);
  g.pane('working\n');
  g.lc('run', 'phase', 'x', '--base', 'HEAD');
  g.windows('@7\tgate-x-review\n');
  g.sh(`mkdir -p state/gates/phase/x/records && printf '%s' '{"step":"review","status":"pass","sha":"'$(git rev-parse HEAD)'","by":"gate-x-review","at":"t","spawned":true}' > state/gates/phase/x/records/review.json`);
  const run = g.lc('run', 'phase', 'x');
  assert.match(g.calls(), /^kill-window -t agents:gate-x-review$/m, run.stdout);
  assert.match(run.stdout, /closed its window gate-x-review/);
});

// Claude Code drops keys sent the moment its prompt is first drawn, and more often while other sessions start.
test('lc-spawn sends the answer again while the folder-trust prompt still shows', () => {
  const f = fixture(SESSION);
  f.pane(TRUST);
  writeFileSync(join(f.fake, 'drop'), '1');
  const r = f.spawn(f.repo, f.repo);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(f.calls().match(/^send-keys -t @7 Enter$/gm).length, 2, f.calls());
  assert.match(r.stdout, /answered Claude Code's folder-trust prompt/);
});

test('lc-gate run writes the evidence folder\'s files.txt and prs.txt, with no freeze step', () => {
  const f = fixture(SESSION);
  f.pane('working\n');
  f.sh('echo a > a.txt && git add a.txt && git commit -qm two');
  f.lc('run', 'phase', 'x', '--base', 'HEAD~1');
  const ev = join(f.repo, 'state/gates/phase/x/evidence');
  assert.equal(readFileSync(join(ev, 'files.txt'), 'utf8'), 'a.txt\n');
  assert.equal(readFileSync(join(ev, 'prs.txt'), 'utf8'), '');
  assert.match(readFileSync(join(f.repo, 'state/gates/phase/x/briefs', `review-${f.sh('git rev-parse --short=12 HEAD')}.md`), 'utf8'), new RegExp(`Evidence folder: \`${ev}\``));
});

test('sessions.gate_setup runs once in a worktree at the candidate, which the briefs name; unset, none is made', () => {
  const TWO = 'handoff_dir: $STATE\ngate_phase:\n  one: session q.md\n  two: session q.md\n';
  const f = fixture(`${TWO}sessions:\n  gate_setup: echo ran >> ../setup.count && touch installed\n`);
  f.pane('working\n');
  const r = f.lc('run', 'phase', 'x', '--base', 'HEAD');
  assert.equal(r.stdout.match(/started session/g)?.length, 2, r.stdout + r.stderr);
  const wt = join(f.repo, 'state/gates/phase/x/worktree');
  assert.ok(existsSync(join(wt, 'installed')));
  assert.equal(f.sh(`git -C ${wt} rev-parse HEAD`), f.sh('git rev-parse HEAD'));
  assert.equal(readFileSync(join(f.repo, 'state/gates/phase/x/setup.count'), 'utf8'), 'ran\n');
  const brief = readFileSync(join(f.repo, 'state/gates/phase/x/briefs', `two-${f.sh('git rev-parse --short=12 HEAD')}.md`), 'utf8');
  assert.match(brief, new RegExp(`read in the gate's worktree \`${wt}\``));
  const g = fixture(TWO);
  g.pane('working\n');
  g.lc('run', 'phase', 'x', '--base', 'HEAD');
  assert.ok(!existsSync(join(g.repo, 'state/gates/phase/x/worktree')));
  assert.match(readFileSync(join(g.repo, 'state/gates/phase/x/briefs', `one-${g.sh('git rev-parse --short=12 HEAD')}.md`), 'utf8'), /read in your own detached worktree/);
});

test('a planned step whose paths the diff misses is N/A, with no word about its plan', () => {
  const f = fixture('handoff_dir: $STATE\npaths:\n  mech: src/**\ngate_phase:\n  fit: session q.md if mech plan\n');
  f.sh('echo a > a.txt && git add a.txt && git commit -qm two');
  const r = f.lc('run', 'phase', 'x', '--base', 'HEAD~1');
  assert.match(r.stdout, /fit\s+session\s+N\/A \(no file changed/, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /plan/);
});

// A review after a fix: a failed record at an earlier candidate this one descends from.
const failAt = (f, sha, text = '| Q1 | Is it right? | yes | q.md:1 | P1: F1 |\n') => {
  const dir = join(f.repo, 'state/gates/phase/x');
  mkdirSync(join(dir, 'records'), { recursive: true });
  writeFileSync(join(dir, 'findings/review.md'), text);
  writeFileSync(join(dir, 'records/review.json'), JSON.stringify({ step: 'review', status: 'fail', sha, evidence: join(dir, 'findings/review.md'), by: 'gate-x-review', at: 't', spawned: true }));
};
const briefAt = (f) => readFileSync(join(f.repo, 'state/gates/phase/x/briefs', `review-${f.sh('git rev-parse --short=12 HEAD')}.md`), 'utf8');

test('after a failed review, the next session checks the fix: the earlier findings and the range; else a full review', () => {
  const f = fixture(SESSION);
  f.pane('working\n');
  f.lc('run', 'phase', 'x', '--base', 'HEAD');
  assert.match(briefAt(f), /Scope: a full review/);
  const c1 = f.sh('git rev-parse HEAD');
  failAt(f, c1);
  f.sh('git commit -q --allow-empty -m fix');
  const r = f.lc('run', 'phase', 'x', '--candidate', 'HEAD', '--rerun', 'review');
  assert.match(r.stdout, /started session/, r.stdout + r.stderr);
  const b = briefAt(f);
  assert.match(b, /Scope: a review after a fix/);
  assert.match(b, new RegExp(`git diff ${c1} ${f.sh('git rev-parse HEAD')}`));
  assert.match(b, new RegExp(`findings/review\\.before-${f.sh('git rev-parse --short=12 HEAD')}\\.md`));
  // A candidate that does not descend from the failed one gets a full review.
  failAt(f, f.sh('git rev-parse HEAD'));
  f.sh(`git checkout -q -b side ${c1} && git commit -q --allow-empty -m other`);
  f.lc('run', 'phase', 'x', '--candidate', 'HEAD', '--rerun', 'review');
  assert.match(briefAt(f), /Scope: a full review/);
});

test('commits on top of a passed review get a review of the change since the pass', () => {
  const f = fixture(SESSION);
  f.pane('working\n');
  f.lc('run', 'phase', 'x', '--base', 'HEAD');
  const c1 = f.sh('git rev-parse HEAD');
  const dir = join(f.repo, 'state/gates/phase/x');
  mkdirSync(join(dir, 'records'), { recursive: true });
  writeFileSync(join(dir, 'records/review.json'), JSON.stringify({ step: 'review', status: 'pass', sha: c1, evidence: join(dir, 'findings/review.md'), by: 'gate-x-review', at: 't', spawned: true }));
  f.sh('git commit -q --allow-empty -m more');
  f.lc('run', 'phase', 'x', '--candidate', 'HEAD', '--rerun', 'review');
  const b = briefAt(f);
  assert.match(b, /Scope: a review of the change since a pass/);
  assert.match(b, new RegExp(`git diff ${c1} ${f.sh('git rev-parse HEAD')}`));
});

test('with a P1 or P2 still open after two reviews after a fix, run starts no further session: the lead decides', () => {
  const f = fixture(SESSION);
  f.pane('working\n');
  f.lc('run', 'phase', 'x', '--base', 'HEAD');
  for (const round of [1, 2]) {
    failAt(f, f.sh('git rev-parse HEAD'));
    f.sh(`git commit -q --allow-empty -m fix${round}`);
    const r = f.lc('run', 'phase', 'x', '--candidate', 'HEAD', '--rerun', 'review');
    assert.match(r.stdout, /started session/, `round ${round}: ${r.stdout}${r.stderr}`);
    assert.match(briefAt(f), /review after a fix/);
  }
  failAt(f, f.sh('git rev-parse HEAD'));
  f.sh('git commit -q --allow-empty -m fix3');
  const r = f.lc('run', 'phase', 'x', '--candidate', 'HEAD', '--rerun', 'review');
  assert.doesNotMatch(r.stdout, /started session/);
  assert.match(r.stdout, /still open after two reviews after a fix.*the lead decides/);
  assert.equal(f.calls().split('\n').filter((l) => l.startsWith('new-')).length, 3);
});

test("a PR's review brief names the PR's brief, found by the branch's worktree in spawned.tsv; else it says none is known", () => {
  const f = fixture('handoff_dir: $STATE\ngate_pr:\n  reviewer: session q.md\n');
  f.pane('working\n');
  const wt = join(f.repo, '..', `${f.repo.split('/').at(-1)}-feat`);
  f.sh(`git worktree add -q -b feat ${wt} && git -C ${wt} commit -q --allow-empty -m change`);
  const prBrief = join(f.repo, 'state/briefs/feat.md');
  mkdirSync(join(f.repo, 'state/board'), { recursive: true });
  mkdirSync(join(f.repo, 'state/briefs'), { recursive: true });
  writeFileSync(prBrief, '# Brief: feat\n');
  writeFileSync(join(f.repo, 'state/board/spawned.tsv'), `other\t/elsewhere.md\t${f.repo}\nfeat\t${prBrief}\t${wt}\ngate-feat-reviewer\t/gate-brief.md\t${wt}\n`);
  const head = f.sh(`git -C ${wt} rev-parse HEAD`);
  const r = f.lc('run', 'pr', 'feat', '--candidate', head);
  assert.match(r.stdout, /started session/, r.stdout + r.stderr);
  const brief = () => readFileSync(join(f.repo, 'state/gates/pr/feat/briefs', `reviewer-${head.slice(0, 12)}.md`), 'utf8');
  assert.match(brief(), new RegExp(`The PR's brief: \`${prBrief}\``));
  writeFileSync(join(f.repo, 'state/board/spawned.tsv'), '');
  f.lc('run', 'pr', 'feat', '--candidate', head, '--rerun', 'reviewer');
  assert.match(brief(), /The PR's brief: none known; judge the change against the PR body/);
});
