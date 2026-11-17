// lc-gate enforcement, lc-gate protect and the self-ending observe period, against a stubbed gh.
// Run: node --test gate/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('./gate.mjs', import.meta.url));
const KIT = fileURLToPath(new URL('..', import.meta.url));

const sh = (cwd, cmd) => {
  const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

// A fake gh: logs its arguments to gh.log; `pr view` prints view.json; `api … -X PUT` keeps its stdin
// in put.json; any other `api` call prints api.json, or api.err on stderr with exit 1 when it exists.
function stubGh() {
  const dir = mkdtempSync(join(tmpdir(), 'lc-gh-'));
  writeFileSync(join(dir, 'gh'), `#!/bin/sh
d=$(dirname "$0")
echo "$*" >> "$d/gh.log"
case "$*" in
  *"pr view"*) cat "$d/view.json"; exit 0 ;;
  *"-X PUT"*) cat > "$d/put.json"; [ -f "$d/put.err" ] && { cat "$d/put.err" >&2; exit 1; }; echo '{}'; exit 0 ;;
  *"-X DELETE"*) exit 0 ;;
esac
[ -f "$d/sleep" ] && exec sleep 5
[ -f "$d/api.err" ] && { cat "$d/api.err" >&2; exit 1; }
cat "$d/api.json"
`, { mode: 0o755 });
  return {
    dir,
    set: (file, text) => writeFileSync(join(dir, file), text),
    log: () => (existsSync(join(dir, 'gh.log')) ? readFileSync(join(dir, 'gh.log'), 'utf8') : ''),
    put: () => JSON.parse(readFileSync(join(dir, 'put.json'), 'utf8')),
  };
}

// The host's protection with every setting the kit asks for.
const FULL = (checks) => JSON.stringify({
  required_status_checks: { strict: true, contexts: checks },
  enforce_admins: { enabled: true },
  required_pull_request_reviews: { required_approving_review_count: 0 },
  allow_force_pushes: { enabled: false },
  allow_deletions: { enabled: false },
});

const YAML = `handoff_dir: $STATE
ci:
  required_checks: verify-pr pr-body
gate_pr_mode: enforce
gate_pr_plan: enforce
paths:
  mechanism: src/**
gate_pr:
  tool-fit: session docs/review/tool-fit.md if mechanism plan
  review: command node .agents/ci/pipeline-passed.mjs review after-gate
gate_phase:
  stack: session docs/review/stack-hunt.md
protected_files: [.agents/project.yaml, .agents/ci/**, .githooks/pre-commit, .github/workflows/**, docs/review/**]
`;

// A repository with every layer on: workflows for the checks, the git hook, the plugin enabled.
function repoWith(yaml = YAML, { layers = true } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'lc-enf-'));
  const home = mkdtempSync(join(tmpdir(), 'lc-home-'));
  sh(repo, 'git init -q -b main && git config user.name t && git config user.email t@t');
  mkdirSync(join(repo, '.agents'));
  writeFileSync(join(repo, '.agents/project.yaml'), yaml.replaceAll('$STATE', `${repo}/state`));
  mkdirSync(join(repo, 'docs/review'), { recursive: true });
  writeFileSync(join(repo, 'docs/review/tool-fit.md'), 'q');
  writeFileSync(join(repo, 'docs/review/stack-hunt.md'), 'q');
  if (layers) {
    mkdirSync(join(repo, '.github/workflows'), { recursive: true });
    writeFileSync(join(repo, '.github/workflows/pr.yml'), 'jobs:\n  verify-pr:\n    steps:\n      - run: bash .agents/ci/from-base.sh "$B" "$H" .lc-kit phase\n');
    writeFileSync(join(repo, '.github/workflows/pr-body.yml'), 'jobs:\n  pr-body:\n    steps:\n      - run: bash .agents/ci/from-base.sh "$B" "$H" .lc-kit pr-body\n');
    sh(repo, `mkdir -p .githooks && cp ${KIT}templates/githooks/pre-commit .githooks/ && git config core.hooksPath .githooks`);
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(join(home, '.claude/settings.json'), JSON.stringify({ enabledPlugins: { 'agent-lifecycle-kit@agent-lifecycle-kit': true } }));
  }
  sh(repo, 'git add -A && git commit -qm one');
  const gh = stubGh();
  const lc = (args, env = {}) =>
    spawnSync(process.execPath, [GATE, ...args], { cwd: repo, encoding: 'utf8', env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: '', LC_GATE_STEP: '', PATH: `${gh.dir}:/usr/bin:/bin`, ...env } });
  return { repo, home, gh, lc, git: (cmd) => sh(repo, cmd) };
}

