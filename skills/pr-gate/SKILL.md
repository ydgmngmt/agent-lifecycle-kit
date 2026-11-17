---
name: pr-gate
description: Use when a pull request's work is committed and must pass its gate before it merges (`lc-gate run pr`), when doing one of its steps (self-review, live check, reviewer), or when a bug found live must be re-checked through the path that failed.
---

# PR gate

The steps are the project's `gate_pr:` block; `paths:` says which files make an `if <key>` step apply. Run `lc-gate run pr <branch>` (no id: the current branch) after each step until `lc-gate check pr <branch>` holds. The runner runs `command` steps and spawns `session` steps; a `here` step is yours. Only the runner records a `command` step's pass (`--rerun <step>` runs it again), and only the session spawned for a `session` step records its pass.

## Plan from the tools

Where a `gate_pr:` step ends in `plan`, the plan comes before any code. From `docs.stack_tools`, the brief's **Stack fit** and each touched tool's docs (its **Look up** line), write one line per piece of work in the shapes the step's question file accepts: "I will call `<function>` (`<docs page>`) for `<what>`"; own code only where no tool covers it, with the reason. Write it outside the repository or under `.agents/`, and record it before the first commit: `lc-gate record pr <branch> <step> plan --evidence <file>` (refused after). Once coded, complete each line with the call's `file:line`, add a line for any mechanism the plan missed, and copy the lines under the PR body's `pr_body.heading` for CI's `pr-body` check. A branch with commits before the gate saw it gets `plan na --reason …` from the orchestrator. Under `gate_pr_plan: enforce` the hook refuses an edit or commit of a file the step covers until the plan is recorded, and refuses `git commit --no-verify`.

## Steps after the review pipeline

A step ending in `after-gate` holds only once the review pipeline has reviewed this head. `check` and the gate-start hook skip it: once `check` holds, start the pipeline, then rerun `lc-gate run pr <branch>`. The merge hook and `status --trailer` require it.

## A `here` step

Write what you did and saw to `<handoff_dir>/gates/pr/<branch>/evidence/<step>.md`, then `lc-gate record pr <branch> <step> pass|fail --evidence <that file>`. A step that doesn't apply gets N/A with a reason from the orchestrator. A new commit makes records stale: rerun `lc-gate run pr` and redo what it lists.

## Self-review

Your own check before the gate, never a gate step. `code-review` against the base, the brief as the spec. Fix what it finds in scope; rewrite the rest into [finding.md](../lifecycle/finding.md) for the report.

## Live check

Exercise the changed flow once through the real thing, with the project's verify skill where it has one (the step's argument or `docs.testing`).

1. Bring the stack up on your lane only (`lanes.up`); without a lane, ask the orchestrator.
2. Drive the real flow: for UI, sign in and use the ordinary controls (`browser`); for a backend flow, the public API, CLI or event entry, through workers and storage. No mocked responses, no injected state.
3. Verify the result, that it persists after a reload, and the next dependent action; for a bug fix, the path that failed. On failure, `diagnosing-bugs` with a red loop on this flow before changing code.
4. Evidence: PASS / FAIL / BLOCKED / NOT TESTED with the commit, entry point, steps, result and time. Take the stack down; say the lane is free.

With no flow to show: for docs, every link resolves and each claim is true at the head; for tooling, CI or baselines, the output before and after; for unreachable code, its spec red before and green after.

## Reviewer

A `session` step with the project's checklist (`docs.review_checklist`) on every PR, by kind of diff, never the implementer. It records `fail` on a must-fix finding. Commits after its pass make it stale: the orchestrator reruns it (`lc-close <name>`, then `lc-gate run pr <branch> --rerun <step>`) or carries it with a reason.

## Besides the records

- **Protected files** (`owner_approval`): their own PR, each hunk listed in the body; the owner approves before the merge.
- **Sensitive changes:** targeted tests for the affected invariants, red on the base and green on the head.
- **PR body:** invoke `pr`. Under Evidence, the live-check result and each new test's red-then-green proof; `lc-gate status pr <branch> --trailer` where the project asks.
- **CI:** run `gate.run` with the intent in a file, then wait for `ci.pr_checks`. An empty list is not success.
- **Merge candidate:** the required checks pass with the PR applied to current main (`merge.candidate`). The orchestrator merges.
