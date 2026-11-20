// lc-pr: a pull request's body from the project's template, one section at a time. Node 18+, no
// dependencies.
//
//   lc-pr open --title <t> [--base <b>] [--draft] [--section "<Heading>=<file>"]…
//       the body from pr.template in .agents/project.yaml (else .github/pull_request_template.md),
//       each given `## <Heading>` section's content replaced by the file's (appended when the template
//       has no such heading); refused while a heading of pr.required_sections (comma-separated) is
//       empty or only an HTML comment; then gh pr create --body-file
//   lc-pr section "<Heading>" --file <f> [--pr <n>]
//       the PR's body (gh pr view --json body) with that one section replaced, or appended when the
//       body has no such heading, every other byte as it was; gh pr edit --body-file
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../board/config.mjs';
import { GateError, die, exec } from '../gate/gate.mjs';

const GH_TIMEOUT = 60_000;

// The body's `## <heading>` sections, outside code fences: { heading, from, to }, from the index after
// the heading line to where the next heading of level 1 or 2 starts (or the end).
export function sections(body) {
  const out = [];
  let fence = false;
  let at = 0;
  for (const line of body.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const text = line.replace(/\r?\n$/, '');
    if (/^\s*(```|~~~)/.test(text)) fence = !fence;
    const m = !fence && text.match(/^(#{1,2})\s+(.*?)[\s#]*$/);
    if (m) {
      if (out.length) out.at(-1).to ??= at;
      if (m[1] === '##') out.push({ heading: m[2], from: at + line.length, to: null });
    }
    at += line.length;
  }
  if (out.length) out.at(-1).to ??= at;
  return out;
}

const find = (body, heading) => sections(body).find((s) => s.heading.trim().toLowerCase() === heading.trim().toLowerCase());

// The body with section `heading`'s content replaced by `text`, or the section appended; every other
// byte stays, and the body's line ending is kept.
export function replaceSection(body, heading, text) {
  const eol = body.includes('\r\n') ? '\r\n' : '\n';
  const content = text.replace(/\s+$/, '').split(/\r?\n/).join(eol);
  const s = find(body, heading);
  if (!s) {
    const pad = !body || body.endsWith(eol + eol) ? '' : body.endsWith(eol) ? eol : eol + eol;
    return `${body}${pad}## ${heading.trim()}${eol}${eol}${content}${eol}`;
  }
  const head = body.slice(0, s.from);
  const rest = body.slice(s.to);
  return `${head}${head.endsWith('\n') ? eol : eol + eol}${content}${eol}${rest ? eol : ''}${rest}`;
}

// The headings of `required` whose section is missing, empty, or only an HTML comment.
export function unfilled(body, required) {
  return required.filter((h) => {
    const s = find(body, h);
    return !s || !body.slice(s.from, s.to).replace(/<!--[\s\S]*?-->/g, '').trim();
  });
}

// gh with the body in a file of its own, removed after.
function withBody(body, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'lc-pr-'));
  try {
    const file = join(dir, 'body.md');
    writeFileSync(file, body);
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function open(repo, cwd, flags) {
  if (!flags.title) die('lc-pr open needs --title <title>');
  const conf = loadConfig(repo).conf;
  const tpl = join(repo, conf['pr.template'] || '.github/pull_request_template.md');
  let body = existsSync(tpl) ? readFileSync(tpl, 'utf8') : '';
  for (const spec of flags.section ?? []) {
    const i = spec.indexOf('=');
    if (i < 1) die(`--section "${spec}": write "<Heading>=<file>"`);
    body = replaceSection(body, spec.slice(0, i), readFileSync(resolve(cwd, spec.slice(i + 1)), 'utf8'));
  }
  const empty = unfilled(body, (conf['pr.required_sections'] ?? '').split(',').map((h) => h.trim()).filter(Boolean));
  if (empty.length) die(`${empty.map((h) => `## ${h}`).join(', ')} ${empty.length > 1 ? 'are' : 'is'} still empty or only a comment (pr.required_sections): fill each with --section "<Heading>=<file>"`);
  const args = ['pr', 'create', '--title', flags.title, ...(flags.base ? ['--base', flags.base] : []), ...(flags.draft ? ['--draft'] : [])];
  const out = withBody(body, (file) => exec('gh', [...args, '--body-file', file], { cwd: repo, timeout: GH_TIMEOUT }));
  process.stdout.write(out.stdout);
  return 0;
}

function section(repo, cwd, [heading], flags) {
  if (!heading?.trim() || !flags.file) die('usage: lc-pr section "<Heading>" --file <f> [--pr <n>]');
  const target = flags.pr ? [String(flags.pr)] : [];
  const body = JSON.parse(exec('gh', ['pr', 'view', ...target, '--json', 'body'], { cwd: repo, timeout: GH_TIMEOUT }).stdout).body ?? '';
  const next = replaceSection(body, heading, readFileSync(resolve(cwd, flags.file), 'utf8'));
  withBody(next, (file) => exec('gh', ['pr', 'edit', ...target, '--body-file', file], { cwd: repo, timeout: GH_TIMEOUT }));
  console.log(`${find(body, heading) ? 'replaced' : 'added'} the ## ${heading.trim()} section`);
  return 0;
}

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) pos.push(a);
    else if (a === '--draft') flags.draft = true;
    else if (argv[i + 1] === undefined) die(`${a} needs a value`);
    else if (a === '--section') (flags.section ??= []).push(argv[++i]);
    else flags[a.slice(2)] = argv[++i];
  }
  return { pos, flags };
}

export function main(argv, cwd = process.cwd()) {
  const [cmd, ...rest] = argv;
  const repo = exec('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { ok: true }).stdout.trim() || cwd;
  const { pos, flags } = parseArgs(rest);
  if (cmd === 'open') return open(repo, cwd, flags);
  if (cmd === 'section') return section(repo, cwd, pos, flags);
  die('usage: lc-pr open --title <t> [--base <b>] [--draft] [--section "<Heading>=<file>"]… | lc-pr section "<Heading>" --file <f> [--pr <n>]');
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof GateError)) throw err;
    console.error(`lc-pr: ${err.message}`);
    process.exitCode = 1;
  }
}
