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
- **Fix and retest:** each blocking finding goes through a session (the PR's implementer if still running, else a fresh one) and the PR gate. The fixes make a new `CANDIDATE` and every record stale: rerun the steps they affect (`lc-gate run phase <id> --candidate <new>`; `--rerun <step>,<step>` for review sessions, after `lc-close <name>` on the old windows), and carry the others with a reason a reader can check (`lc-gate record phase <id> <step> <status> --carry --reason "<why the fix can't change it>"`). A carry keeps the old status and evidence: only from PASS or N/A, without `--evidence`.
- **Lessons:** a finding seen in two or more PRs, readable from a diff, becomes a proposed `docs.review_checklist` item with its severity; when it can be decided exactly, a proposed rule in `.agents/rules.yaml` instead, naming the written principle it serves (none written: no rule). An item that no longer catches anything is proposed for removal; a sound rule is not trimmed. The owner decides.

Only you record N/A or a carry, each with its reason.

## Acceptance

A passed check is not acceptance. The `owner` step asks the owner on the board, with each journey and the exact steps to try it on a fresh stack. The next `lc-gate run phase <id>` records the answer; nobody records it by hand.

## Exit and close

- **Exit:** every step holds, every criterion passes, the owner accepted. Run `update-docs`; the next phase starts.
- **Close:** later, once the follow-up PRs merged and the steps they affect reran green. Mark the phase closed in the roadmap and the record.
