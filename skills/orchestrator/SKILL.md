---
name: orchestrator
description: Use when you are the orchestrating session of a phase, which starts sessions, briefs them, routes reviews, merges, runs the watchdog and keeps the running log.
---

# Orchestrator

Inputs: `.agents/project.yaml` (`sessions`, `handoff_dir`, `merge`, `owner_approval`, `protected_files`, `pinned_files`, `sensitive`, `lanes`), `docs.roadmap`, `docs.orchestration`.

1. **Plan.** Agree the phase's criteria with `phase-acceptance` before any brief, then split it with `agent-brief`. Make small changes yourself, straight to the gate, when they need no owner answer, no owner approval and no sensitive path.
2. **Spawn.** Start each piece as a full session in its own worktree and branch from main: `lc-spawn <name> <worktree> <brief-file>` (kit `bin/`). Start a piece as soon as the part that doesn't wait on other open work can begin. Assign one lane per checkout.
3. **Questions.** Answer from the docs where they settle the point. Every other question goes on the board (`lc-board ask`, `board` skill) and stays answerable there. While the owner is present you may also ask it interactively; never leave a question dialog open while the owner is away, it stops the watchdog and every relay. Wait for answers with `lc-board answers --wait` as a background command, so a new answer wakes you. Act on each answer, log it in the running log and set its outcome (`lc-board outcome`).
3a. **Board** (`board` skill). At the start of a phase run `lc-board start` and give the owner its URL, then start the keeper (`lc-board keeper`, on `board.keeper_model`). After a decision or a merge that no PR shows, apply one `lc-board` setter or send one line to the keeper; never edit `state.json`. Never show a status nobody verified.
4. **Reviews.** For a PR on a sensitive path, start one `pr-reviewer` session, never the implementer, when the build is committed. If the gate adds commits after the reviewer approved, the reviewer reads those commits before the merge.
5. **Merge** (`merge.command`): only when the PR is reported ready and is a **merge candidate**, meaning its required checks pass with the PR applied to the current main (`merge.candidate`: a merge queue where the host has one, otherwise update the branch and wait for the checks on the new head). A PR on a sensitive code path must also be approved by its reviewer session; report that approval to the owner in the running log. A PR touching protected files (`owner_approval`) waits for the owner's approval. Batch pinned-file changes into one PR you coordinate. After the merge, fast-forward the local main. Chain several merges in one script call, one PR after the other; a waiter must never wait on a process pattern that its own command line contains (`pgrep -f` matches itself).
6. **Watchdog.** At session start, schedule the [watchdog prompt](../../templates/watchdog-prompt.md) with the project's values as a recurring job. Recreate it whenever the session restarts. Each tick also runs `lc-board status`, restarts a dead board with `lc-board start`, and sends the keeper the word `tick`. A usage-limit prompt in a session needs a person's choice; the watchdog only reports it.
6a. **Update the docs.** When the owner says "update the docs", and at each phase exit, run `update-docs` or give it to one session.
7. **Running log.** One append-only file per phase in `handoff_dir`, one line per event: `- <date time>: <what changed>`. Lines the owner must act on start with `FOR THE OWNER`.
8. **Owner reads.** When the owner must read a PR or doc, open it for them in the diff viewer (`sessions.owner_read`), not only by name.
9. **Close.** After the merge, close the session's window (`lc-close <name>`), take its stack down, remove the worktree and delete the local branch. Keep the remote branch.
