// The sessions lc-gate run starts: their model, the folder-trust prompt, and a session that sits idle.
// tmux is a fake on PATH that logs its calls and shows a pane from a file. Run: node --test gate/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
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
  list-windows) [ -f "${fake}/fail" ] && { echo 'lost server' >&2; exit 1; }; cat "${fake}/windows" 2>/dev/null ;;
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
    bin: (name, args, more = {}) => spawnSync(join(KIT, 'bin', name), args, { cwd: repo, encoding: 'utf8', env: { ...env, ...more } }),
  };
}

const SESSION = 'handoff_dir: $STATE\ngate_pr:\n  review: session q.md\n';
// A brief older than lc-spawn's wait: its session had time to get a window.
const ageBrief = (brief) => utimesSync(brief, new Date(Date.now() - 120_000), new Date(Date.now() - 120_000));

test('a gate session runs on sessions.gate_model and gate_effort, opus and xhigh by default, not the lead\'s', () => {
  const f = fixture(SESSION);
  f.pane('working\n');
  const r = f.lc('run', 'pr', 'x', '--base', 'HEAD');
  assert.match(r.stdout, /started session gate-x-review/, r.stdout + r.stderr);
  const started = f.calls().split('\n').find((l) => l.startsWith('new-'));
  assert.match(started, /--model opus --effort xhigh/);
  assert.doesNotMatch(started, /sonnet|low/);
  const g = fixture(`${SESSION}sessions:\n  model: haiku\n  gate_model: fable\n  gate_effort: max\n`);
  g.pane('working\n');
  g.lc('run', 'pr', 'x', '--base', 'HEAD');
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
  const TWO = 'handoff_dir: $STATE\ngate_pr:\n  one: session q.md\n  two: session q.md\n  three: session q.md\n';
  const all = fixture(TWO);
  all.pane('working\n');
  assert.equal(all.lc('run', 'pr', 'x', '--base', 'HEAD').stdout.match(/started session/g).length, 3);
  const f = fixture(`${TWO}sessions:\n  gate_parallel: 1\n`);
  f.pane('working\n');
  const first = f.lc('run', 'pr', 'x', '--base', 'HEAD').stdout;
  assert.equal(first.match(/started session/g).length, 1, first);
  assert.match(first, /two\s+session\s+waits: 1 session\(s\) running, sessions\.gate_parallel is 1/);
  f.windows('@7\tgate-x-one\n');
  const second = f.lc('run', 'pr', 'x').stdout;
  assert.doesNotMatch(second, /started session/);
  assert.match(second, /three\s+session\s+waits/);
  f.windows('');
  f.sh(`mkdir -p state/gates/pr/x/records && printf '%s' '{"step":"one","status":"pass","sha":"'$(git rev-parse HEAD)'","by":"s","at":"t"}' > state/gates/pr/x/records/one.json`);
  const third = f.lc('run', 'pr', 'x').stdout;
  assert.match(third, /two\s+session\s+started session gate-x-two/, third);
  assert.match(third, /three\s+session\s+waits/);
});

test('lc-gate run reports a started session that shows no activity for 60 seconds', () => {
  const f = fixture(SESSION);
  f.pane('Do something\n> \n');
  assert.match(f.lc('run', 'pr', 'x', '--base', 'HEAD').stdout, /started session/);
  f.windows('@7\tgate-x-review\n');
  const soon = f.lc('run', 'pr', 'x');
  assert.match(soon.stdout, /is running; waiting for its record/);
  assert.doesNotMatch(soon.stdout, /no activity/);
  const seen = join(f.repo, 'state/gates/pr/x/briefs/review.seen.json');
  writeFileSync(seen, JSON.stringify({ ...JSON.parse(readFileSync(seen, 'utf8')), at: Date.now() - 90_000 }));
  const late = f.lc('run', 'pr', 'x');
  assert.match(late.stdout, /gate-x-review shows no activity for 9\ds; its window shows: >$/m);
  f.pane('Do something\nreading q.md\n');
  assert.doesNotMatch(f.lc('run', 'pr', 'x').stdout, /no activity/);
});