const line = (out, re) => out.split('\n').find((l) => re.test(l)) ?? '';

test('enforcement: every layer on, --strict holds', () => {
  const r = repoWith();
  r.gh.set('api.json', FULL(['verify-pr', 'pr-body']));
  const out = r.lc(['enforcement', '--strict']);
  assert.equal(out.status, 0, out.stdout + out.stderr);
  for (const re of [/required checks/, /up to date/, /pull requests only/, /administrators included/, /core\.hooksPath/, /Claude Code plugin hook/, /workflow for verify-pr/, /workflow for pr-body/, /base branch's copy/]) {
    assert.match(line(out.stdout, re), /\bon\b/, `${re}: ${line(out.stdout, re)}`);
  }
  assert.match(line(out.stdout, /^.*\breview\b.*after-gate/), /the review pipeline/);
  assert.match(line(out.stdout, /tool-fit/), /separate session/);
  assert.match(line(out.stdout, /gate_pr_mode/), /enforce/);
  assert.match(line(out.stdout, /\.agents\/project\.yaml/), /\bon\b/);
});

test('enforcement: each layer off is named, and --strict exits 1; without --strict, 0', () => {
  const yaml = YAML.replace('  review: command', '  self-review: here code-review of the diff\n  review: command').replace(/protected_files: .*\n/, 'protected_files: [.agents/project.yaml]\n');
  const r = repoWith(yaml, { layers: false });
  r.gh.set('api.err', 'gh: Branch not protected (HTTP 404)\n');
  const out = r.lc(['enforcement', '--strict']);
  assert.equal(out.status, 1);
  assert.match(line(out.stdout, /required checks/), /\boff\b.*not protected/);
  assert.match(line(out.stdout, /core\.hooksPath/), /\boff\b/);
  assert.match(line(out.stdout, /Claude Code plugin hook/), /\boff\b/);
  assert.match(line(out.stdout, /workflow for verify-pr/), /\boff\b/);
  assert.match(line(out.stdout, /self-review/), /author's own word.*\boff\b/);
  assert.match(line(out.stdout, /^owner reads\s+docs\/review\/tool-fit\.md/), /\boff\b.*protected_files/);
  assert.match(line(out.stdout, /^owner reads\s+\.agents\/project\.yaml/), /\bon$/);
  assert.match(out.stdout, /configured layer\(s\) off/);
  assert.equal(r.lc(['enforcement']).status, 0);
});

test('enforcement: the host plan refuses, the host is unreachable, gh is missing', () => {
  const r = repoWith();
  r.gh.set('api.err', 'gh: Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)\n');
  let out = r.lc(['enforcement', '--strict']);
  assert.equal(out.status, 1);
  assert.match(line(out.stdout, /required checks/), /plan does not allow/);
  r.gh.set('api.err', 'error connecting to api.github.com\n');
  out = r.lc(['enforcement']);
  assert.equal(out.status, 0);
  assert.match(line(out.stdout, /required checks/), /unknown.*error connecting/);
  r.gh.set('sleep', '');
  const t0 = Date.now();
  out = r.lc(['enforcement'], { LC_GATE_GH_TIMEOUT: '500' });
  assert.ok(Date.now() - t0 < 4000, 'the timeout holds');
  assert.match(line(out.stdout, /required checks/), /unknown.*timed out/);
  out = r.lc(['enforcement'], { PATH: gitOnly() });
  assert.match(line(out.stdout, /required checks/), /unknown.*gh is not installed/);
});

// A PATH directory with git and nothing else.
function gitOnly() {
  const dir = mkdtempSync(join(tmpdir(), 'lc-git-'));
  sh(dir, `ln -s "$(command -v git)" git`);
  return dir;
}

test('enforcement --md prints a Markdown table', () => {
  const r = repoWith();
  r.gh.set('api.json', FULL(['verify-pr', 'pr-body']));
  const out = r.lc(['enforcement', '--md']);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /^\| Layer \| What \| Recorded or set by \| Refuses without it \| State \|$/m);
  assert.match(out.stdout, /^\| --- \|/m);
});

test('protect: the plan only, without --yes; nothing is sent', () => {
  const r = repoWith();
  r.gh.set('api.err', 'gh: Branch not protected (HTTP 404)\n');
  const out = r.lc(['protect']);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /plan only/);
  assert.match(out.stdout, /"verify-pr"/);
  assert.doesNotMatch(r.gh.log(), /-X PUT|-X DELETE/);
});

