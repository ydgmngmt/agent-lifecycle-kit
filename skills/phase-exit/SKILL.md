---
name: phase-exit
description: Use when a phase's PRs have all merged and the phase must be verified against its acceptance criteria, reviewed, accepted and closed, or when rerunning its steps after a fix. You are the lead running `lc-gate run phase`.
---

# Phase exit

The check of a phase's integrated result against its acceptance criteria. A PR's review sees one change; this one sees what the changes add up to. The steps are the project's `gate_phase:` block; the project's values for them (evidence commands, what the phase profile runs) are in `docs.phase_review`.

## Run it

1. **Freeze.** `START` is main before the phase's first merge. `CANDIDATE` is main after its last merge, with green push CI on it. Everything reads `CANDIDATE`, from a detached worktree.
2. `lc-gate run phase <id> --candidate <CANDIDATE> --base <START>`, where `<id>` is the phase's roadmap heading name in lower case with dashes, as on the board (`## Core journeys (current)` is `core-journeys`). Rerun it until every step has a record; `lc-gate status phase <id>` shows where each stands. The runner runs the commands, starts the workflows and spawns the review sessions; the `here` steps below are yours, and the `owner` step is a board question.
3. Record a `here` step with its evidence file in `<handoff_dir>/gates/phase/<id>/evidence/`: `lc-gate record phase <id> <step> pass|fail --evidence <file>`.
4. When every step holds, write the phase record: `lc-gate status phase <id> --write` (into `docs.phase_records`, shaped as [the phase record template](../../templates/phase-review.md)), and commit it. A phase is marked done by its roadmap heading (`(done)`, `(closed)` or `(exited)`) or a `**Status:** complete` line; CI's `lc-gate check phase --diff` refuses that mark unless the phase links a record whose `**Gate:** phase <id>` holds.

## Evidence per criterion

The regression run and the live "built as described" session decide the criteria. Each criterion gets PASS or FAIL with its trace (log, screenshot, network trace) and the commit SHA, in the phase's acceptance file.
- PASS only when a run or a session saw it pass at `CANDIDATE`.
- A criterion no step decided is NOT TESTED, never PASS.
- A step that needs a person or a live model is MANUAL, with what it needs; it is done by hand and its result written in the same table. Exit needs every MANUAL row decided.

## The `here` steps

- **Findings:** one list of every gate session's findings, the run failures and the live bugs. Read the cited lines of each and give it a disposition ([finding.md](../lifecycle/finding.md)). A failed acceptance criterion is blocking; other findings become follow-up PRs or issues, tracked in the roadmap. Each bug found live gets a regression check in its fix PR.
- **Fix and retest:** each blocking finding goes to a session (the PR's implementer if still running, otherwise a fresh one) and through the PR gate. The fixes make a new `CANDIDATE`, so every record goes stale: rerun the steps the fixes affect (`lc-gate run phase <id> --candidate <new>` reruns the commands and workflows, and `--rerun <step>,<step>` starts the review sessions to redo, once their old windows are closed with `lc-close <name>`), and carry the others with a reason a reader can check (`lc-gate record phase <id> <step> <its status> --carry --reason "<why the fix can't change it>"`). A carry keeps the old status and evidence, so it works only from PASS or N/A and takes no `--evidence`.
- **Lessons:** a finding seen in two or more PRs, and readable from a diff, becomes a proposed rule for `docs.review_checklist`; a rule that no longer catches anything is proposed for removal. The owner decides.

Only you, the lead, record N/A or a carry, each with its reason; both show in the phase record and on the board.

## Acceptance

A passed check is not acceptance. The `owner` step asks the owner on the board, with each of the phase's journeys and the exact steps to try it on a fresh stack. The owner's answer is the record: the next `lc-gate run phase <id>` records it, and nobody records this step by hand.

## Exit and close

- **Exit:** every step holds, every criterion passes, and the owner accepted. The next phase starts. Run `update-docs`.
- **Close:** later, when the follow-up PRs have merged and the steps they affect were rerun green. Mark the phase closed in the roadmap and the record then.
