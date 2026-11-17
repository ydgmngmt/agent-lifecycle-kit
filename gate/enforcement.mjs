// What makes this repository's gates binding, layer by layer (`lc-gate enforcement`), and the host's
// branch protection from ci.required_checks (`lc-gate protect`). Read with gate.mjs, which runs both.
//
// Five strengths, weakest last: the host refuses (required checks on a protected default branch,
// administrators included); a local hook refuses (earlier and cheaper); an independent record (the
// runner from a command's exit or a CI run, a separate session, the owner); the author's own word,
// which is never a gate step. Every gh call has a timeout (LC_GATE_GH_TIMEOUT ms, default 20s).
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { loadConfig } from '../board/config.mjs';
import { KIT, die, exec, gateMode, globRe, modeText, parseSteps } from './gate.mjs';

const words = (v) => String(v ?? '').split(/[\s,]+/).filter(Boolean);
const git = (repo, ...args) => exec('git', ['-C', repo, ...args], { ok: true, timeout: 10_000 }).stdout.trim();
const PLAN_REFUSES = 'the host\'s plan does not allow branch protection on this repository';

// gh, as { json } on success, { none } when the branch is not protected, { plan } when the host's plan
// refuses the feature, else { error } (gh missing, timed out, unreachable). Never throws.
function gh(repo, args, input) {
  const timeout = Number(process.env.LC_GATE_GH_TIMEOUT) || 20_000;
  const r = spawnSync('gh', args, { cwd: repo, timeout, input, encoding: 'utf8', killSignal: 'SIGKILL' });
  if (r.error?.code === 'ENOENT') return { error: 'gh is not installed, so the host\'s settings can\'t be read' };
  if (r.error?.code === 'ETIMEDOUT') return { error: `gh timed out after ${timeout / 1000}s: the host is unreachable` };
  if (r.error) return { error: r.error.message };
  if (r.status === 0) {
    try {
      return { json: JSON.parse(r.stdout || '{}') };
    } catch {
      return { error: `gh printed something that is not JSON: ${r.stdout.slice(0, 80)}` };
    }
  }
  const msg = r.stderr.trim().split('\n').at(-1) || `gh exit ${r.status}`;
  if (/HTTP 404/.test(msg) && /not protected/i.test(msg)) return { none: true, error: msg };
  if (/HTTP 403/.test(msg) && /upgrade|plan|public|not available/i.test(msg)) return { plan: true, error: msg };
  return { error: msg };
}