test('protect --yes: the payload as specified', () => {
  const r = repoWith();
  r.gh.set('api.err', 'gh: Branch not protected (HTTP 404)\n');
  const out = r.lc(['protect', '--yes']);
  assert.equal(out.status, 0, out.stderr);
  assert.match(r.gh.log(), /api -X PUT repos\/\{owner\}\/\{repo\}\/branches\/main\/protection --input -/);
  assert.deepEqual(r.gh.put(), {
    required_status_checks: { strict: true, contexts: ['verify-pr', 'pr-body'] },
    enforce_admins: true,
    required_pull_request_reviews: { required_approving_review_count: 0 },
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
  });
});

test('protect never removes: existing checks, reviews and settings stay; no DELETE', () => {
  const r = repoWith();
  r.gh.set('api.json', JSON.stringify({
    required_status_checks: { strict: false, contexts: ['legacy'] },
    enforce_admins: { enabled: false },
    required_pull_request_reviews: { required_approving_review_count: 2, dismiss_stale_reviews: true, require_code_owner_reviews: false, require_last_push_approval: false },
    restrictions: { users: [{ login: 'someone' }], teams: [], apps: [] },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: true },
    allow_deletions: { enabled: false },
  }));
  assert.equal(r.lc(['protect', '--yes']).status, 0);
  const p = r.gh.put();
  assert.deepEqual(p.required_status_checks.contexts, ['legacy', 'verify-pr', 'pr-body']);
  assert.equal(p.required_pull_request_reviews.required_approving_review_count, 2);
  assert.equal(p.required_pull_request_reviews.dismiss_stale_reviews, true);
  assert.deepEqual(p.restrictions, { users: ['someone'], teams: [], apps: [] });
  assert.equal(p.required_linear_history, true);
  assert.equal(p.allow_force_pushes, false);
  assert.equal(p.enforce_admins, true);
  assert.doesNotMatch(r.gh.log(), /DELETE/);
});

test('protect: the host plan refuses in one line; no required_checks is an error', () => {
  const r = repoWith();
  r.gh.set('api.err', 'gh: Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)\n');
  const out = r.lc(['protect', '--yes']);
  assert.equal(out.status, 1);
  assert.equal(out.stderr.trim().split('\n').length, 1);
  assert.match(out.stderr, /plan does not allow.*public.*upgrade/i);
  const bare = repoWith(YAML.replace('  required_checks: verify-pr pr-body\n', ''));
  assert.match(bare.lc(['protect']).stderr, /ci\.required_checks/);
});

// observe <n>: the gate observes until n PRs merged with every record, then enforces by itself.
const COUNTED = (mode) => `handoff_dir: $STATE\ngate_pr_mode: ${mode}\ngate_pr:\n  review: session q.md\n`;

