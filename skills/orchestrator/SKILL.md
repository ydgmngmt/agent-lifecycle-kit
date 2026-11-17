---
name: orchestrator
description: Use when you are the lead session of a phase (splitting it into briefs, starting sessions, answering questions, merging, running the watchdog and the running log), or when writing a brief that hands one change to an implementer session.
---

# Orchestrator (the lead)

Inputs: `.agents/project.yaml` (`sessions`, `handoff_dir`, `merge`, `owner_approval`, `protected_files`, `pinned_files`, `sensitive`, `lanes`, `gate_pr`, `gate_pr_mode`), `docs.roadmap`, `docs.orchestration`, `docs.code_map`.

1. **Plan.** The phase's acceptance criteria are agreed (`shape-product`) before any brief. Split the phase into briefs (below). Make a small change yourself, through the PR gate, when it needs no owner answer or approval and touches no sensitive path.
2. **Spawn** each brief as a full session in its own worktree and branch from main with `lc-spawn <name> <worktree> <brief-file>`, never a script of your own, so the board knows its brief and branch. It opens no terminal unless `sessions.open_tab` is set. If lc-spawn says a session waits on a prompt, answer it in that window. Start a piece once its independent part can begin. One lane per checkout.
3. **Questions.** Answer from the docs where they settle it; every other question goes on the board (`lc-board ask`, `board`). While the owner is present you may also ask interactively; never leave a question dialog open while the owner is away, it stops the watchdog and every relay. Wait with `lc-board answers --wait` in the background. Act on each answer, log it, set its outcome (`lc-board outcome`).
4. **Board.** At the phase start, `lc-board start`, give the owner its URL, and `lc-board keeper`. After a decision or a merge no PR shows, one setter or one line to the keeper. Never show a status nobody verified.
5. **Gates.** The implementer runs `lc-gate run pr <branch>`; the runner spawns its `session` steps, never the implementer. Only you record N/A or carry a record, each with a one-line reason a reader can check (`--reason`, `--carry --reason`). Log each reviewer approval for the owner.
6. **Merge** (`merge.command`) only when `lc-gate check pr <branch>` holds and the PR is a merge candidate: its required checks pass with it applied to current main (`merge.candidate`: a merge queue, else update the branch and wait for the checks on the new head). A PR touching `owner_approval` files waits for the owner's approval. Batch pinned-file changes into one PR you coordinate. Fast-forward local main after. Chain merges in one script call; never wait on a process pattern your own command line contains (`pgrep -f` matches itself).
7. **Watchdog.** At session start, schedule the [watchdog prompt](../../templates/watchdog-prompt.md) with the project's values as a recurring job; recreate it on restart. Each tick runs `lc-board status`, restarts a dead board with `lc-board start`, and sends the keeper `tick`. The watchdog only reports a usage-limit prompt.
8. **Update the docs** (`update-docs`) when the owner says so and at each phase exit, yourself or through one session.
9. **Running log:** one append-only file per phase in `handoff_dir`, one line per event, `- <date time>: <what changed>`; lines the owner must act on start with `FOR THE OWNER`.
10. **Owner reads:** open the PR or doc for the owner (`sessions.owner_read`), not only its name.
11. **Close** after the merge: `lc-close <name>`, take its stack down, remove the worktree, delete the local branch; keep the remote one.

## Briefs

1. **Scope** one small, mergeable change that leaves main working. Place its seam with `codebase-design` and each concept's owner from `docs.code_map`. A design question code can answer gets a throwaway `prototype` first.
2. **Owner:** the session that builds it, and whether it touches `sensitive` paths or `owner_approval` files.
3. **Order:** changes touching the same files run in sequence, the rest in parallel. Each brief names its shared files and who else edits them.
4. **Write it** with `writing-for-agents` and the [brief template](../../templates/brief.md). Link the docs; don't repeat them.
5. Add the change to the phase's table in `docs.roadmap`.

Done when every acceptance criterion is covered by a brief, and each brief names its owner.
