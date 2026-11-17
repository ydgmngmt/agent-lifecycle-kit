// The PR body check: a pull request whose diff touches paths.<pr_body.if> carries a record in its
// body, under the heading pr_body.heading: lines in the shapes listed in the fenced block under the
// heading pr_body.shapes points at (`file#heading-slug`). In a shape, `<…>` stands for any text.
// The project file and the shapes file are read at the base commit, so a pull request can't loosen
// them (from-base.sh runs the base's copy of this script). Node 20+, no dependencies besides the kit.
// Install: copy to .agents/ci/pr-body-check.mjs; templates/ci/pr-body.yml runs it on every body edit.
//   GITHUB_EVENT_PATH=<pull_request payload> node pr-body-check.mjs <kit checkout> <base sha> <head sha>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', timeout: 60_000 });
// A file at the base, else at the head (only the pull request that adds it meets that).
const show = (base, head, path) => {
  for (const rev of [base, head]) {
    try {
      return git('show', `${rev}:${path}`);
    } catch {
      // not at this commit
    }
  }
  return null;
};
const slug = (heading) => heading.replace(/^#+\s*/, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The shapes: each line of the first fenced block under the heading whose slug is `anchor`.
export function shapes(text, anchor) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => /^#{1,6}\s/.test(l) && slug(l) === anchor);
  if (at < 0) return [];
  const open = lines.findIndex((l, i) => i > at && /^\s*```/.test(l));
  if (open < 0) return [];
  const close = lines.findIndex((l, i) => i > open && /^\s*```/.test(l));
  return lines.slice(open + 1, close < 0 ? undefined : close).map((l) => l.trim()).filter(Boolean);
}

const shapeRe = (shape) => new RegExp(`^${shape.split(/<[^>]+>/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+')}$`);

// The section's problem, or '' when it holds the record. The section is the block of lines under
// the heading: a blank line after its first line, or another heading, ends it.
export function sectionProblem(body, heading, accepted) {
  const lines = body.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l.trim()) && l.trim().replace(/^#+\s*/, '') === heading);
  if (start < 0) return `the PR body has no \`## ${heading}\` section`;
  const section = [];
  for (const l of lines.slice(start + 1).map((x) => x.trim())) {
    if (/^#{1,6}\s/.test(l)) break;
    if (l) section.push(l);
    else if (section.length) break;
  }
  if (!section.length) return `the \`## ${heading}\` section is empty`;
  const res = accepted.map(shapeRe);
  const bad = section.filter((l) => !res.some((re) => re.test(l)));
  return bad.length ? `these lines of \`## ${heading}\` are in none of the accepted shapes:\n  ${bad.join('\n  ')}` : '';
}

async function main([kit, base, head]) {
  if (!kit || !base || !head || !process.env.GITHUB_EVENT_PATH) {
    console.error('usage: GITHUB_EVENT_PATH=<payload> node pr-body-check.mjs <kit> <base> <head>');
    return 2;
  }
  const { parseProject } = await import(pathToFileURL(resolve(kit, 'board/config.mjs')).href);
  const { globRe } = await import(pathToFileURL(resolve(kit, 'gate/gate.mjs')).href);
  const conf = parseProject(show(base, head, '.agents/project.yaml') ?? '');
  const heading = conf['pr_body.heading'];
  const key = conf['pr_body.if'];
  const [file, anchor] = (conf['pr_body.shapes'] ?? '').split('#');
  if (!heading || !file || !anchor) {
    console.error('pr-body: set pr_body.heading and pr_body.shapes (file#heading) in .agents/project.yaml');
    return 2;
  }
  const accepted = shapes(show(base, head, file) ?? '', anchor);
  if (!accepted.length) {
    console.error(`pr-body: no fenced block of accepted lines under #${anchor} in ${file}`);
    return 2;
  }
  let touched = git('diff', '--name-only', `${base}...${head}`).split('\n').filter(Boolean);
  if (key) {
    const globs = (conf[`paths.${key}`] ?? '').split(/[\s,]+/).filter(Boolean).map(globRe);
    if (!globs.length) {
      console.error(`pr-body: pr_body.if names paths.${key}, which the project file does not have`);
      return 2;
    }
    touched = touched.filter((f) => globs.some((re) => re.test(f)));
    if (!touched.length) {
      console.log(`pr-body: the diff touches no paths.${key} file; no record needed`);
      return 0;
    }
  }
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const problem = sectionProblem(event.pull_request?.body ?? '', heading, accepted);
  if (!problem) {
    console.log(`pr-body: the PR body carries its ${heading} section`);
    return 0;
  }
  console.error(`pr-body: ${problem}\nThe diff touches ${touched.slice(0, 5).join(', ')}${touched.length > 5 ? ', …' : ''}.\nAccepted lines (${file}#${anchor}):\n  ${accepted.join('\n  ')}\nEdit the body; this check reruns on the edit.`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