test('observe <n>: counts merges with every record, ignores one with a missing record, then enforces once', () => {
  const r = repoWith(COUNTED('observe 2'), { layers: false });
  const hook = (command) =>
    spawnSync(process.execPath, [GATE, 'hook'], { cwd: r.repo, encoding: 'utf8', env: { ...process.env, LC_GATE_STEP: '', PATH: `${r.gh.dir}:/usr/bin:/bin` }, input: JSON.stringify({ tool_name: 'Bash', cwd: r.repo, tool_input: { command } }) });
  const pr = (branch, recorded) => {
    r.git(`git checkout -q -b ${branch} main && git commit -q --allow-empty -m ${branch}`);
    const head = r.git('git rev-parse HEAD');
    if (recorded) assert.equal(r.lc(['record', 'pr', branch, 'review', 'na', '--reason', 'docs only', '--candidate', 'HEAD']).status, 0);
    r.gh.set('view.json', JSON.stringify({ headRefName: branch, headRefOid: head }));
    return hook('gh pr merge --squash');
  };
  assert.equal(pr('a', true).status, 0);
  assert.match(line(r.lc(['enforcement']).stdout, /gate_pr_mode/), /observing, 1 of 2/);
  const missing = pr('b', false);
  assert.equal(missing.status, 0);
  assert.match(missing.stdout, /observe mode/);
  assert.match(line(r.lc(['enforcement']).stdout, /gate_pr_mode/), /observing, 1 of 2/);
  assert.equal(pr('c', true).status, 0);
  assert.match(line(r.lc(['enforcement']).stdout, /gate_pr_mode/), /enforce \(observe 2 ended: 2 merged with every record\)/);
  const first = pr('d', false);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /refusals are now real/);
  const again = hook('gh pr merge --squash');
  assert.equal(again.status, 2);
  assert.doesNotMatch(again.stderr, /refusals are now real/);
});

test('observe <n> on gate_pr_plan: the edit hook refuses once n PRs merged with every record', () => {
  const yaml = `handoff_dir: $STATE\ngate_pr_mode: observe\ngate_pr_plan: observe 1\npaths:\n  mech: src/**\ngate_pr:\n  fit: session q.md if mech plan\n`;
  const r = repoWith(yaml, { layers: false });
  const hook = (tool, input) =>
    spawnSync(process.execPath, [GATE, 'hook'], { cwd: r.repo, encoding: 'utf8', env: { ...process.env, LC_GATE_STEP: '', PATH: `${r.gh.dir}:/usr/bin:/bin` }, input: JSON.stringify({ tool_name: tool, cwd: r.repo, tool_input: input }) });
  r.git('git checkout -q -b a && git commit -q --allow-empty -m a');
  assert.equal(hook('Edit', { file_path: join(r.repo, 'src/x.js') }).status, 0);
  assert.equal(r.lc(['record', 'pr', 'a', 'fit', 'na', '--reason', 'no src change', '--candidate', 'HEAD']).status, 0);
  r.gh.set('view.json', JSON.stringify({ headRefName: 'a', headRefOid: r.git('git rev-parse HEAD') }));
  assert.equal(hook('Bash', { command: 'gh pr merge --squash' }).status, 0);
  r.git('git checkout -q -b b main');
  const edit = hook('Edit', { file_path: join(r.repo, 'src/x.js') });
  assert.equal(edit.status, 2);
  assert.match(edit.stderr, /refusals are now real/);
});

test('a mode that is not off, observe, observe <n> or enforce is an error', () => {
  const r = repoWith(COUNTED('observe two'), { layers: false });
  assert.match(r.lc(['enforcement']).stdout + r.lc(['enforcement']).stderr, /gate_pr_mode is "observe two"/);
});

test('the project template: modes observe 3, no here step in gate_pr, the review step after-gate, the stack hunt its own phase step', async () => {
  const { parseProject } = await import('../board/config.mjs');
  const { parseSteps } = await import('./gate.mjs');
  const conf = parseProject(readFileSync(join(KIT, 'templates/project.yaml'), 'utf8'));
  assert.equal(conf.gate_pr_mode, 'observe 3');
  assert.equal(conf.gate_pr_plan, 'observe 3');
  const pr = parseSteps(conf, 'pr');
  assert.deepEqual(pr.filter((s) => s.kind === 'here'), []);
  assert.deepEqual(pr.find((s) => s.id === 'review'), { id: 'review', kind: 'command', arg: 'node .agents/ci/pipeline-passed.mjs review', if: null, afterGate: true });
  assert.equal(pr.find((s) => s.id === 'tool-fit').plan, true);
  assert.equal(parseSteps(conf, 'phase').find((s) => s.id === 'stack').arg, 'docs/review/stack-hunt.md');
  assert.equal(conf['ci.required_checks'], 'verify-pr pr-body');
});

