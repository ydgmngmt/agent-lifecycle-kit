---
name: pr-gate
description: Use when a pull request's work is committed and must pass its gate before it merges (`lc-gate run pr`), when doing one of its steps (self-review, live check, reviewer), or when a bug found live must be re-checked through the path that failed.
---

# PR gate

The steps are the project's `gate_pr:` block, walked in file order; `paths:` says which files make an `if <key>` step apply. The runner runs `command` steps, reads the host's checks for a `checks` step and spawns `session` steps; a `here` step is yours.

## Order

1. `profiles.commit` green on the head.
2. Push, then `lc-pr open --title <t> --section "<Heading>=<file>"…`: the body from the template, refused while a required section is empty. `lc-pr section "<Heading>" --file <f>` changes one section later.
3. `lc-gate run pr <branch>` (no id: the current branch) until `lc-gate check pr <branch>` holds. A step with `after <step>` starts once those pass or are N/A, so the checks that cost no tokens come before the review session.

Once a review exists, main comes in by merge, never by rebase: a clean merge of main keeps every record but `checks`; a hand-resolved one is reviewed again, its resolved lines only.

## Plan from the tools

Where a `gate_pr:` step ends in `plan`, the plan comes before any code. From `docs.stack_tools`, the brief's **Stack fit** and each touched tool's docs (its **Look up** line), write one line per piece of work in the shapes the step's question file accepts: "I will call `<function>` (`<docs page>`) for `<what>`"; own code only where no tool covers it, with the reason. Write it outside the repository or under `.agents/`, and record it before the first commit: `lc-gate record pr <branch> <step> plan --evidence <file>` (refused after). Once coded, complete each line with the call's `file:line`, add a line for any mechanism the plan missed, and copy the lines under the PR body's `pr_body.heading` for CI's `pr-body` check. A branch with commits before the gate saw it gets `plan na --reason …` from the orchestrator. Under `gate_pr_plan: enforce` the hook refuses an edit or commit of a file the step covers until the plan is recorded, and refuses `git commit --no-verify`.

## A `here` step

Write what you did and saw to `<handoff_dir>/gates/pr/<branch>/evidence/<step>.md`, then `lc-gate record pr <branch> <step> pass|fail --evidence <that file>`. A step that doesn't apply gets N/A with a reason from the orchestrator. A new commit makes records stale: rerun `lc-gate run pr` and redo what it lists.

## Self-review

Your own check before the gate, never a gate step. `code-review` against the base, the brief as the spec. Fix what it finds in scope; rewrite the rest into [finding.md](../lifecycle/finding.md) for the report.

## Live check

A flow script the project keeps, run by a command; no session drives the browser on a passing PR.

1. **Author.** A change to a flow comes with its flow script, written or updated in the same PR with the project's browser test tool (`browser`): real sign-in, ordinary controls, the result asserted, asserted again after a reload, then the next dependent action. A backend flow goes through the public API, CLI or event entry. No mocked responses, no injected state. One script per journey, listed in the project's inventory: update the journey's script, never add a second. A new journey's script may start as a draft from the project's draft command, where it has one (`docs.testing`); the assertions are yours. Get it passing on your lane (`lanes.up`).
2. **Review.** The reviewer judges the script against the brief (the checklist's flow-script item).
3. **Gate.** The `live-check` command runs the scripts that cover the diff on the pushed commit, and fails on a flow path no script covers. Its output, and on a failure its trace, screenshot and logs, are the evidence. On a failure, `diagnosing-bugs` with a red loop on that script before changing code.

With no flow to show: for docs, every link resolves and each claim is true at the head; for tooling, CI or baselines, the output before and after; for unreachable code, its spec red before and green after.

## Reviewer

A `session` step with the project's checklist (`docs.review_checklist`) on every PR, by kind of diff, never the implementer; its brief names the PR's brief, which it judges the diff against. It records `fail` on a P1 or P2 finding. A follow-up review, after a fail or a pass, reads only the PR's own change since (`git log -p --first-parent --remerge-diff`): its commits and a merge's hand-resolved lines; after a merge of another branch, `git diff` since. After two reviews after a fix still failing, the orchestrator decides. A new head makes it stale unless only a clean merge of main came in: the orchestrator reruns it (`lc-close <name>`, then `lc-gate run pr <branch> --rerun <step>`) or carries it with a reason.

## Besides the records

- **Protected files** (`owner_approval`): their own PR, each hunk listed in the body; the owner approves before the merge.
- **Sensitive changes:** targeted tests for the affected invariants, red on the base and green on the head.
- **PR body:** `lc-pr` writes it; `pr` says what goes in it. Under Evidence, the live-check result and each new test's red-then-green proof; `lc-gate status pr <branch> --trailer` where the project asks.
- **Merge:** the orchestrator runs `lc-gate merge pr <branch>`: it updates a branch behind main, waits for the checks on the new head and requires every record. On a conflict you merge main by hand and push; the gate reviews the resolved lines.
