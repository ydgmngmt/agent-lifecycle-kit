---
name: stage-exit
description: Use when a stage's pull requests have all merged into its stage branch and the stage must be checked as a whole and merged into the default branch, or when rerunning its steps after a fix. You are the lead running `lc-gate run pr <stage branch>`.
---

# Stage exit

What a stage's pull requests add up to, before any of it reaches the default branch. The steps are the project's `gate_pr:` block: scripts first, then three review sessions on the whole stage diff. The gate is the kit's own; the reviews are the Thermos plugin's two audits, by its bar, and the kit's stack hunt.

## Run it

1. **Ready.** Every pull request of the plan has merged into the stage branch with a verdict that covers what landed. Open the stage's pull request: `gh pr create --base <default branch> --head <stage branch>`, the body per `adlc-mode`'s Opening a PR, with each acceptance criterion and the flow script that decides it under `## Verification`.
2. **Walk.** `lc-gate run pr <stage branch> --wait` until `lc-gate check pr <stage branch>` holds; it returns when a step changes. The checks that cost no model tokens run first: the host's checks, the rules, the regression and integration runs, and `acceptance`, which fails on a criterion no flow script names (`lc-criteria`) and on any flow script that fails. The review sessions start once the host's checks and `acceptance` pass.
3. **Read** each findings file, and the cited lines of every finding, before deciding anything.

## Findings

A session's step fails on a P1 or P2 ([finding.md](../lifecycle/finding.md)). The Thermos question files map its bar onto those: its high and medium findings, and each of its presumptive blockers that nobody justified.

- **A blocking finding** goes back to the build: a fix pull request into the stage branch, by the owner session that built the code if it still runs, else a fresh one, through `adlc-mode` (Bug fix), verified by the playbook's sizing rule. The new head makes the session records stale, and each follow-up review starts by itself and reads only the change since.
- **A presumptive blocker the builder can justify:** the justification goes on the stage pull request as a comment, in one or two lines a reader can check. Then `lc-gate run pr <stage branch> --rerun <step> --lead --reason "<the justification>"`. The session decides; you never record its pass.
- **Everything else** (P3) is fixed where it is a few lines, else it becomes a follow-up in the roadmap. It never holds the stage.
- A P1 is fixed, or accepted by the owner on the board, before anything else.

After `sessions.gate_rounds` (2) follow-up reviews of one step ended in FAIL, no further one starts: read the fix yourself, then start one more with `--rerun <step> --lead --reason "…"`. Only you record N/A or carry a record, each with a reason a reader can check.

## Merge

`lc-gate merge pr <stage branch>`: it updates a branch behind the default branch, waits for the checks on the new head, requires every record and merges exactly that head. Nothing else merges into the default branch; the hook refuses `gh pr merge` and `git merge` there without the records.

## After the exit

None of this holds the stage or starts a review again.

- Mark the stage done in `docs.roadmap`, with the merge commit.
- **Docs sweep** (`update-docs`): its own docs-only pull request into the default branch. The gate's `if code` steps are N/A for it.
- **Verification upkeep:** pstack's **maintain-verification-skill** when the stage changed how the app is launched or driven, and **maintain-formal-verification-skill** when it touched code a formal check covers. Each in its own change.
- **Lessons:** `lc-gate tally pr --since <stage start> --md`. A finding the reviews raised in two or more stages, that a diff can decide exactly, is proposed as a rule in `.agents/rules.yaml` (pstack's **correct** skill has the order: structure before prose). Each P1 or P2 names the pull request whose swarm passed it. The owner decides.
- Close the sessions, remove the worktrees, delete the stage branch.
