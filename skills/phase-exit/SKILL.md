---
name: phase-exit
description: Use when a phase's PRs have all merged and the phase must be verified against its acceptance criteria, reviewed, accepted and closed, or when rerunning its steps after a fix. You are the lead running `lc-gate run phase`.
---

# Phase exit

What a phase's PRs add up to, against its acceptance criteria. The steps are the project's `gate_phase:` block; their values (evidence commands, what the phase profile runs) are in `docs.phase_review`.

## Run it

1. **Freeze.** `START` is main before the phase's first merge; `CANDIDATE` is main after its last, with green push CI. Everything reads `CANDIDATE` from a detached worktree.
2. `lc-gate run phase <id> --candidate <CANDIDATE> --base <START>`; `<id>` is the roadmap heading's name in lower case with dashes (`## Core journeys (current)` is `core-journeys`). Rerun until every step has a record (`lc-gate status phase <id>`). The `here` steps are yours.
3. Record a `here` step with its evidence file in `<handoff_dir>/gates/phase/<id>/evidence/`: `lc-gate record phase <id> <step> pass|fail --evidence <file>`.
4. When every step holds: `lc-gate status phase <id> --write` (the record, into `docs.phase_records`), and commit it. The roadmap marks a phase done by its heading (`(done)`, `(closed)`, `(exited)`) or a `**Status:** complete` line; CI's `lc-gate check phase --diff` refuses the mark unless it links a record whose `**Gate:** phase <id>` holds.

## Evidence per criterion

The regression run and the "built as described" session decide the criteria. Each gets PASS or FAIL with its trace and the commit SHA in the phase's acceptance file: PASS only when a run or session saw it pass at `CANDIDATE`; a criterion nothing decided is NOT TESTED; one needing a person or live model is MANUAL, done by hand and written in the same table. Exit needs every MANUAL row decided.

## The `here` steps

- **Findings:** one list of every gate session's findings, run failures and live bugs. Read each cited line and give it a disposition ([finding.md](../lifecycle/finding.md)). A failed criterion is blocking; the rest become follow-up PRs or issues in the roadmap. Each live bug gets a regression check in its fix PR.
- **Fix and retest:** each blocking finding goes through a session (the PR's implementer if still running, else a fresh one) and the PR gate. The fixes make a new `CANDIDATE` and every record stale: carry first the steps they can't affect, with a reason a reader can check, then rerun the rest (`lc-gate run phase <id> --candidate <new> --wait`): a review session whose FAIL, or PASS at an ancestor, no longer holds starts its follow-up review by itself. Carry with `lc-gate record phase <id> <step> <status> --carry --reason "<why the fix can't change it>"`.
- **Lessons:** start from `lc-gate tally pr --since <phase start> --md` and `lc-gate tally phase --md`: per question, how often it applied and its P1 to P3 rows. A question that catches often and reads off a diff is proposed as an exact rule in `.agents/rules.yaml`, naming the written principle it serves (none written: no rule); a finding seen in two or more PRs that no rule can decide becomes a proposed `docs.review_checklist` item with its severity. A question that caught nothing is proposed for removal; a sound rule is not trimmed. Each P1 or P2 a phase session finds names the PR whose review passed it. The owner decides.

## Acceptance

A passed check is not acceptance. The `owner` step asks the owner on the board, with each journey and the exact steps to try it on a fresh stack. The next `lc-gate run phase <id>` records the answer; nobody records it by hand. In a scratch or dry run you record it N/A with a reason, and the record says acceptance was not given.

## Exit and close

- **Exit:** every step holds, every criterion passes, the owner accepted. Run `update-docs`; the next phase starts.
- **Close:** later, once the follow-up PRs merged and the steps they affect reran green. Mark the phase closed in the roadmap and the record.
