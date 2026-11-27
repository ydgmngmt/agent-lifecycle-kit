// lc-pstack: the kit's tie to the pstack plugin it builds on. Node 18+, no dependencies.
//
//   lc-pstack path    the installed pstack plugin's folder (LC_PSTACK_DIR overrides it)
//   lc-pstack check   exit 1 unless the installed pstack is the version pstack.lock pins, each forked
//                     file's upstream is still what the fork started from (skills/adlc-mode/upstream/),
//                     and each vendored file equals the marketplace's copy
//   lc-pstack diff    for each forked or vendored file whose upstream moved: diff -u old new
//
// pstack.lock (the kit's root) names the pin, the forked files and the vendored ones. To take a new
// pstack: update the plugin, run `lc-pstack diff`, carry each change into the fork by hand, copy the
// new upstream over upstream/ and the vendored files, set the pin.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const kit = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plugins = process.env.LC_CLAUDE_PLUGINS || join(homedir(), '.claude/plugins');
const die = (msg) => {
  console.error(`lc-pstack: ${msg}`);
  process.exit(1);
};
const lock = () => JSON.parse(readFileSync(join(kit, 'pstack.lock'), 'utf8'));

function installed(l) {
  if (process.env.LC_PSTACK_DIR) return { installPath: resolve(process.env.LC_PSTACK_DIR), version: null };
  const file = join(plugins, 'installed_plugins.json');
  if (!existsSync(file)) die(`${file} not found: install the plugin ${l.pstack.plugin} in Claude Code, or set LC_PSTACK_DIR`);
  const found = (JSON.parse(readFileSync(file, 'utf8')).plugins?.[l.pstack.plugin] ?? []).filter((p) => existsSync(p.installPath));
  if (!found.length) die(`${l.pstack.plugin} is not installed: /plugin install ${l.pstack.plugin}`);
  return found.find((p) => p.version === l.pstack.version) ?? found[0];
}

// Each tracked file as { name, old, now }: the copy the kit holds and where upstream has it now.
function tracked(l, at) {
  const market = join(plugins, 'marketplaces', l.marketplace);
  return [
    ...l.forked.map((f) => ({ name: f.kit, old: join(kit, f.pristine), now: join(at.installPath, f.upstream) })),
    ...l.vendored.map((v) => ({ name: v.kit, old: join(kit, v.kit), now: join(market, v.upstream), optional: !existsSync(market) })),
  ];
}

const moved = (t) => !existsSync(t.now) || readFileSync(t.old, 'utf8') !== readFileSync(t.now, 'utf8');

const [cmd] = process.argv.slice(2);
const l = lock();
if (cmd === 'path') {
  console.log(installed(l).installPath);
} else if (cmd === 'check' || cmd === 'diff') {
  const at = installed(l);
  const problems = [];
  if (at.version && at.version !== l.pstack.version) problems.push(`installed pstack is ${at.version}, pstack.lock pins ${l.pstack.version}`);
  const changed = tracked(l, at).filter((t) => !t.optional && moved(t));
  for (const t of changed) problems.push(`upstream of ${t.name} moved: ${existsSync(t.now) ? t.now : `${t.now} is gone`}`);
  if (cmd === 'diff') {
    for (const t of changed) if (existsSync(t.now)) process.stdout.write(spawnSync('diff', ['-u', t.old, t.now], { encoding: 'utf8' }).stdout);
    if (!changed.length) console.log('no forked or vendored file moved upstream');
  } else if (problems.length) {
    console.error(`lc-pstack: ${problems.join('\n  ')}\nRun lc-pstack diff, carry the changes into the fork, then update pstack.lock.`);
    process.exit(1);
  } else {
    console.log(`pstack ${at.version ?? '(LC_PSTACK_DIR)'} at ${at.installPath}: ${l.forked.length} forked and ${l.vendored.length} vendored files match upstream`);
  }
} else {
  die('usage: lc-pstack path | check | diff');
}
