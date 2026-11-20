// The board's page data and the board process's own relay of answers to the lead. The server runs on a
// free port with a fake tmux and gh on PATH. Run: node --test board/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const freePort = () => new Promise((ok) => {
  const s = createServer().listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => ok(port));
  });
});

async function board() {
  const repo = mkdtempSync(join(tmpdir(), 'lc-board-'));
  const sh = (cmd) => assert.equal(spawnSync('bash', ['-c', cmd], { cwd: repo }).status, 0, cmd);
  sh('git init -q -b main && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m one');
  mkdirSync(join(repo, '.agents'));
  writeFileSync(join(repo, '.agents/project.yaml'), `handoff_dir: ${repo}/state\nsessions:\n  tmux_session: agents\n  lead: orch\n`);
  const data = join(repo, 'state/board');
  mkdirSync(data, { recursive: true });
  writeFileSync(join(data, 'questions.json'), JSON.stringify([{ id: 'q1', title: 'Ship it?', options: [{ label: 'Yes' }, { label: 'No' }] }]));
  writeFileSync(join(data, 'answers.jsonl'), `${JSON.stringify({ id: 'q0', choice: 0, text: 'old', at: 't' })}\n`);
  const fake = mkdtempSync(join(tmpdir(), 'lc-fake-'));
  writeFileSync(join(fake, 'tmux'), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >>"${fake}/calls"\ncase "$1" in list-windows) printf '@1\\torch\\n' ;; esac\nexit 0\n`, { mode: 0o755 });
  writeFileSync(join(fake, 'gh'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const port = await freePort();
  const server = spawn('node', [join(KIT, 'board/server.mjs'), repo], { env: { ...process.env, PATH: `${fake}:${process.env.PATH}`, LC_BOARD_PORT: String(port), LC_BOARD_DIR: data, LC_TMUX_SESSION: '' }, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${url}/api/stale`);
      break;
    } catch {
      await sleep(100);
    }
  }
  return { repo, data, fake, url, stop: () => server.kill(), calls: () => (existsSync(join(fake, 'calls')) ? readFileSync(join(fake, 'calls'), 'utf8') : '') };
}

test("the board's state lists read-afterwards.jsonl, newest first, and the page has its panel", async () => {
  const b = await board();
  try {
    const line = (step, at) => JSON.stringify({ gate: 'phase', id: 'core', step, commit: 'a'.repeat(40), reason: 'a dry run', by: 'lead', at });
    writeFileSync(join(b.data, 'read-afterwards.jsonl'), `${line('acceptance', '2026-11-01T00:00:00Z')}\n${line('signoff', '2026-11-02T00:00:00Z')}\n`);
    const state = await (await fetch(`${b.url}/api/state`)).json();
    assert.deepEqual(state.afterwards.map((a) => [a.gate, a.id, a.step, a.reason]), [['phase', 'core', 'signoff', 'a dry run'], ['phase', 'core', 'acceptance', 'a dry run']]);
    assert.match(await (await fetch(b.url)).text(), /<h2>Read afterwards<\/h2>/);
  } finally {
    b.stop();
  }
});

test('the board process tells the lead each new answer with lc-tell lead; answers before it started are not told', async () => {
  const b = await board();
  try {
    const r = await fetch(`${b.url}/api/answer`, { method: 'POST', headers: { 'content-type': 'application/json', origin: b.url }, body: JSON.stringify({ id: 'q1', choice: 0, text: 'after the tests' }) });
    assert.equal(r.status, 200);
    const log = join(b.repo, 'state/tell.log');
    for (let i = 0; i < 50 && !existsSync(log); i++) await sleep(100);
    assert.match(readFileSync(log, 'utf8'), /^\S+ \S+\tboard\torch\tboard answer to q1 \(Ship it\?\): Yes: after the tests$/m);
    assert.doesNotMatch(readFileSync(log, 'utf8'), /q0/);
    assert.match(b.calls(), /^send-keys -t agents:orch -l from board: board answer to q1/m);
    // A line another writer appends is told too.
    writeFileSync(join(b.data, 'answers.jsonl'), `${JSON.stringify({ id: 'q1', choice: 1, text: '', at: 't' })}\n`, { flag: 'a' });
    for (let i = 0; i < 50 && !/: No$/m.test(readFileSync(log, 'utf8')); i++) await sleep(100);
    assert.match(readFileSync(log, 'utf8'), /board answer to q1 \(Ship it\?\): No$/m);
  } finally {
    b.stop();
  }
});
