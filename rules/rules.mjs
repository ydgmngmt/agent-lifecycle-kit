// lc-rules: the project's mechanical rules, from .agents/rules.yaml. Node 18+, no dependencies.
//
//   lc-rules check [--base <sha>]   exit 1 on a finding beyond .agents/rules-baseline.json. With --base,
//                                   the base commit's rules and baseline judge; when this change edits
//                                   either, it says so loudly and this change's copy judges as well
//   lc-rules selftest               each rule must fail its red example and pass its green one
//   lc-rules baseline [--prune]     adds the findings of rules not yet in the baseline; --prune drops
//                                   entries no longer found. An entry is never added to a rule already in it
//
// A rule: id, decision (the path of the written decision it enforces, optionally #section), message,
// kind, paths (globs it looks at; default every file, for dependency **/package.json and
// **/requirements*.txt), except (globs it skips), red and green ({ file, text }), and per kind:
//   import      package: <name> or module: <repo path>, imported outside owners: [globs]. JS/TS
//               import, export … from, require() and import(); Python import and from … import
//   dependency  allow: [names, * globs]: any other dependency in a package.json or requirements file
//   text        words: <exact text> or pattern: <regular expression>, one finding per occurrence
//   path        every file under paths is a finding: a kind of file that may not be added
// The baseline holds { <rule id>: [{ file, match }] }; a finding beyond its count there fails.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RULES = '.agents/rules.yaml';
export const BASELINE = '.agents/rules-baseline.json';
export const KINDS = { import: ['package', 'module', 'owners'], dependency: ['allow'], text: ['words', 'pattern'], path: [] };
const COMMON = ['id', 'decision', 'message', 'kind', 'paths', 'except', 'red', 'green'];
const JS = /\.(m?[jt]sx?|c[jt]s|vue|svelte|astro)$/;
const MANIFESTS = ['**/package.json', '**/requirements*.txt'];

export class RulesError extends Error {}
const die = (msg) => {
  throw new RulesError(msg);
};

// --- a small YAML: maps, lists, [inline] and {inline} collections, quoted scalars, | blocks, comments

