---
name: pr-gate
description: Use when a pull request's work is committed and must pass its gate before it merges (`lc-gate run pr`), when doing one of its steps (self-review, live check, reviewer), or when a bug found live must be re-checked through the path that failed.
---

# PR gate

The steps are the project's `gate_pr:` block; `paths:` says which files make a step with `if <key>` apply. Run `lc-gate run pr <branch>` (no id: the current branch) and rerun it after each step until `lc-gate check pr <branch>` holds. The runner runs `command` steps and spawns `session` steps; a `here` step is yours. Below is how to do the steps a project usually declares, and what a PR needs besides its records.

## Plan from the tools

Where a step line in `gate_pr:` ends in `plan` (say `stack-fit: here docs/review/stack-fit.md plan`), the first act on the PR, before any code, is the plan. Read the project's list of chosen tools (the brief's **Stack fit**), open their documentation, and write one line per piece of work: "I will call `<function>` (`<docs page>`) for `<what>`". Only what no tool covers is your own code, with the reason. Record it before the first commit: `lc-gate record pr <branch> <step> plan --evidence <file>`; after the first commit it is refused. After coding, complete each line with the `file:line` of the call and record the step itself with that file. A branch that had commits before the gate saw it gets `plan na --reason …` from the orchestrator. Under `gate_pr_plan: enforce` the hook refuses an edit or a commit of a file the step applies to until the plan is recorded, and refuses `git commit --no-verify`; write the plan outside the repository or under `.agents/`, which the check ignores.

## Recording a `here` step

Write what you did and saw to `<handoff_dir>/gates/pr/<branch>/evidence/<step>.md`, then `lc-gate record pr <branch> <step> pass|fail --evidence <that file>`. A step that doesn't apply to this change still gets a record: tell the orchestrator, who records N/A with the reason. A new commit makes the records stale; rerun `lc-gate run pr` and redo what it lists.

## Self-review

Invoke `code-review` against the base, with the brief as the spec. Fix what it finds in scope; rewrite the rest into [finding.md](../lifecycle/finding.md) for the report. The evidence is the finding list and what you fixed.

## Live check

Exercise the changed flow once through the real thing. Where the project has its own verify skill (named in the step's argument or in `docs.testing`), invoke it: it knows how to start the stack, sign in and drive it.

1. Bring the stack up on your lane only (`lanes.up`). Without a lane, ask the orchestrator for one; never start a stack without one.
2. Drive the real flow: for UI, sign in, navigate and use the ordinary controls (`browser`); for a backend flow, the public API, CLI or event entry, followed through workers and storage. No mocked responses, no injected state.
3. Verify the observable result, that it persists after a reload, and the next dependent action. For a bug fix, the path that failed.
4. When it fails, invoke `diagnosing-bugs` and build a red loop on this flow before you change code.
5. Evidence: PASS / FAIL / BLOCKED / NOT TESTED with the commit, entry point, steps, result and elapsed time. Take the stack down and say the lane is free.

A change with no flow to show still needs evidence: for docs, every link resolves and each claim is true at the head; for tooling, CI or baselines, the check's output before and after; for code no one can reach yet, the spec that drives it, red before and green after.

## Reviewer (sensitive path)

A `session` step: the runner spawns an independent session that follows `review` with the project's checklist, never the implementer. Its findings go to the implementer, with a copy to the orchestrator. It records `fail` on a critical finding or a must-fix finding still open at the head. Commits after its PASS make that record stale, and the runner doesn't restart the review on its own: the orchestrator either reruns it on the new head (`lc-close <name>` on the old reviewer, then `lc-gate run pr <branch> --rerun <step>`: a new session that reads the commits since the last record), or carries the record with a reason.

## What the PR needs besides its records

- **Protected files** (`owner_approval`): their own PR, each hunk listed in the body; the owner approves before the merge.
- **Sensitive changes:** targeted tests for the affected invariants, red on the base and green on the head.
- **PR body:** invoke `pr`. Under Evidence, the live-check result and the red-then-green proof of each new test. Paste `lc-gate status pr <branch> --trailer` where the project asks for the stamp.
- **CI:** run `gate.run` with the intent in a file, then wait for the checks `ci.pr_checks` lists. An empty check list is not success.
- **Merge candidate:** the required checks pass with the PR applied to the current main (`merge.candidate`). The orchestrator merges.
