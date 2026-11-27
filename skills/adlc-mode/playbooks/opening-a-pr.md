### Opening a PR

Invoked at the end of every other playbook.

Work from a git worktree off the stage branch, and keep unrelated work out of it. Rebase into small, landable commits. Run deslop ([the vendored skill](../../../vendor/cursor-team-kit/deslop/SKILL.md)) over the diff before commit. Before each push, `profiles.commit` and `lc-rules check` exit 0 on the head you push.

Title: `type(scope): subject`, naming a real symbol when one carries the change. Body: a one-minute briefing under 40 lines with these `##` headings in order, dropping empty ones: `## Why`, `## What changed`, `## Scope`, `## Tradeoffs` (only rejected alternatives a reviewer would otherwise ask about), `## Blast Radius`, `## Verification`. Under `## Verification`, link what a reviewer can look at in place of the code: the flow script's screenshot or recording of the changed behaviour, the statechart where one was drawn, the proof or model-check output where one ran. Keep the files in the pull request's comments or `<handoff_dir>`, and link them. When the diff touches `paths.mechanism`, add the section `pr_body.heading` names (`## Tool fit`) last, in the line shapes of `pr_body.shapes`: CI's `pr-body` check reads it, and the stage exit's stack review reads past it.

Stack follow-ups by base branch. Open PRs ready, through the run's PR tool with `draft: false`. Without one, use `gh pr create --base <stage branch>` without `--draft`, or `origin pr create --status open` when Origin's CLI resolves the repository. Opening a PR does not start a babysit.