export function parseYaml(text) {
  const lines = text.split('\n');
  let i = 0;
  const err = (msg) => die(`line ${i + 1}: ${msg}`);
  const blank = (l) => /^\s*(#.*)?$/.test(l);
  const indent = (l) => l.match(/^ */)[0].length;
  const skip = () => {
    while (i < lines.length && blank(lines[i])) i++;
  };
  // Splits "a, 'b, c', d" at the commas outside quotes and brackets.
  const split = (s) => {
    const out = [];
    let cur = '';
    let q = '';
    let depth = 0;
    for (const ch of s) {
      if (q) q = ch === q ? '' : q;
      else if (ch === '"' || ch === "'") q = ch;
      else if ('[{'.includes(ch)) depth++;
      else if (']}'.includes(ch)) depth--;
      else if (ch === ',' && !depth) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (q) err('a quote is not closed');
    if (cur.trim()) out.push(cur);
    return out;
  };
  const scalar = (v) => {
    v = v.trim();
    if (v.startsWith('"')) {
      const m = v.match(/^("(?:[^"\\]|\\.)*")\s*(#.*)?$/);
      if (!m) err('a quote is not closed');
      return JSON.parse(m[1]);
    }
    if (v.startsWith("'")) {
      const m = v.match(/^'((?:[^']|'')*)'\s*(#.*)?$/);
      if (!m) err('a quote is not closed');
      return m[1].replace(/''/g, "'");
    }
    if (v.startsWith('[') || v.startsWith('{')) {
      const close = v.startsWith('[') ? ']' : '}';
      const m = v.match(new RegExp(`^.(.*)\\${close}\\s*(#.*)?$`));
      if (!m) err(`${v[0]} without its ${close}`);
      const items = split(m[1]);
      if (close === ']') return items.map(scalar);
      const map = {};
      for (const item of items) {
        const kv = item.trim().match(/^([\w.-]+):\s+(.*)$/s);
        if (!kv) err(`not key: value: ${item.trim()}`);
        map[kv[1]] = scalar(kv[2]);
      }
      return map;
    }
    return v.replace(/\s+#.*$/, '');
  };
  // A | or |- block: the lines indented deeper than `at`.
  const literal = (at, strip) => {
    const body = [];
    let inner = -1;
    while (i < lines.length && (blank(lines[i]) || indent(lines[i]) > at)) {
      if (inner < 0 && !blank(lines[i])) inner = indent(lines[i]);
      body.push(lines[i]);
      i++;
    }
    while (body.length && !body.at(-1).trim()) body.pop();
    const out = body.map((l) => l.slice(inner)).join('\n');
    return strip ? out : `${out}\n`;
  };
  const value = (rest, at) => {
    rest = rest.trim();
    if (!rest || rest.startsWith('#')) {
      i++;
      skip();
      if (i < lines.length && (indent(lines[i]) > at || (indent(lines[i]) === at && /^\s*-( |$)/.test(lines[i])))) return block(indent(lines[i]));
      return null;
    }
    const lit = rest.match(/^\|(-?)\s*(#.*)?$/);
    i++;
    return lit ? literal(at, lit[1] === '-') : scalar(rest);
  };
  const block = (at) => {
    skip();
    if (/^-( |$)/.test(lines[i].slice(at))) {
      const out = [];
      for (skip(); i < lines.length && indent(lines[i]) >= at; skip()) {
        if (indent(lines[i]) > at) err('indented deeper than the list');
        const t = lines[i].slice(at);
        if (!/^-( |$)/.test(t)) break;
        const rest = t.slice(2);
        if (/^[\w.-]+:( |$)/.test(rest)) {
          lines[i] = ' '.repeat(at + 2) + rest; // the item's map starts on its dash's line
          out.push(block(at + 2));
        } else out.push(value(rest, at));
      }
      return out;
    }
    const out = {};
    for (skip(); i < lines.length && indent(lines[i]) >= at; skip()) {
      if (indent(lines[i]) > at) err('indented deeper than the keys above');
      const m = lines[i].slice(at).match(/^([\w.-]+):(?:\s+(.*)|$)/);
      if (!m) err('expected key: value');
      if (Object.hasOwn(out, m[1])) err(`${m[1]} is given twice`);
      out[m[1]] = value(m[2] ?? '', at);
    }
    return out;
  };
  skip();
  if (i >= lines.length) return {};
  const out = block(0);
  skip();
  if (i < lines.length) err('unexpected text');
  return out;
}

// --- globs and scope ---------------------------------------------------------------------------

// A glob with * ? **; without one, the path itself or a folder of it.
export function globMatch(glob, path) {
  if (!/[*?]/.test(glob)) return path === glob.replace(/\/$/, '') || path.startsWith(`${glob.replace(/\/$/, '')}/`);
  const re = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/|\*\*|\*|\?/g, (m) => ({ '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*', '?': '[^/]' })[m]);
  return new RegExp(`^${re}$`).test(path);
}
const list = (v) => (v == null ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);
const within = (globs, path) => globs.some((g) => globMatch(g, path));

function normalize(rule) {
  const paths = list(rule.paths);
  return { ...rule, paths: paths.length ? paths : rule.kind === 'dependency' ? MANIFESTS : ['**'], except: list(rule.except), owners: list(rule.owners), allow: list(rule.allow) };
}

// --- the kinds ---------------------------------------------------------------------------------

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

// The modules a file imports: [{ spec, index }].
function imports(path, text) {
  const out = [];
  if (JS.test(path)) {
    const res = [/\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g];
    for (const re of res) for (const m of text.matchAll(re)) out.push({ spec: m[1], index: m.index });
  } else if (path.endsWith('.py')) {
    for (const m of text.matchAll(/^[ \t]*from[ \t]+([\w.]+)[ \t]+import\b/gm)) out.push({ spec: m[1], index: m.index, py: true });
    for (const m of text.matchAll(/^[ \t]*import[ \t]+([\w., \t]+)/gm)) {
      for (const part of m[1].split(',')) {
        const spec = part.trim().split(/\s+/)[0];
        if (spec) out.push({ spec, index: m.index, py: true });
      }
    }
  }
  return out;
}

function importHits(rule, path, text) {
  return imports(path, text).filter(({ spec, py }) => {
    if (rule.package) return spec === rule.package || spec.startsWith(`${rule.package}${py ? '.' : '/'}`);
    let target = spec;
    if (py) {
      const dots = spec.match(/^\.*/)[0].length;
      target = spec.slice(dots).replace(/\./g, '/');
      if (dots) target = posix.join(posix.dirname(path), '../'.repeat(dots - 1), target);
    } else if (spec.startsWith('.')) target = posix.join(posix.dirname(path), spec);
    const mod = rule.module.replace(/\/$/, '');
    return [mod, mod.replace(/\.[^./]+$/, '')].some((m) => target === m || target.startsWith(`${m}/`));
  });
}

// The dependencies a manifest names: [{ name, index }].
function dependencies(path, text) {
  if (posix.basename(path) === 'package.json') {
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      die(`${path}: not JSON`);
    }
    const names = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap((k) => Object.keys(json?.[k] ?? {}));
    return names.map((name) => ({ name, index: text.indexOf(`"${name}"`) }));
  }
  if (/\.txt$/.test(path)) {
    const out = [];
    for (const m of text.matchAll(/^[ \t]*([A-Za-z0-9][A-Za-z0-9._-]*)/gm)) out.push({ name: m[1], index: m.index, py: true });
    return out;
  }
  return [];
}
const pyName = (n) => n.toLowerCase().replace(/[-_.]+/g, '-');

function textHits(rule, text) {
  const out = [];
  if (rule.words != null) {
    const w = String(rule.words);
    for (let at = text.indexOf(w); at >= 0; at = text.indexOf(w, at + w.length)) out.push({ match: w, index: at });
  } else {
    for (const m of text.matchAll(new RegExp(rule.pattern, 'gm'))) if (m[0]) out.push({ match: m[0], index: m.index });
  }
  return out;
}

// A rule's findings in `files` ({ path: text }, or { list, read(path) }): [{ rule, file, line, match }].
export function findings(rule, files) {
  rule = normalize(rule);
  const src = typeof files.read === 'function' ? files : { list: Object.keys(files), read: (p) => files[p] };
  const out = [];
  for (const file of [...src.list].sort()) {
    if (!within(rule.paths, file) || within(rule.except, file)) continue;
    if (rule.kind === 'path') {
      out.push({ rule: rule.id, file, line: 1, match: file });
      continue;
    }
    if (rule.kind === 'import' && within(rule.owners, file)) continue;
    const text = src.read(file);
    if (text == null) continue;
    let hits = [];
    if (rule.kind === 'import') hits = importHits(rule, file, text).map((h) => ({ match: h.spec, index: h.index }));
    else if (rule.kind === 'text') hits = textHits(rule, text);
    else if (rule.kind === 'dependency') {
      hits = dependencies(file, text)
        .filter((d) => !rule.allow.some((a) => (d.py ? globMatch(pyName(a), pyName(d.name)) : globMatch(a, d.name))))
        .map((d) => ({ match: d.name, index: d.index }));
    }
    for (const h of hits.sort((a, b) => a.index - b.index)) out.push({ rule: rule.id, file, line: lineAt(text, h.index), match: h.match });
  }
  return out;
}

// --- the rules file ----------------------------------------------------------------------------

// The rules of a rules.yaml text, each checked; dies listing every problem.
export function loadRules(text, repo) {
  const doc = parseYaml(text ?? '');
  const rules = doc.rules ?? [];
  if (!Array.isArray(rules)) die(`${RULES}: rules: is a list`);
  const problems = [];
  const ids = new Set();
  for (const [n, r] of rules.entries()) {
    const id = r?.id ?? `rule ${n + 1}`;
    const bad = (msg) => problems.push(`${id}: ${msg}`);
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      bad('not a map');
      continue;
    }
    if (!/^[\w.-]+$/.test(r.id ?? '')) bad('id: letters, digits, . _ -');
    if (ids.has(r.id)) bad('id is used twice');
    ids.add(r.id);
    if (!r.decision) bad('no decision: a rule names the written decision it enforces (decision: <path>[#section])');
    else if (repo && !existsSync(`${repo}/${String(r.decision).split('#')[0]}`)) bad(`decision ${r.decision}: no such file`);
    if (!r.message) bad('no message');
    if (!Object.hasOwn(KINDS, r.kind)) {
      bad(`kind ${r.kind}: one of ${Object.keys(KINDS).join(', ')}`);
      continue;
    }
    for (const k of Object.keys(r)) if (!COMMON.includes(k) && !KINDS[r.kind].includes(k)) bad(`unknown field ${k}`);
    const one = (a, b) => (r[a] == null) === (r[b] == null) && bad(`one of ${a} or ${b}`);
    if (r.kind === 'import') one('package', 'module');
    if (r.kind === 'text') {
      one('words', 'pattern');
      if (r.pattern != null) {
        try {
          new RegExp(r.pattern);
        } catch (e) {
          bad(`pattern: ${e.message}`);
        }
      }
    }
    if (r.kind === 'dependency' && !list(r.allow).length) bad('allow: the dependencies the decision allows');
    if (r.kind === 'path' && !list(r.paths).length) bad('paths: the kind of file that may not be added');
    for (const ex of ['red', 'green']) {
      const e = r[ex];
      if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.file !== 'string') bad(`${ex}: { file, text }, the example the rule ${ex === 'red' ? 'catches' : 'passes'}`);
      else for (const k of Object.keys(e)) if (!['file', 'text'].includes(k)) bad(`${ex}: unknown field ${k}`);
    }
  }
  if (problems.length) die(`${RULES}:\n  ${problems.join('\n  ')}`);
  return rules.map(normalize);
}

