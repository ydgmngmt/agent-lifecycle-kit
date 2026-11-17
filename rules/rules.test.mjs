// lc-rules: the project's mechanical rules, each proved on its red and green example, checked against
// a baseline that only shrinks, judged by the base commit's copy. Run: node --test rules/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findings, parseYaml } from './rules.mjs';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const CLI = join(KIT, 'bin/lc-rules');

function repo(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lc-rules-'));
  const sh = (cmd) => {
    const r = spawnSync('bash', ['-c', cmd], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const write = (more) => {
    for (const [p, text] of Object.entries(more)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), text);
    }
  };
  sh('git init -q -b main && git config user.name t && git config user.email t@t');
  write({ 'docs/decisions/http.md': '# fetch only\n', ...files });
  sh('git add -A && git commit -qm one');
  const lc = (...args) => spawnSync(CLI, args, { cwd: dir, encoding: 'utf8' });
  return { dir, sh, write, lc, read: (p) => readFileSync(join(dir, p), 'utf8') };
}

const AXIOS = `rules:
  - id: no-axios
    decision: docs/decisions/http.md
    message: Use the fetch wrapper in src/http.
    kind: import
    package: axios
    owners: [src/http/]
    red:
      file: src/app/a.ts
      text: |
        import axios from 'axios';
    green:
      file: src/http/client.ts
      text: |
        import axios from 'axios';
`;

test('parseYaml: maps, lists of maps, inline lists, quotes, block scalars, comments', () => {
  const y = parseYaml(`# top
rules:
  - id: a   # note
    paths: [src/, "lib/x y", 'it''s']
    list:
      - one
      - "two # not a comment"
    red:
      file: a.ts
      text: |
        line 1

        line 3
    green:
      text: |-
        kept
  - id: b
empty:
`);
  assert.deepEqual(y, {
    rules: [
      { id: 'a', paths: ['src/', 'lib/x y', "it's"], list: ['one', 'two # not a comment'], red: { file: 'a.ts', text: 'line 1\n\nline 3\n' }, green: { text: 'kept' } },
      { id: 'b' },
    ],
    empty: null,
  });
  assert.throws(() => parseYaml('a: 1\na: 2\n'), /line 2: a is given twice/);
  assert.throws(() => parseYaml('a:\n   - x\n  b: 1\n'), /line 3/);
});

test('import: a package or a path imported outside its owners, in JS and Python', () => {
  const pkg = { id: 'r', kind: 'import', package: 'axios', owners: ['src/http/'], paths: ['**'], except: [] };
  const files = {
    'src/a.ts': "import axios from 'axios';\nimport { get } from \"axios/lib/x\";\nconst y = require('axios');\nimport('axios');\nimport 'axiosish';\n",
    'src/b.ts': "import {\n  a,\n} from 'axios';\n",
    'src/http/c.ts': "import axios from 'axios';\n",
    'README.md': "import axios from 'axios'\n",
  };
  const got = findings(pkg, files).map((f) => `${f.file}:${f.line} ${f.match}`);
  assert.deepEqual(got, ['src/a.ts:1 axios', 'src/a.ts:2 axios/lib/x', 'src/a.ts:3 axios', 'src/a.ts:4 axios', 'src/b.ts:1 axios']);
  const mod = { id: 'r', kind: 'import', module: 'src/db', owners: ['src/db/', 'src/repo/'], paths: ['**'], except: [] };
  const got2 = findings(mod, {
    'src/ui/a.ts': "import { q } from '../db/query';\nimport x from '../dbx';\n",
    'src/repo/b.ts': "import { q } from '../db';\n",
    'app/views.py': 'from src.db.query import q\nimport os, src.db as d\nfrom .local import z\n',
  }).map((f) => `${f.file}:${f.line} ${f.match}`);
  assert.deepEqual(got2, ['app/views.py:1 src.db.query', 'app/views.py:2 src.db', 'src/ui/a.ts:1 ../db/query']);
});