// The default branch: origin/HEAD, else a local main or master, else the host's answer.
function defaultBranch(repo) {
  const origin = git(repo, 'symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD');
  if (origin) return origin.replace(/^origin\//, '');
  for (const b of ['main', 'master']) if (exec('git', ['-C', repo, 'rev-parse', '--verify', '-q', `refs/heads/${b}`], { ok: true }).status === 0) return b;
  return gh(repo, ['api', 'repos/{owner}/{repo}', '--jq', '.default_branch']).json ?? 'main';
}

// A YAML list under `key:` in `text`: `[a, b]`, `a b`, or the `- a` lines below it; null without the key.
function yamlList(text, key) {
  const raw = text.split('\n');
  const at = raw.findIndex((l) => new RegExp(`^\\s*${escape(key)}:`).test(l));
  if (at < 0) return null;
  const strip = (v) => v.replace(/\s+#.*$/, '').replace(/\s+—.*$/, '').trim().replace(/^["']|["']$/g, '');
  const value = strip(raw[at].replace(/^[^:]*:/, ''));
  if (value) return words(value.replace(/^\[|\]$/g, '')).map(strip);
  const items = [];
  for (const l of raw.slice(at + 1)) {
    const m = l.match(/^\s*-\s+(.+)$/);
    if (!m) break;
    items.push(strip(m[1]));
  }
  return items;
}

// The protected_files globs: the project file's list, or the list a pointer `file#key` names.
function protectedGlobs(repo) {
  const items = yamlList(readFileSync(join(repo, '.agents/project.yaml'), 'utf8'), 'protected_files');
  if (items?.length !== 1 || !items[0].includes('#')) return items;
  const [file, key] = items[0].split('#');
  return existsSync(join(repo, file)) ? yamlList(readFileSync(join(repo, file), 'utf8'), key) ?? [] : [];
}

const workflowFiles = (repo) => {
  const dir = join(repo, '.github/workflows');
  return existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).map((f) => ({ path: `.github/workflows/${f}`, text: readFileSync(join(dir, f), 'utf8') })) : [];
};
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const definesJob = (text, name) => new RegExp(`^\\s{2}${escape(name)}:\\s*$|^\\s+name:\\s*["']?${escape(name)}["']?\\s*$`, 'm').test(text);

// Whether the kit's Claude Code plugin is enabled for this repository on this machine.
function pluginOn(repo) {
  if (!existsSync(join(KIT, 'hooks/hooks.json')) || !readFileSync(join(KIT, 'hooks/hooks.json'), 'utf8').includes('lc-gate')) return false;
  const files = [join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json'), join(repo, '.claude/settings.json'), join(repo, '.claude/settings.local.json')];
  let on = false;
  for (const f of files) {
    try {
      for (const [k, v] of Object.entries(JSON.parse(readFileSync(f, 'utf8')).enabledPlugins ?? {})) if (k.startsWith('agent-lifecycle-kit@')) on = v === true;
    } catch {
      // no such settings file
    }
  }
  return on;
}

// The pre-commit hook git runs here, if it calls lc-gate: { on, path, note }.
function gitHook(repo) {
  const hooksPath = git(repo, 'config', 'core.hooksPath');
  const dir = hooksPath || git(repo, 'rev-parse', '--git-path', 'hooks');
  const file = resolve(repo, dir, 'pre-commit');
  // The hook file as a rule file of the repository: its path in the repo, when it lives there.
  const inRepo = relative(repo, file);
  const path = hooksPath && !inRepo.startsWith('..') ? inRepo : '';
  const shown = path || file;
  if (!existsSync(file)) return { on: false, path, note: hooksPath ? `${shown} is missing` : 'core.hooksPath is not set and .git/hooks has no pre-commit' };
  try {
    accessSync(file, constants.X_OK);
  } catch {
    return { on: false, path, note: `${shown} is not executable` };
  }
  if (!readFileSync(file, 'utf8').includes('lc-gate')) return { on: false, path, note: `${shown} does not call lc-gate plan-check` };
  return { on: true, path, shown };
}

const BY = {
  command: 'the runner, from the command\'s exit at the head',
  workflow: 'the runner, from the CI run titled with the candidate',
  session: 'a separate session lc-gate run starts',
  here: 'the author',
  owner: 'the owner, on the board',
};

// The rows of the table: { layer, what, by, refuses, state, configured }. `state` starts with on, off
// or unknown for a layer; a mode's row says where the mode stands. --strict counts configured rows not on.
function rows(repo) {
  const cfg = loadConfig(repo);
  const c = cfg.conf;
  const out = [];
  const add = (layer, what, by, refuses, state, configured = true) => out.push({ layer, what, by, refuses, state, configured });
  const prMode = gateMode(cfg, 'gate_pr_mode');
  const planMode = gateMode(cfg, 'gate_pr_plan');
  const prSteps = parseSteps(c, 'pr');
  const phaseSteps = parseSteps(c, 'phase');
  const planned = prSteps.filter((s) => s.plan);
  const checks = words(c['ci.required_checks']);
  const flows = workflowFiles(repo);

  // The host.
  const branch = defaultBranch(repo);
  const p = gh(repo, ['api', `repos/{owner}/{repo}/branches/${branch}/protection`]);
  const host = (ok, note) =>
    p.plan ? `off: ${PLAN_REFUSES} (${p.error})` : p.none ? `off: ${branch} is not protected` : p.error ? `unknown: ${p.error}` : ok ? 'on' : `off: ${note}`;
  const j = p.json ?? {};
  const have = [...(j.required_status_checks?.contexts ?? []), ...(j.required_status_checks?.checks ?? []).map((x) => x.context)];
  const lacking = checks.filter((x) => !have.includes(x));
  const H = 'host refuses';
  const by = 'lc-gate protect, with the owner\'s host login';
  add(H, `required checks on ${branch}: ${checks.join(', ') || '(ci.required_checks is not set)'}`, by, 'the merge, while a check is missing or red', checks.length ? host(!lacking.length, `not required: ${lacking.join(', ')}`) : 'off: set ci.required_checks', Boolean(checks.length));
  add(H, 'branch up to date before merge', by, 'a merge of a head not tested on the current base', host(j.required_status_checks?.strict === true, 'strict is off'), Boolean(checks.length));
  add(H, 'pull requests only', by, 'a push straight to the default branch', host(Boolean(j.required_pull_request_reviews), 'no pull request required'), Boolean(checks.length));
  add(H, 'administrators included', by, 'the owner\'s login (and every session using it) skipping the above', host(j.enforce_admins?.enabled === true, 'administrators can bypass'), Boolean(checks.length));
  add(H, 'no force push, no deletion', by, 'history rewritten under the records', host(j.allow_force_pushes?.enabled === false && j.allow_deletions?.enabled === false, 'force push or deletion allowed'), Boolean(checks.length));
  for (const name of checks) {
    const f = flows.find((w) => definesJob(w.text, name));
    add(H, `workflow for ${name}`, 'CI, on every pull request', 'a required check that never reports blocks every merge', f ? `on: ${f.path}` : 'off: no job of that name in .github/workflows/');
  }
  const fromBase = flows.find((w) => /from-base\.sh/.test(w.text));
  add(H, 'checks judged by the base branch\'s copy', 'from-base.sh in the workflow', 'a pull request loosening the check, step list or mode that judges it', fromBase ? `on: ${fromBase.path}` : 'off: no workflow runs from-base.sh (templates/ci/)', Boolean(checks.length));

  // The local hooks.
  const L = 'local hook refuses';
  const hook = gitHook(repo);
  add(L, 'git pre-commit hook (core.hooksPath)', 'git, for every agent and person', 'a commit of planned files without the plan', hook.on ? `on: ${hook.shown}` : `off: ${hook.note}`, planned.length > 0 && planMode.mode !== 'off');
  add(L, 'Claude Code plugin hook', 'Claude Code, on this machine', 'an edit or commit without the plan; gh pr merge without the records', pluginOn(repo) ? 'on' : 'off: the agent-lifecycle-kit plugin is not enabled in Claude Code settings', prSteps.length > 0 && prMode.mode !== 'off');
  const refusesBy = (m, what) => (m.mode === 'enforce' ? what : m.mode === 'off' ? 'nothing: off' : 'nothing yet: logged and told (observe)');
  add('mode', 'gate_pr_mode', 'the project file', refusesBy(prMode, 'the hook at the gate start and at gh pr merge'), modeText(prMode), false);
  add('mode', 'gate_pr_plan', 'the project file', refusesBy(planMode, 'the hooks on edit and commit'), modeText(planMode), false);

  // The steps.
  for (const s of prSteps) {
    const own = s.kind === 'here';
    const refuses = prMode.mode === 'off' ? 'nothing: gate_pr_mode is off' : `the hook ${s.afterGate ? 'at gh pr merge' : 'at the gate start and at gh pr merge'}${prMode.mode === 'observe' ? ' (observe: logged only)' : ''}`;
    const who = s.afterGate && s.kind === 'command' ? 'the runner, from the review pipeline\'s result for the head' : BY[s.kind];
    add(own ? 'author\'s own word' : 'independent record', `gate_pr ${s.id}: ${s.kind} ${s.arg}${s.if ? ` if ${s.if}` : ''}${s.plan ? ' plan' : ''}${s.afterGate ? ' after-gate' : ''}`, who, refuses,
      own ? 'off: judges the author\'s own work; make it a session step, or a command after-gate step on the review pipeline\'s result' : 'on');
    if (s.plan) add(L, `gate_pr ${s.id} plan, before the first edit and commit`, 'the author, before the work: a plan, which the step then checks', refusesBy(planMode, 'the plugin hook on edit and commit, and the git pre-commit hook'), planMode.mode === 'off' ? 'off: gate_pr_plan is off' : 'on', false);
  }
  const phaseCheck = flows.find((w) => /check phase --diff|from-base\.sh\S*\s.*\bphase\b/.test(w.text));
  for (const s of phaseSteps) {
    add(s.kind === 'here' ? 'lead\'s record' : 'independent record', `gate_phase ${s.id}: ${s.kind}${s.arg ? ` ${s.arg}` : ''}`, s.kind === 'here' ? 'the lead' : BY[s.kind],
      'lc-gate check phase --diff in CI, once the roadmap marks the phase done', phaseCheck ? 'on' : 'off: no workflow runs lc-gate check phase --diff', Boolean(checks.length));
  }

  // The files that define the rules: each changes only in a pull request the owner reads.
  const listed = protectedGlobs(repo);
  const ruleFiles = new Set(['.agents/project.yaml']);
  if (hook.path) ruleFiles.add(hook.path);
  for (const w of flows) if (checks.some((n) => definesJob(w.text, n)) || /lc-gate|from-base\.sh/.test(w.text)) ruleFiles.add(w.path);
  if (existsSync(join(repo, '.agents/ci'))) for (const f of readdirSync(join(repo, '.agents/ci'))) ruleFiles.add(`.agents/ci/${f}`);
  for (const s of [...prSteps, ...phaseSteps]) for (const w of words(s.arg)) if (/[/.]/.test(w) && existsSync(join(repo, w))) ruleFiles.add(w);
  for (const k of ['pr_body.shapes', 'docs.stack_decisions', 'docs.stack_tools', 'docs.stack_exceptions']) {
    const f = c[k]?.split('#')[0];
    if (f && existsSync(join(repo, f))) ruleFiles.add(f);
  }
  for (const f of ruleFiles) {
    const on = listed?.some((g) => globRe(g).test(f));
    add('owner reads', f, 'the owner, in a pull request of its own', 'nothing by itself: the base-copy checks name the change, and the owner reads it', on ? 'on' : 'off: not in protected_files', Boolean(listed));
  }
  return out;
}

export function enforcement(repo, _pos, flags) {
  if (!existsSync(join(repo, '.agents/project.yaml'))) die(`no .agents/project.yaml in ${repo}: the bootstrap skill makes one`);
  const table = rows(repo);
  const off = table.filter((r) => r.configured && !r.state.startsWith('on'));
  const head = ['Layer', 'What', 'Recorded or set by', 'Refuses without it', 'State'];
  const cells = table.map((r) => [r.layer, r.what, r.by, r.refuses, r.state]);
  if (flags.md) {
    const cell = (v) => v.replace(/\|/g, '/');
    console.log([`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...cells.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n'));
  } else {
    const all = [head, ...cells];
    const width = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
    for (const r of all) console.log(r.map((x, i) => (i < r.length - 1 ? x.padEnd(width[i]) : x)).join('  ').trimEnd());
  }
  console.log(off.length ? `\n${off.length} configured layer(s) off:\n  ${off.map((r) => `${r.what}: ${r.state}`).join('\n  ')}` : '\nevery configured layer is on');
  return flags.strict && off.length ? 1 : 0;
}

// --- protect -----------------------------------------------------------------------------------

const names = (x) => ({ users: (x?.users ?? []).map((u) => u.login), teams: (x?.teams ?? []).map((t) => t.slug), apps: (x?.apps ?? []).map((a) => a.slug) });

// The PUT body: the kit's settings over what the branch already has. It only adds: every check
// already required stays, a stricter review rule stays, restrictions and other settings carry over.
export function protectionPayload(cur, checks) {
  const had = cur?.required_status_checks;
  const contexts = [...new Set([...(had?.contexts ?? []), ...(had?.checks ?? []).map((x) => x.context), ...checks])];
  const rv = cur?.required_pull_request_reviews;
  const reviews = rv
    ? Object.fromEntries([
      ...['dismiss_stale_reviews', 'require_code_owner_reviews', 'required_approving_review_count', 'require_last_push_approval'].filter((k) => rv[k] !== undefined).map((k) => [k, rv[k]]),
      ...(rv.dismissal_restrictions ? [['dismissal_restrictions', names(rv.dismissal_restrictions)]] : []),
      ...(rv.bypass_pull_request_allowances ? [['bypass_pull_request_allowances', names(rv.bypass_pull_request_allowances)]] : []),
    ])
    : { required_approving_review_count: 0 };
  const kept = Object.fromEntries(['required_linear_history', 'required_conversation_resolution', 'block_creations', 'lock_branch', 'allow_fork_syncing'].filter((k) => cur?.[k]?.enabled).map((k) => [k, true]));
  return {
    required_status_checks: { strict: true, contexts },
    enforce_admins: true,
    required_pull_request_reviews: reviews,
    restrictions: cur?.restrictions ? names(cur.restrictions) : null,
    allow_force_pushes: false,
    allow_deletions: false,
    ...kept,
  };
}

function planRefused(branch, msg) {
  console.error(`lc-gate: ${PLAN_REFUSES} (${branch}: ${msg}); the owner can make the repository public or upgrade the plan, and until then the gates hold through the local hooks and the records only.`);
  return 1;
}

export function protect(repo, _pos, flags) {
  const checks = words(loadConfig(repo).conf['ci.required_checks']);
  if (!checks.length) die('set ci.required_checks in .agents/project.yaml: the CI job names the default branch requires, separated by spaces');
  const branch = defaultBranch(repo);
  const path = `repos/{owner}/{repo}/branches/${branch}/protection`;
  const now = gh(repo, ['api', path]);
  if (now.plan) return planRefused(branch, now.error);
  if (now.error && !now.none) die(`can't read the protection of ${branch}: ${now.error}`);
  const payload = protectionPayload(now.json ?? null, checks);
  const kept = payload.required_status_checks.contexts.filter((x) => !checks.includes(x));
  console.log(`branch protection for ${branch} (gh api -X PUT ${path}):`);
  console.log(`  required checks: ${checks.join(', ')}${kept.length ? `; kept: ${kept.join(', ')}` : ''}`);
  console.log('  branch up to date before merge; pull requests only; administrators included; no force push or deletion');
  console.log(JSON.stringify(payload, null, 2));
  if (!flags.yes) {
    console.log('plan only: nothing was sent. Rerun with --yes to apply it.');
    return 0;
  }
  const put = gh(repo, ['api', '-X', 'PUT', path, '--input', '-'], JSON.stringify(payload));
  if (put.plan) return planRefused(branch, put.error);
  if (put.error) die(`the host refused the protection of ${branch}: ${put.error}`);
  console.log(`set: ${branch} is protected. lc-gate enforcement shows it.`);
  return 0;
}
