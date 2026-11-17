// A gate_pr step only the review pipeline's own result can satisfy, so the session that wrote the
// change can't record it: exit 0 only when the no-mistakes pipeline's latest run on this branch
// finished <step> at exactly the candidate. A project with another review pipeline replaces this
// script with one that asks that pipeline the same question. Node 18+, no dependencies.
// Install: copy to .agents/ci/pipeline-passed.mjs, and in gate_pr:
//   review: command node .agents/ci/pipeline-passed.mjs review after-gate
// lc-gate runs it at the candidate (LC_GATE_CANDIDATE); run by hand, it checks HEAD.
import { execFileSync } from 'node:child_process';

const [step] = process.argv.slice(2);
if (!/^[\w-]+$/.test(step ?? '')) {
  console.error('usage: node pipeline-passed.mjs <pipeline step, e.g. review or test>');
  process.exit(2);
}
const head = process.env.LC_GATE_CANDIDATE || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 10_000 }).trim();
// The pipeline's view of this branch's latest run; the timeout guards a hung daemon.
const status = execFileSync('no-mistakes', ['axi', 'status'], { encoding: 'utf8', timeout: 60_000 });
const run = /^run:\n((?: {2}.*\n?)*)/m.exec(status)?.[1];
const sha = run && /^ {2}head_sha: "?([0-9a-f]{40})"?$/m.exec(run)?.[1];
const state = run && new RegExp(`^ {4}${step},([a-z_]+),`, 'm').exec(run)?.[1];
const problem = !run
  ? 'the pipeline has no run on this branch'
  : sha !== head
    ? `the pipeline's latest run is at ${sha ?? '(no head_sha)'}, not the candidate ${head}`
    : state !== 'completed'
      ? `the pipeline's ${step} step is ${state ?? 'missing'} at ${head}`
      : '';
if (problem) {
  console.error(`pipeline-passed: ${problem}`);
  process.exit(1);
}
console.log(`pipeline-passed: the pipeline's ${step} step completed at ${head}`);