// The PR body check as CI runs it: from-base.sh, the base commit's script, project file and shapes.
test('the pr-body check: needs the section when the diff touches the paths, and judges by the base copy', () => {
  const r = repoWith(`paths:\n  mechanism: src/**\npr_body:\n  heading: Tool fit\n  if: mechanism\n  shapes: docs/review/tool-fit.md#accepted-lines\n`, { layers: false });
  r.git(`mkdir -p .agents/ci && cp ${KIT}templates/ci/from-base.sh ${KIT}templates/ci/pr-body-check.mjs .agents/ci/ && cp ${KIT}templates/review/tool-fit.md docs/review/ && git add -A && git commit -qm ci`);
  const base = r.git('git rev-parse HEAD');
  const event = join(r.repo, '..', `${Date.now()}-event.json`);
  const ci = (body) => {
    writeFileSync(event, JSON.stringify({ pull_request: { body } }));
    return spawnSync('bash', [`${r.repo}/.agents/ci/from-base.sh`, base, 'HEAD', KIT, 'pr-body'], { cwd: r.repo, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_PATH: event } });
  };
  r.git('git checkout -q -b feat && echo x > notes.md && git add -A && git commit -qm docs');
  assert.match(ci('').stdout, /no record needed/);
  r.git('mkdir -p src && echo x > src/a.js && git add -A && git commit -qm code');
  const none = ci('## What\n\nstuff\n');
  assert.equal(none.status, 1);
  assert.match(none.stderr, /no `## Tool fit` section/);
  const bad = ci('## Tool fit\n\n- I wrote a queue\n');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /none of the accepted shapes:\n {2}- I wrote a queue/);
  assert.equal(ci('## Tool fit\n\n- I will call queue.add (https://docs.example/queue) for retries at src/a.js:1\n\nGenerated by a tool').status, 0);
  assert.equal(ci('## Tool fit\nno new mechanism\n').status, 0);
  // A PR that loosens the shapes is still judged by the base's: and it is named.
  r.git(`sed -i 's/^no new mechanism$/<anything>/' docs/review/tool-fit.md && git commit -qam loosen`);
  const loose = ci('## Tool fit\n\n- I wrote a queue\n');
  assert.equal(loose.status, 1);
  const loosenedProject = r.git(`sed -i 's/^  if: mechanism$/  if: nothing/' .agents/project.yaml && git commit -qam narrow && echo ok`);
  assert.equal(loosenedProject, 'ok');
  const narrowed = ci('## Tool fit\n\n- I wrote a queue\n');
  assert.equal(narrowed.status, 1);
  assert.match(narrowed.stdout, /PROTECTED GATE CHANGE: \.agents\/project\.yaml/);
});

test('the phase check through from-base.sh uses the base step list', () => {
  const yaml = 'docs:\n  roadmap: road.md\n  phase_records: records/\ngate_phase:\n  build: command true\n  lint: command true\n';
  const r = repoWith(yaml, { layers: false });
  r.git(`mkdir -p .agents/ci && cp ${KIT}templates/ci/from-base.sh .agents/ci/ && git add -A && git commit -qm ci`);
  const base = r.git('git rev-parse HEAD');
  const row = (step) => `| ${step} | command | PASS | ${base} | lc-gate | \`true\` exit 0 |  |`;
  mkdirSync(join(r.repo, 'records'));
  writeFileSync(join(r.repo, 'records/one.md'), `# Phase record: one\n\n- **Gate:** phase one\n- **Candidate:** ${base}\n\n| Step | Kind | Status | Commit | By | Evidence | Reason |\n| --- | --- | --- | --- | --- | --- | --- |\n${row('build')}\n`);
  writeFileSync(join(r.repo, 'road.md'), '## One (done) [record](records/one.md)\n');
  r.git(`sed -i '/lint/d' .agents/project.yaml && git add -A && git commit -qm "one done, lint dropped"`);
  const out = spawnSync('bash', ['.agents/ci/from-base.sh', base, 'HEAD', KIT, 'phase'], { cwd: r.repo, encoding: 'utf8' });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /lint: missing/);
  assert.match(out.stdout, /PROTECTED GATE CHANGE/);
});