test('dependency, text and path kinds', () => {
  const dep = { id: 'd', kind: 'dependency', allow: ['react', '@types/*', 'requests'], paths: ['**/package.json', '**/requirements*.txt'], except: [] };
  const got = findings(dep, {
    'package.json': JSON.stringify({ dependencies: { react: '1', lodash: '4' }, devDependencies: { '@types/node': '1', jest: '1' } }, null, 2),
    'api/requirements.txt': '# pinned\nrequests==2.0\nFlask>=3  # web\n-r base.txt\n',
  }).map((f) => `${f.file}:${f.line} ${f.match}`);
  assert.deepEqual(got, ['api/requirements.txt:3 Flask', 'package.json:4 lodash', 'package.json:8 jest']);
  const text = { id: 't', kind: 'text', pattern: 'console\\.log\\(', paths: ['src/**'], except: ['src/dev/**'] };
  assert.deepEqual(findings(text, { 'src/a.ts': 'x\nconsole.log(1); console.log(2)\n', 'src/dev/b.ts': 'console.log(1)\n', 'c.ts': 'console.log(1)\n' }).map((f) => `${f.file}:${f.line}`), ['src/a.ts:2', 'src/a.ts:2']);
  const words = { id: 'w', kind: 'text', words: 'TODO', paths: ['**'], except: [] };
  assert.equal(findings(words, { 'a.md': 'a TODO\n' })[0].match, 'TODO');
  const path = { id: 'p', kind: 'path', paths: ['**/*.sql'], except: ['db/migrations/**'] };
  assert.deepEqual(findings(path, { 'db/migrations/1.sql': '', 'src/q.sql': '', 'q.sql': '', 'a.ts': '' }).map((f) => f.file), ['q.sql', 'src/q.sql']);
});

test('selftest proves each rule fails its red and passes its green, and names a rule that does not', () => {
  const r = repo({ '.agents/rules.yaml': AXIOS });
  const ok = r.lc('selftest');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /no-axios\s+red fails, green passes/);
  r.write({ '.agents/rules.yaml': AXIOS.replace("file: src/app/a.ts", 'file: src/http/a.ts') });
  const bad = r.lc('selftest');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /no-axios\s+red passes: the rule does not catch its own red example/);
});

test('check refuses a rule without a decision, or one whose decision file is missing, or an unknown field', () => {
  const r = repo({ '.agents/rules.yaml': AXIOS.replace('    decision: docs/decisions/http.md\n', '') });
  const none = r.lc('check');
  assert.equal(none.status, 1);
  assert.match(none.stderr, /no-axios: no decision: a rule names the written decision it enforces/);
  r.write({ '.agents/rules.yaml': AXIOS.replace('http.md', 'gone.md') });
  assert.match(r.lc('check').stderr, /no-axios: decision docs\/decisions\/gone\.md: no such file/);
  r.write({ '.agents/rules.yaml': AXIOS.replace('    package: axios\n', '    package: axios\n    pakage: x\n') });
  assert.match(r.lc('check').stderr, /no-axios: unknown field pakage/);
  r.write({ '.agents/rules.yaml': AXIOS.replace('kind: import', 'kind: imports') });
  assert.match(r.lc('check').stderr, /no-axios: kind imports: one of import, dependency, text, path/);
});

test('check: findings beyond the baseline fail; baseline adds only rules it has not seen; --prune only shrinks', () => {
  const r = repo({ '.agents/rules.yaml': AXIOS, 'src/a.ts': "import axios from 'axios';\n", 'src/http/c.ts': "import axios from 'axios';\n" });
  const first = r.lc('check');
  assert.equal(first.status, 1);
  assert.match(first.stdout, /no-axios\s+src\/a\.ts:1\s+axios: Use the fetch wrapper in src\/http\. \(docs\/decisions\/http\.md\)/);
  assert.equal(r.lc('baseline').status, 0);
  assert.deepEqual(JSON.parse(r.read('.agents/rules-baseline.json')), { 'no-axios': [{ file: 'src/a.ts', match: 'axios' }] });
  const held = r.lc('check');
  assert.equal(held.status, 0, held.stdout + held.stderr);
  assert.match(held.stdout, /1 baselined finding\(s\) remain/);
  // A second one in the same file is beyond the baseline, and baseline won't take it.
  r.write({ 'src/a.ts': "import axios from 'axios';\nimport b from 'axios';\n" });
  assert.equal(r.lc('check').status, 1);
  assert.match(r.lc('baseline').stdout, /no-axios is in the baseline already: it only shrinks/);
  assert.equal(r.lc('check').status, 1);
  // A new rule's findings go in once; fixing the old one and pruning shrinks the file.
  r.write({ '.agents/rules.yaml': `${AXIOS}  - id: no-todo
    decision: docs/decisions/http.md
    message: No TODO in src.
    kind: text
    words: TODO
    paths: [src/]
    red: { file: src/x.ts, text: "// TODO" }
    green: { file: src/x.ts, text: "// done" }
`, 'src/t.ts': '// TODO\n', 'src/a.ts': '\n' });
  assert.equal(r.lc('baseline').status, 0);
  assert.deepEqual(JSON.parse(r.read('.agents/rules-baseline.json')), { 'no-axios': [{ file: 'src/a.ts', match: 'axios' }], 'no-todo': [{ file: 'src/t.ts', match: 'TODO' }] });
  r.write({ 'src/b.ts': "import axios from 'axios';\n" });
  const pruned = r.lc('baseline', '--prune');
  assert.equal(pruned.status, 0, pruned.stderr);
  assert.deepEqual(JSON.parse(r.read('.agents/rules-baseline.json')), { 'no-axios': [], 'no-todo': [{ file: 'src/t.ts', match: 'TODO' }] });
  assert.equal(r.lc('check').status, 1);
});