export function parseBaseline(text) {
  if (text == null) return {};
  try {
    const b = JSON.parse(text);
    if (b && typeof b === 'object' && !Array.isArray(b) && Object.values(b).every(Array.isArray)) return b;
  } catch {
    // reported below
  }
  return die(`${BASELINE}: not { "<rule id>": [{ "file", "match" }] }`);
}

const key = (e) => `${e.file}\0${e.match}`;

// Findings beyond the baseline's count of each (file, match), and how many it covers.
export function judge(rules, baseline, files) {
  const beyond = [];
  let held = 0;
  let stale = 0;
  for (const rule of rules) {
    const left = new Map();
    for (const e of baseline[rule.id] ?? []) left.set(key(e), (left.get(key(e)) ?? 0) + 1);
    for (const f of findings(rule, files)) {
      const n = left.get(key(f)) ?? 0;
      if (n > 0) {
        left.set(key(f), n - 1);
        held++;
      } else beyond.push({ ...f, message: rule.message, decision: rule.decision });
    }
    for (const n of left.values()) stale += n;
  }
  return { beyond, held, stale };
}

// --- the command -------------------------------------------------------------------------------

const run = (repo, args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 256 << 20 });
const show = (repo, rev, path) => {
  const r = run(repo, ['show', `${rev}:${path}`]);
  return r.status === 0 ? r.stdout : null;
};
const readOr = (repo, path) => (existsSync(`${repo}/${path}`) ? readFileSync(`${repo}/${path}`, 'utf8') : null);