// A finished gate session's window is closed once its record lands; run closes any left over.
test("a gate session's window is closed when its record lands, and run closes one left open", async () => {
  const f = fixture(SESSION);
  f.pane('working\n');
  f.lc('run', 'pr', 'x', '--base', 'HEAD');
  const findings = join(f.repo, 'state/gates/pr/x/findings/review.md');
  writeFileSync(findings, '| Q1 | Is it right? | yes | q.md:1 | sound |\n');
  const env = { ...process.env, PATH: `${f.fake}:${KIT}bin:${process.env.PATH}`, LC_SESSION: 'gate-x-review', LC_GATE_STEP: 'pr/x/review', LC_CLOSE_DELAY: '0' };
  f.windows('@7\tgate-x-review\n');
  const r = spawnSync('node', [GATE, 'record', 'pr', 'x', 'review', 'pass', '--evidence', findings, '--candidate', 'HEAD'], { cwd: f.repo, encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  const closed = () => /^kill-window -t @7$/m.test(f.calls());
  for (let i = 0; i < 40 && !closed(); i++) await new Promise((ok) => setTimeout(ok, 100));
  assert.ok(closed(), f.calls());
  const g = fixture(SESSION);
  g.pane('working\n');
  g.lc('run', 'pr', 'x', '--base', 'HEAD');
  g.windows('@7\tgate-x-review\n');
  g.sh(`mkdir -p state/gates/pr/x/records && printf '%s' '{"step":"review","status":"pass","sha":"'$(git rev-parse HEAD)'","by":"gate-x-review","at":"t","spawned":true}' > state/gates/pr/x/records/review.json`);
  const run = g.lc('run', 'pr', 'x');
  assert.match(g.calls(), /^kill-window -t @7$/m, run.stdout);
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
  f.lc('run', 'pr', 'x', '--base', 'HEAD~1');
  const ev = join(f.repo, 'state/gates/pr/x/evidence');
  assert.equal(readFileSync(join(ev, 'files.txt'), 'utf8'), 'a.txt\n');
  assert.equal(readFileSync(join(ev, 'prs.txt'), 'utf8'), '');
  assert.match(readFileSync(join(f.repo, 'state/gates/pr/x/briefs', `review-${f.sh('git rev-parse --short=12 HEAD')}.md`), 'utf8'), new RegExp(`Evidence folder: \`${ev}\``));
});

test('sessions.gate_setup runs once in a worktree at the candidate, which the briefs name; unset, none is made', () => {
  const TWO = 'handoff_dir: $STATE\ngate_pr:\n  one: session q.md\n  two: session q.md\n';
  const f = fixture(`${TWO}sessions:\n  gate_setup: echo ran >> ../setup.count && touch installed\n`);
  f.pane('working\n');
  const r = f.lc('run', 'pr', 'x', '--base', 'HEAD');
  assert.equal(r.stdout.match(/started session/g)?.length, 2, r.stdout + r.stderr);
  const wt = join(f.repo, 'state/gates/pr/x/worktree');
  assert.ok(existsSync(join(wt, 'installed')));
  assert.equal(f.sh(`git -C ${wt} rev-parse HEAD`), f.sh('git rev-parse HEAD'));
  assert.equal(readFileSync(join(f.repo, 'state/gates/pr/x/setup.count'), 'utf8'), 'ran\n');
  const brief = readFileSync(join(f.repo, 'state/gates/pr/x/briefs', `two-${f.sh('git rev-parse --short=12 HEAD')}.md`), 'utf8');
  assert.match(brief, new RegExp(`read in the gate's worktree \`${wt}\``));
  const g = fixture(TWO);
  g.pane('working\n');
  g.lc('run', 'pr', 'x', '--base', 'HEAD');
  assert.ok(!existsSync(join(g.repo, 'state/gates/pr/x/worktree')));
  assert.match(readFileSync(join(g.repo, 'state/gates/pr/x/briefs', `one-${g.sh('git rev-parse --short=12 HEAD')}.md`), 'utf8'), /read in your own detached worktree/);
});

test('a step whose paths the diff misses is N/A', () => {
  const f = fixture('handoff_dir: $STATE\npaths:\n  mech: src/**\ngate_pr:\n  fit: session q.md if mech\n');
  f.sh('echo a > a.txt && git add a.txt && git commit -qm two');
  const r = f.lc('run', 'pr', 'x', '--base', 'HEAD~1');
  assert.match(r.stdout, /fit\s+session\s+N\/A \(no file changed/, r.stdout + r.stderr);
});

// A review after a fix: a failed record at an earlier candidate this one descends from.
const failAt = (f, sha, text = '| Q1 | Is it right? | yes | q.md:1 | P1: F1 |\n') => {
  const dir = join(f.repo, 'state/gates/pr/x');
  mkdirSync(join(dir, 'records'), { recursive: true });
  writeFileSync(join(dir, 'findings/review.md'), text);
  writeFileSync(join(dir, 'records/review.json'), JSON.stringify({ step: 'review', status: 'fail', sha, evidence: join(dir, 'findings/review.md'), by: 'gate-x-review', at: 't', spawned: true }));
};
const briefAt = (f) => readFileSync(join(f.repo, 'state/gates/pr/x/briefs', `review-${f.sh('git rev-parse --short=12 HEAD')}.md`), 'utf8');

test('after a failed review, the next session checks the fix: the earlier findings and the range; else a full review', () => {
  const f = fixture(SESSION);
  f.pane('working\n');
  f.lc('run', 'pr', 'x', '--base', 'HEAD');
  assert.match(briefAt(f), /Scope: a full review/);
  const c1 = f.sh('git rev-parse HEAD');
  failAt(f, c1);
  f.sh('git commit -q --allow-empty -m fix');
  const r = f.lc('run', 'pr', 'x', '--candidate', 'HEAD', '--rerun', 'review');
  assert.match(r.stdout, /started session/, r.stdout + r.stderr);
  const b = briefAt(f);
  assert.match(b, /Scope: a review after a fix/);
  assert.match(b, new RegExp(`git log -p --first-parent --remerge-diff ${c1}\\.\\.${f.sh('git rev-parse HEAD')}`));
  assert.match(b, new RegExp(`findings/review\\.before-${f.sh('git rev-parse --short=12 HEAD')}\\.md`));
  // A candidate that does not descend from the failed one gets a full review.
  failAt(f, f.sh('git rev-parse HEAD'));
  f.sh(`git checkout -q -b side ${c1} && git commit -q --allow-empty -m other`);
  f.lc('run', 'pr', 'x', '--candidate', 'HEAD', '--rerun', 'review');
  assert.match(briefAt(f), /Scope: a full review/);
});

test('commits on top of a passed review get a review of the change since the pass', () => {
  const f = fixture(SESSION);
  f.pane('working\n');
  f.lc('run', 'pr', 'x', '--base', 'HEAD');
  const c1 = f.sh('git rev-parse HEAD');
  const dir = join(f.repo, 'state/gates/pr/x');
  mkdirSync(join(dir, 'records'), { recursive: true });
  writeFileSync(join(dir, 'records/review.json'), JSON.stringify({ step: 'review', status: 'pass', sha: c1, evidence: join(dir, 'findings/review.md'), by: 'gate-x-review', at: 't', spawned: true }));
  f.sh('git commit -q --allow-empty -m more');
  f.lc('run', 'pr', 'x', '--candidate', 'HEAD', '--rerun', 'review');
  const b = briefAt(f);
  assert.match(b, /Scope: a review of the change since a pass/);
  assert.match(b, new RegExp(`git log -p --first-parent --remerge-diff ${c1}\\.\\.${f.sh('git rev-parse HEAD')}`));
});

test('two follow-up reviews ended in FAIL (gate_rounds unset): run starts no further session, and names the one way on', () => {
  const f = fixture(SESSION);
  f.pane('working\n');
  f.lc('run', 'pr', 'x', '--base', 'HEAD');
  for (const round of [1, 2]) {
    failAt(f, f.sh('git rev-parse HEAD'));
    f.sh(`git commit -q --allow-empty -m fix${round}`);
    const r = f.lc('run', 'pr', 'x', '--candidate', 'HEAD', '--rerun', 'review');
    assert.match(r.stdout, /started session/, `round ${round}: ${r.stdout}${r.stderr}`);
    assert.match(briefAt(f), /review after a fix/);
  }
  failAt(f, f.sh('git rev-parse HEAD'));
  f.sh('git commit -q --allow-empty -m fix3');
  const r = f.lc('run', 'pr', 'x', '--candidate', 'HEAD', '--rerun', 'review');
  assert.doesNotMatch(r.stdout, /started session/);
  assert.match(r.stdout, /2 follow-up review\(s\) ended in FAIL \(sessions\.gate_rounds 2\): no further session\. The one way on: lc-gate run pr x --rerun review --lead --reason "…"/);
  assert.equal(f.calls().split('\n').filter((l) => l.startsWith('new-')).length, 3);
});

test("a PR's review brief names the PR's body as its spec", () => {
  const f = fixture('handoff_dir: $STATE\ngate_pr:\n  reviewer: session q.md\n');
  f.pane('working\n');
  f.sh('git checkout -q -b feat && git commit -q --allow-empty -m change');
  const head = f.sh('git rev-parse HEAD');
  const r = f.lc('run', 'pr', 'feat', '--candidate', head);
  assert.match(r.stdout, /started session/, r.stdout + r.stderr);
  assert.match(readFileSync(join(f.repo, 'state/gates/pr/feat/briefs', `reviewer-${head.slice(0, 12)}.md`), 'utf8'), /The spec: the pull request's body\./);
});

// A follow-up review reads the PR's own change: its commits and a merge's hand-resolved lines, not main's.
const PRGATE = 'handoff_dir: $STATE\ngate_pr:\n  reviewer: session q.md\n';
const recordAt = (f, status, sha) => {
  const dir = join(f.repo, 'state/gates/pr/feat');
  mkdirSync(join(dir, 'records'), { recursive: true });
  mkdirSync(join(dir, 'findings'), { recursive: true });
  writeFileSync(join(dir, 'findings/reviewer.md'), '| Q1 | Is it right? | yes | q.md:1 | P1: F1 |\n');
  writeFileSync(join(dir, 'records/reviewer.json'), JSON.stringify({ step: 'reviewer', status, sha, evidence: join(dir, 'findings/reviewer.md'), by: 'gate-feat-reviewer', at: 't', spawned: true }));
};
// The brief's scope command, run in the repository.
const scopeOf = (f) => {
  const brief = readFileSync(join(f.repo, 'state/gates/pr/feat/briefs', `reviewer-${f.sh('git rev-parse --short=12 HEAD')}.md`), 'utf8');
  const cmd = brief.match(/`(git log -p --first-parent --remerge-diff [0-9a-f]+\.\.[0-9a-f]+)`/)?.[1];
  assert.ok(cmd, brief);
  return f.sh(cmd);
};

test("a review after a fix on top of a merge of main reads the fix, and none of main's lines", () => {
  const f = fixture(PRGATE);
  f.pane('working\n');
  f.sh('git checkout -q -b feat && echo PRLINE > a.txt && git add a.txt && git commit -qm pr');
  recordAt(f, 'fail', f.sh('git rev-parse HEAD'));
  f.sh('git checkout -q main && echo MAINLINE > m.txt && git add m.txt && git commit -qm main && git checkout -q feat && git merge -q --no-edit main');
  f.sh('echo FIXLINE >> a.txt && git commit -qam fix');
  const r = f.lc('run', 'pr', 'feat', '--rerun', 'reviewer');
  assert.match(r.stdout, /started session/, r.stdout + r.stderr);
  const scope = scopeOf(f);
  assert.match(scope, /\+FIXLINE/);
  assert.doesNotMatch(scope, /MAINLINE/);
});

test('a hand-resolved merge of main is not held: the follow-up review reads exactly its resolved lines', () => {
  const f = fixture(PRGATE);
  f.pane('working\n');
  f.sh("printf 'one\\ntwo\\n' > f.txt && git add f.txt && git commit -qm f");
  f.sh("git checkout -q -b feat && sed -i 's/two/PRTWO/' f.txt && git commit -qam pr");
  recordAt(f, 'pass', f.sh('git rev-parse HEAD'));
  assert.match(f.lc('run', 'pr', 'feat').stdout, /reviewer\s+session\s+PASS/);
  f.sh("git checkout -q main && sed -i 's/two/MAINTWO/' f.txt && echo MAINLINE > m.txt && git add m.txt && git commit -qam main && git checkout -q feat");
  f.sh("git merge -q --no-edit main >/dev/null 2>&1 || true; printf 'one\\nRESOLVED\\n' > f.txt && git add f.txt && git commit -qm 'merge main by hand'");
  // The PASS at an ancestor no longer holds: its follow-up review starts by itself.
  const stale = f.lc('run', 'pr', 'feat');
  assert.match(stale.stdout, /that do not: reviewer/, stale.stdout + stale.stderr);
  assert.match(stale.stdout, /reviewer\s+session\s+started session/);
  const scope = scopeOf(f);
  assert.match(scope, /^\+RESOLVED$/m);
  assert.doesNotMatch(scope, /MAINLINE/);
});

test('a follow-up review keeps git diff as its scope after a merge of a branch not on main', () => {
  const g = fixture(PRGATE);
  g.pane('working\n');
  g.sh('git checkout -q -b feat && echo a > a.txt && git add a.txt && git commit -qm pr');
  const x = g.sh('git rev-parse HEAD');
  recordAt(g, 'pass', x);
  g.sh('git checkout -q -b side main && echo SLINE > s.txt && git add s.txt && git commit -qm side && git checkout -q feat && git merge -q --no-ff --no-edit side');
  const h = g.sh('git rev-parse HEAD');
  g.lc('run', 'pr', 'feat', '--rerun', 'reviewer');
  const brief = readFileSync(join(g.repo, 'state/gates/pr/feat/briefs', `reviewer-${h.slice(0, 12)}.md`), 'utf8');
  assert.match(brief, new RegExp(`git diff ${x} ${h}`));
  assert.doesNotMatch(brief, /remerge-diff/);
});

test('a follow-up review starts by itself, with no --rerun, once its after holds', () => {
  const f = fixture('handoff_dir: $STATE\ngate_pr:\n  check: command test -f $LC_GATE_EVIDENCE/../go\n  review: session q.md after check\n');
  f.pane('working\n');
  const go = join(f.repo, 'state/gates/pr/x/go');
  const look = () => {
    mkdirSync(join(go, '..'), { recursive: true });
    writeFileSync(go, 'yes');
  };
  assert.match(f.lc('run', 'pr', 'x', '--base', 'HEAD').stdout, /review\s+session\s+waits until check passes/);
  look();
  assert.match(f.lc('run', 'pr', 'x').stdout, /review\s+session\s+started session gate-x-review/);
  failAt(f, f.sh('git rev-parse HEAD'));
  f.sh('git commit -q --allow-empty -m fix');
  rmSync(go);
  assert.match(f.lc('run', 'pr', 'x', '--candidate', 'HEAD').stdout, /review\s+session\s+waits until check passes or is N\/A/);
  look();
  const r = f.lc('run', 'pr', 'x', '--candidate', 'HEAD');
  assert.match(r.stdout, /review\s+session\s+started session gate-x-review on/, r.stdout + r.stderr);
  assert.match(briefAt(f), /Scope: a review after a fix/);
  assert.equal(f.calls().split('\n').filter((l) => l.startsWith('new-')).length, 2);
});

test('sessions.gate_rounds counts follow-up reviews ended in FAIL; at the count only --lead with a reason starts one more, kept in the history', () => {
  const f = fixture(`${SESSION}sessions:\n  gate_rounds: 1\n`);
  f.pane('working\n');
  f.lc('run', 'pr', 'x', '--base', 'HEAD');
  failAt(f, f.sh('git rev-parse HEAD'));
  f.sh('git commit -q --allow-empty -m fix1');
  assert.match(f.lc('run', 'pr', 'x', '--candidate', 'HEAD').stdout, /started session/);
  failAt(f, f.sh('git rev-parse HEAD'));
  f.sh('git commit -q --allow-empty -m fix2');
  const r = f.lc('run', 'pr', 'x', '--candidate', 'HEAD');
  assert.match(r.stdout, /review\s+session\s+1 follow-up review\(s\) ended in FAIL \(sessions\.gate_rounds 1\): no further session\. The one way on: lc-gate run pr x --rerun review --lead --reason "…"/, r.stdout + r.stderr);
  assert.match(f.lc('run', 'pr', 'x', '--rerun', 'review').stdout, /no further session/);
  assert.match(f.lc('run', 'pr', 'x', '--rerun', 'review', '--lead').stderr, /--rerun <step> --lead --reason/);
  assert.match(f.lc('status', 'pr', 'x').stdout, /follow-up reviews ended in FAIL \(sessions\.gate_rounds 1\): review 1/);
  const lead = f.lc('run', 'pr', 'x', '--rerun', 'review', '--lead', '--reason', 'the fix only renames a test');
  assert.match(lead.stdout, /started session gate-x-review past sessions\.gate_rounds, by the lead: the fix only renames a test/, lead.stdout + lead.stderr);
  const rec = JSON.parse(readFileSync(join(f.repo, 'state/gates/pr/x/records/review.json'), 'utf8'));
  assert.deepEqual({ ...rec.history.at(-1), at: 'x' }, { lead: true, sha: f.sh('git rev-parse HEAD'), reason: 'the fix only renames a test', by: process.env.LC_SESSION || 'lead', at: 'x' });
  assert.equal(f.calls().split('\n').filter((l) => l.startsWith('new-')).length, 3);
});

test('a session gone with no window and no record is started again once; the second time run says so', () => {
  const f = fixture(SESSION);
  f.pane('working\n');
  assert.match(f.lc('run', 'pr', 'x', '--base', 'HEAD').stdout, /started session gate-x-review on/);
  writeFileSync(join(f.repo, 'state/gates/pr/x/findings/review.md'), 'half a table');
  const brief = join(f.repo, 'state/gates/pr/x/briefs', `review-${f.sh('git rev-parse --short=12 HEAD')}.md`);
  assert.match(f.lc('run', 'pr', 'x').stdout, /session gate-x-review has no window yet, started \d+s ago/);
  ageBrief(brief);
  const again = f.lc('run', 'pr', 'x');
  assert.match(again.stdout, /started session gate-x-review again: it was gone with no window and no record \(once\)/, again.stdout + again.stderr);
  assert.ok(existsSync(join(f.repo, `state/gates/pr/x/findings/review.gone-${f.sh('git rev-parse --short=12 HEAD')}.md`)));
  ageBrief(brief);
  const third = f.lc('run', 'pr', 'x');
  assert.match(third.stdout, /session gate-x-review ended without a record, also after one start again; start it again with --rerun review/);
  assert.equal(f.calls().split('\n').filter((l) => l.startsWith('new-')).length, 2);
});

// A stacked PR: its base on the host is another branch, so the review reads only its own commits.
test("a PR gate's base is the PR's base branch on the host when it is not the default branch; with no PR, run names the gated branch in the diff", () => {
  const f = fixture(PRGATE);
  f.pane('working\n');
  writeFileSync(join(f.fake, 'gh'), `#!/bin/sh\necho "$*" >> "${f.fake}/gh.log"\n[ -f "${f.fake}/nopr" ] && exit 1\ncase "$*" in *"pr view feat --json baseRefName"*) echo '{"baseRefName":"parent"}' ;; *) exit 1 ;; esac\n`, { mode: 0o755 });
  f.sh('git remote add origin /nowhere && git checkout -q -b parent && echo p > p.txt && git add p.txt && git commit -qm parent && git update-ref refs/remotes/origin/parent HEAD');
  const parent = f.sh('git rev-parse HEAD');
  f.sh('git checkout -q -b feat && echo f > f.txt && git add f.txt && git commit -qm feat');
  const r = f.lc('run', 'pr', 'feat');
  assert.match(r.stdout, new RegExp(`base ${parent.slice(0, 12)}; base: the merge-base with parent, the PR's base branch on the host`), r.stdout + r.stderr);
  assert.match(readFileSync(join(f.repo, 'state/gates/pr/feat/gate.json'), 'utf8'), new RegExp(`"base": "${parent}"`));
  // No PR yet, and parent has a gate of its own: as before, and run says so.
  writeFileSync(join(f.fake, 'nopr'), '');
  f.lc('run', 'pr', 'parent', '--candidate', parent);
  const n = f.lc('run', 'pr', 'feat');
  assert.match(n.stdout, /base [0-9a-f]{12}; no PR on the host says this branch's base, and its diff to the default branch holds commits of parent, a branch with a gate: pass --base parent/, n.stdout + n.stderr);
  assert.equal(JSON.parse(readFileSync(join(f.repo, 'state/gates/pr/feat/gate.json'), 'utf8')).base, f.sh('git rev-parse main'));
});

test('sessions.gate_flags replaces sessions.agent_flags for the sessions lc-gate run starts, {kit} the kit directory', () => {
  const f = fixture(`${SESSION}sessions:\n  agent_flags: --wide-open\n  gate_flags: --strict-mcp-config --plugin-dir {kit}\n`);
  f.pane('working\n');
  f.lc('run', 'pr', 'x', '--base', 'HEAD');
  const started = f.calls().split('\n').find((l) => l.startsWith('new-'));
  assert.ok(started.includes(`claude --strict-mcp-config --plugin-dir \\'${KIT.replace(/\/$/, '')}\\' `) || started.includes(`claude --strict-mcp-config --plugin-dir '${KIT.replace(/\/$/, '')}' `), started);
  assert.doesNotMatch(started, /--wide-open/);
  const g = fixture(`${SESSION}sessions:\n  agent_flags: --wide-open\n`);
  g.pane('working\n');
  g.lc('run', 'pr', 'x', '--base', 'HEAD');
  assert.match(g.calls(), /claude --wide-open/);
});

test('lc-spawn starts nothing while less memory is available than sessions.memory_floor_mb', () => {
  const f = fixture(`${SESSION}sessions:\n  memory_floor_mb: 99999999\n`);
  f.pane('working\n');
  const r = f.spawn(f.repo, f.repo);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /MB available, under sessions\.memory_floor_mb \(99999999 MB\): s1 not started/);
  assert.ok(!existsSync(join(f.fake, 'calls')) || !/new-/.test(f.calls()));
  assert.match(f.lc('run', 'pr', 'x', '--base', 'HEAD').stdout, /review\s+session\s+not started: .*memory_floor_mb/);
  const g = fixture(`${SESSION}sessions:\n  memory_floor_mb: 1\n`);
  g.pane('working\n');
  assert.equal(g.spawn(g.repo, g.repo).status, 0);
});

test('lc-tell logs the line and types it into the receiver\'s window; lead is sessions.lead', () => {
  const f = fixture('handoff_dir: $STATE\nsessions:\n  lead: orch\n');
  f.windows('@3\torch\n@4\timpl\n');
  const r = f.bin('lc-tell', ['lead', 'PR feat holds'], { LC_SESSION: 'impl' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(f.calls(), /^send-keys -t @3 -l from impl: PR feat holds\nsend-keys -t @3 Enter$/m);
  assert.match(readFileSync(join(f.repo, 'state/tell.log'), 'utf8'), /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\timpl\torch\tPR feat holds\ttold$/m);
  const gone = f.bin('lc-tell', ['nobody', 'hello'], { LC_SESSION: 'impl' });
  assert.equal(gone.status, 1);
  assert.match(gone.stderr, /no window nobody .*kept in .*tell\.log/);
  assert.match(readFileSync(join(f.repo, 'state/tell.log'), 'utf8'), /\timpl\tnobody\thello\trefused: no window nobody/m);
  const g = fixture('handoff_dir: $STATE\n');
  assert.match(g.bin('lc-tell', ['lead', 'x']).stderr, /no sessions\.lead/);
});

test('lc-log appends a line stamped with the clock and the sender to board.running_log', () => {
  const f = fixture('handoff_dir: $STATE\nboard:\n  running_log: $STATE/run.log\n');
  assert.equal(f.bin('lc-log', ['FOR THE OWNER merged feat'], { LC_SESSION: 'orch' }).status, 0);
  assert.match(readFileSync(join(f.repo, 'state/run.log'), 'utf8'), /^- \d{4}-\d\d-\d\d \d\d:\d\d: FOR THE OWNER merged feat \(orch\)\n$/);
  assert.match(fixture('x: 1\n').bin('lc-log', ['x']).stderr, /no board\.running_log/);
});

test('lc-park writes the resume point beside the brief and closes the window; lc-park resume starts it on both', () => {
  const f = fixture(SESSION);
  f.pane('working\n');
  mkdirSync(join(f.repo, 'state/board'), { recursive: true });
  assert.equal(f.spawn(f.repo, f.repo).status, 0);
  f.windows('@7\ts1\n');
  const p = f.bin('lc-park', ['s1', '--resume', 'waits for the parent PR; then rerun the gate']);
  assert.equal(p.status, 0, p.stderr);
  assert.match(readFileSync(join(f.repo, 'q.resume.md'), 'utf8'), /waits for the parent PR; then rerun the gate/);
  assert.match(f.calls(), /^kill-window -t @7$/m);
  assert.match(f.bin('lc-park', ['resume', 's1']).stderr, /still has a window/);
  f.windows('');
  const r = f.bin('lc-park', ['resume', 's1']);
  assert.equal(r.status, 0, r.stderr);
  const started = f.calls().split('\n').filter((l) => l.startsWith('new-')).at(-1);
  assert.match(started, /resume\\ point\\ in\\ .*q\.resume\.md/);
  assert.match(f.bin('lc-park', ['resume', 'nobody']).stderr, /no brief for nobody/);
});

test('an amend after each FAIL is a follow-up review too: sessions.gate_rounds stops it', () => {
  const f = fixture(`${SESSION}sessions:\n  gate_rounds: 1\n`);
  f.pane('working\n');
  f.sh('git commit -q --allow-empty -m work');
  assert.match(f.lc('run', 'pr', 'x', '--base', 'HEAD~1', '--candidate', 'HEAD').stdout, /started session/);
  failAt(f, f.sh('git rev-parse HEAD'));
  f.sh('git commit -q --amend --allow-empty -m work2');
  assert.match(f.lc('run', 'pr', 'x', '--candidate', 'HEAD').stdout, /started session/);
  failAt(f, f.sh('git rev-parse HEAD'));
  f.sh('git commit -q --amend --allow-empty -m work3');
  const r = f.lc('run', 'pr', 'x', '--candidate', 'HEAD');
  assert.match(r.stdout, /1 follow-up review\(s\) ended in FAIL \(sessions\.gate_rounds 1\): no further session/, r.stdout + r.stderr);
  assert.equal(f.calls().split('\n').filter((l) => l.startsWith('new-')).length, 2);
});

test('a start that failed, or a rerun on the same commit, is not counted as a round', () => {
  const f = fixture(SESSION);
  f.pane('working\n');
  f.lc('run', 'pr', 'x', '--base', 'HEAD');
  failAt(f, f.sh('git rev-parse HEAD'));
  f.sh('git commit -q --allow-empty -m fix1');
  writeFileSync(join(f.repo, '.agents/project.yaml'), `${SESSION.replace('$STATE', `${f.repo}/state`)}sessions:\n  memory_floor_mb: 99999999\n`);
  for (const i of [1, 2]) assert.match(f.lc('run', 'pr', 'x', '--candidate', 'HEAD').stdout, /review\s+session\s+not started/, `try ${i}`);
  f.sh('git checkout -q .agents/project.yaml');
  assert.match(f.lc('run', 'pr', 'x', '--candidate', 'HEAD').stdout, /started session/);
  assert.match(f.lc('run', 'pr', 'x', '--rerun', 'review').stdout, /started session/);
  failAt(f, f.sh('git rev-parse HEAD'));
  f.sh('git commit -q --allow-empty -m fix2');
  const r = f.lc('run', 'pr', 'x', '--candidate', 'HEAD');
  assert.match(r.stdout, /started session/, r.stdout + r.stderr);
  assert.match(f.lc('status', 'pr', 'x').stdout, /sessions\.gate_rounds 2\): review 1/);
});

test('no gone restart while tmux does not answer, nor after lc-close closed the session', () => {
  const f = fixture(SESSION);
  f.pane('working\n');
  mkdirSync(join(f.repo, 'state/board'), { recursive: true });
  f.lc('run', 'pr', 'x', '--base', 'HEAD');
  const brief = join(f.repo, 'state/gates/pr/x/briefs', `review-${f.sh('git rev-parse --short=12 HEAD')}.md`);
  ageBrief(brief);
  writeFileSync(join(f.fake, 'fail'), '');
  assert.match(f.lc('run', 'pr', 'x').stdout, /tmux did not answer: cannot tell whether session gate-x-review still runs/);
  rmSync(join(f.fake, 'fail'));
  assert.equal(f.bin('lc-close', ['gate-x-review']).status, 0);
  const r = f.lc('run', 'pr', 'x');
  assert.match(r.stdout, /session gate-x-review was closed \(lc-close\) with no record; start it again with --rerun review/, r.stdout + r.stderr);
  assert.equal(f.calls().split('\n').filter((l) => l.startsWith('new-')).length, 1);
});

test('lc-tell and lc-close address a window by its id: a name with a dot is not read as a pane', () => {
  const f = fixture('handoff_dir: $STATE\n');
  f.windows('@1\trel-1\n@2\trel-1.0\n');
  assert.equal(f.bin('lc-tell', ['rel-1.0', 'meant for rel-1.0']).status, 0);
  assert.match(f.calls(), /^send-keys -t @2 -l from .*: meant for rel-1\.0$/m);
  f.bin('lc-close', ['rel-1.0']);
  assert.match(f.calls(), /^kill-window -t @2$/m);
  assert.doesNotMatch(f.calls(), /kill-window -t (@1|agents:)/);
});

// Prompt lines captured with `tmux capture-pane -p -e` from real Claude Code windows (2.1): the dim
// placeholder of a new session, a dim suggested prompt after a turn, and text a person typed.
const PLACEHOLDER = '\u001b[39m❯\u00a0\u001b[2mTry "fix lint errors"\u001b[0m';
const SUGGESTED = '\u001b[39m❯\u00a0\u001b[2mHave the author fix F-1\u001b[0m';
const TYPED = '\u001b[39m❯\u00a0owner half typed';
test("lc-tell types over Claude Code's own dim placeholder or suggestion, never over typed text, and logs a refusal", () => {
  const f = fixture('handoff_dir: $STATE\n');
  f.windows('@1\tlead-x\n');
  const box = (line) => f.pane(`done\n\u001b[2m────\u001b[0m\n${line}\n\u001b[2m────\u001b[0m\n`);
  box(TYPED);
  const r = f.bin('lc-tell', ['lead-x', 'an answer']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /lead-x has unsent text in its input line \( ?owner half typed\); the line is kept in .*tell\.log/);
  assert.doesNotMatch(f.calls(), /send-keys/);
  assert.match(readFileSync(join(f.repo, 'state/tell.log'), 'utf8'), /\tlead-x\tan answer\trefused: lead-x has unsent text/);
  for (const line of [SUGGESTED, PLACEHOLDER]) {
    box(line);
    assert.equal(f.bin('lc-tell', ['lead-x', 'an answer']).status, 0, line);
  }
  assert.equal(f.calls().match(/^send-keys -t @1 -l /gm).length, 2);
  assert.match(readFileSync(join(f.repo, 'state/tell.log'), 'utf8'), /\tlead-x\tan answer\ttold$/m);
});

test('lc-park refuses a gate session: lc-gate run starts those', () => {
  const f = fixture(SESSION);
  assert.match(f.bin('lc-park', ['gate-x-review', '--resume', 'p']).stderr, /gate-x-review is a gate session/);
  assert.match(f.bin('lc-park', ['resume', 'gate-x-review']).stderr, /is a gate session/);
});

test("a retargeted PR: the runner's if N/As are decided again on the new base", () => {
  const f = fixture('handoff_dir: $STATE\npaths:\n  db: db/\ngate_pr:\n  migrate: command false if db\n');
  writeFileSync(join(f.fake, 'gh'), `#!/bin/sh\ncat "${f.fake}/base.json"\n`, { mode: 0o755 });
  writeFileSync(join(f.fake, 'base.json'), '{"baseRefName":"parent"}');
  f.sh('git remote add origin /nowhere && git checkout -q -b parent && mkdir db && echo m > db/m.sql && git add db && git commit -qm parent && git update-ref refs/remotes/origin/parent HEAD');
  f.sh('git checkout -q -b feat && echo f > f.txt && git add f.txt && git commit -qm feat');
  assert.match(f.lc('run', 'pr', 'feat').stdout, /migrate\s+command\s+N\/A \(no file changed/);
  writeFileSync(join(f.fake, 'base.json'), '{"baseRefName":"main"}');
  const r = f.lc('run', 'pr', 'feat');
  assert.match(r.stdout, /the base branch moved from parent to main/, r.stdout + r.stderr);
  assert.match(r.stdout, /migrate\s+command\s+FAIL/);
});