test('check --base: the base commit\'s rules and baseline judge; a change to them is said loudly and judged by both', () => {
  const r = repo({ '.agents/rules.yaml': AXIOS, '.agents/rules-baseline.json': '{"no-axios": []}\n' });
  const base = r.sh('git rev-parse HEAD');
  // The PR drops the rule and adds an import it forbade: the base's copy still judges it.
  r.write({ '.agents/rules.yaml': 'rules:\n', 'src/a.ts': "import axios from 'axios';\n" });
  r.sh('git add -A && git commit -qm two');
  const weak = r.lc('check', '--base', base);
  assert.equal(weak.status, 1);
  assert.match(weak.stdout, /PROTECTED RULES CHANGE: \.agents\/rules\.yaml/);
  assert.match(weak.stdout, /no-axios\s+src\/a\.ts:1/);
  // A baseline grown in the PR doesn't help either.
  r.write({ '.agents/rules.yaml': AXIOS, '.agents/rules-baseline.json': '{"no-axios": [{"file": "src/a.ts", "match": "axios"}]}\n' });
  r.sh('git add -A && git commit -qm three');
  assert.equal(r.lc('check', '--base', base).status, 1);
  // A PR adding a rule is judged by it too.
  r.write({ '.agents/rules-baseline.json': '{"no-axios": []}\n', 'src/a.ts': '// TODO\n', '.agents/rules.yaml': `${AXIOS}  - id: no-todo
    decision: docs/decisions/http.md
    message: No TODO.
    kind: text
    words: TODO
    red: { file: x.ts, text: TODO }
    green: { file: x.ts, text: done }
` });
  r.sh('git add -A && git commit -qm four');
  const added = r.lc('check', '--base', base);
  assert.equal(added.status, 1);
  assert.match(added.stdout, /no-todo\s+src\/a\.ts:1/);
  // Unchanged rules: no loud line.
  r.write({ 'src/a.ts': '\n' });
  r.sh('git add -A && git commit -qm five');
  const head = r.sh('git rev-parse HEAD');
  const quiet = r.lc('check', '--base', head);
  assert.equal(quiet.status, 0, quiet.stdout + quiet.stderr);
  assert.doesNotMatch(quiet.stdout, /PROTECTED/);
});

test('the template\'s starter rules, uncommented, pass their own selftest', () => {
  const tpl = readFileSync(join(KIT, 'templates/rules.yaml'), 'utf8');
  assert.deepEqual(parseYaml(tpl), { rules: null });
  const live = tpl.replace(/^# ( {2}.*)$/gm, '$1');
  const decisions = [...live.matchAll(/decision: (\S+)/g)].map((m) => m[1]);
  assert.equal(decisions.length, 3);
  const r = repo({ '.agents/rules.yaml': live, ...Object.fromEntries(decisions.map((d) => [d.split('#')[0], '# d\n'])) });
  const out = r.lc('selftest');
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.equal(out.stdout.match(/red fails, green passes/g).length, 3);
});
