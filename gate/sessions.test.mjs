// The sessions lc-gate run starts: their model, the folder-trust prompt, and a session that sits idle.
// tmux is a fake on PATH that logs its calls and shows a pane from a file. Run: node --test gate/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  send-keys) [ -e "${fake}/sticky" ] || echo working >"${fake}/pane" ;;
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