// The working tree's files (tracked and new, not ignored), less the rules' own files; read on demand.
function worktree(repo) {
  const r = run(repo, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  if (r.status !== 0) die(`git ls-files: ${r.stderr.trim()}`);
  const listed = [...new Set(r.stdout.split('\0').filter((p) => p && p !== RULES && p !== BASELINE))];
  return {
    list: listed,
    read(p) {
      try {
        if (statSync(`${repo}/${p}`).size > 2 << 20) return null;
        const t = readFileSync(`${repo}/${p}`, 'utf8');
        return t.includes('\0') ? null : t;
      } catch {
        return null; // deleted, or a folder (a submodule)
      }
    },
  };
}

const shown = (f) => `  ${f.rule}  ${f.file}:${f.line}  ${f.match}: ${f.message} (${f.decision})`;

function check(repo, flags) {
  const files = worktree(repo);
  const head = { label: 'this tree\'s rules', rules: readOr(repo, RULES), baseline: readOr(repo, BASELINE) };
  let judges = [head];
  if (flags.base) {
    if (run(repo, ['cat-file', '-e', `${flags.base}^{commit}`]).status !== 0) die(`--base ${flags.base}: no such commit here`);
    const base = { label: `the base ${/^[0-9a-f]{40}$/.test(flags.base) ? flags.base.slice(0, 12) : flags.base}'s rules`, rules: show(repo, flags.base, RULES), baseline: show(repo, flags.base, BASELINE) };
    const changed = [RULES, BASELINE].filter((p, n) => [base.rules, base.baseline][n] !== [head.rules, head.baseline][n]);
    if (changed.length) {
      console.log(`::warning::PROTECTED RULES CHANGE: ${changed.join(' ')}: judged by the base commit's copy and by this change's; the owner must read them before merging.`);
      judges = base.rules == null ? [head] : [base, head];
    } else judges = [base];
  }
  let failed = 0;
  for (const j of judges) {
    if (j.rules == null) {
      console.log(`${j.label}: no ${RULES}, nothing to check`);
      continue;
    }
    const { beyond, held, stale } = judge(loadRules(j.rules, repo), parseBaseline(j.baseline), files);
    console.log(`${j.label}: ${beyond.length} finding(s) beyond the baseline`);
    for (const f of beyond) console.log(shown(f));
    if (held) console.log(`  ${held} baselined finding(s) remain`);
    if (stale) console.log(`  ${stale} baseline entr(ies) no longer found: lc-rules baseline --prune`);
    failed += beyond.length;
  }
  return failed ? 1 : 0;
}

function selftest(repo) {
  const rules = loadRules(readOr(repo, RULES), repo);
  let failed = 0;
  const width = Math.max(0, ...rules.map((r) => r.id.length));
  for (const r of rules) {
    const on = (ex) => findings(r, { [r[ex].file]: r[ex].text ?? '' }).length;
    const red = on('red');
    const green = on('green');
    const why = !red ? 'red passes: the rule does not catch its own red example' : green ? `green fails: the rule flags its own green example (${green} finding(s))` : '';
    if (why) failed++;
    console.log(`  ${r.id.padEnd(width)}  ${why || 'red fails, green passes'}`);
  }
  console.log(failed ? `${failed} rule(s) fail their examples` : `${rules.length} rule(s) proved red and green`);
  return failed ? 1 : 0;
}

function baseline(repo, flags) {
  const rules = loadRules(readOr(repo, RULES), repo);
  const files = worktree(repo);
  const old = parseBaseline(readOr(repo, BASELINE));
  const entries = (r) => findings(r, files).map((f) => ({ file: f.file, match: f.match }));
  if (flags.prune) {
    for (const id of Object.keys(old)) {
      const rule = rules.find((r) => r.id === id);
      if (!rule) {
        delete old[id];
        console.log(`dropped ${id}: no such rule`);
        continue;
      }
      const left = new Map();
      for (const e of entries(rule)) left.set(key(e), (left.get(key(e)) ?? 0) + 1);
      const before = old[id].length;
      old[id] = old[id].filter((e) => {
        const n = left.get(key(e)) ?? 0;
        left.set(key(e), n - 1);
        return n > 0;
      });
      if (old[id].length < before) console.log(`${id}: ${before - old[id].length} fixed entr(ies) dropped`);
    }
  } else {
    for (const r of rules) {
      if (Object.hasOwn(old, r.id)) {
        console.log(`${r.id} is in the baseline already: it only shrinks (fix the code, or lc-rules baseline --prune)`);
        continue;
      }
      old[r.id] = entries(r);
      console.log(`added ${r.id}: ${old[r.id].length} finding(s)`);
    }
  }
  const sorted = Object.fromEntries(Object.keys(old).sort().map((id) => [id, old[id].sort((a, b) => key(a).localeCompare(key(b)))]));
  writeFileSync(`${repo}/${BASELINE}`, `${JSON.stringify(sorted, null, 2)}\n`);
  return 0;
}

export function main(argv, cwd = process.cwd()) {
  const [cmd, ...rest] = argv;
  const flags = {};
  for (let n = 0; n < rest.length; n++) {
    if (rest[n] === '--base') flags.base = rest[++n] ?? die('--base needs a commit');
    else if (rest[n] === '--prune') flags.prune = true;
    else die(`unknown argument ${rest[n]}`);
  }
  const r = run(cwd, ['rev-parse', '--show-toplevel']);
  if (r.status !== 0) die('not inside a git repository');
  const repo = r.stdout.trim();
  const commands = { check: () => check(repo, flags), selftest: () => selftest(repo), baseline: () => baseline(repo, flags) };
  if (!commands[cmd]) die('usage: lc-rules check [--base <sha>] | selftest | baseline [--prune]; see the top of rules/rules.mjs');
  return commands[cmd]();
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof RulesError)) throw err;
    console.error(`lc-rules: ${err.message}`);
    process.exitCode = 1;
  }
}
