// The check's invariants. Run: node --test gate/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, prCurrent } from './gate.mjs';

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
