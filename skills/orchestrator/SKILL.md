---
name: orchestrator
description: Use when you are the lead session of a phase (splitting it into briefs, starting sessions, answering questions, merging, running the watchdog and the running log), or when writing a brief that hands one change to an implementer session.
---

# Orchestrator (the lead)

Inputs: `.agents/project.yaml` (`sessions`, `handoff_dir`, `merge`, `owner_approval`, `protected_files`, `pinned_files`, `sensitive`, `lanes`, `gate_pr`, `gate_pr_mode`), `docs.roadmap`, `docs.orchestration`, `docs.code_map`.

1. **Plan.** The phase's acceptance criteria are agreed (`shape-product`) before any brief. Split the phase into briefs (below). Make small changes yourself, straight through the PR gate, when they need no owner answer, no owner approval and no sensitive path.
2. **Spawn.** Start each brief as a full session in its own worktree and branch from main: `lc-spawn <name> <worktree> <brief-file>`, not a script of your own, so the board knows the session's brief and branch. It starts in the background and opens no terminal unless `sessions.open_tab` is set, so it never takes the owner's focus. Start a piece as soon as the part that doesn't wait on other open work can begin. One lane per checkout.
3. **Questions.** Answer from the docs where they settle the point. Every other question goes on the board (`lc-board ask`, `board` skill). While the owner is present you may also ask interactively; never leave a question dialog open while the owner is away, it stops the watchdog and every relay. Wait with `lc-board answers --wait` as a background command. Act on each answer, log it, and set its outcome (`lc-board outcome`).
4. **Board.** At the start of a phase run `lc-board start`, give the owner its URL, and start the keeper (`lc-board keeper`). After a decision or a merge that no PR shows, apply one `lc-board` setter or send one line to the keeper. Never show a status nobody verified.
5. **Gates.** The implementer runs `lc-gate run pr <branch>`; its `session` steps (such as the reviewer of a sensitive path) are spawned by the runner, never given to the implementer. You hold what only the lead may do: an N/A record or a carried record, each with a one-line reason a reader can check (`lc-gate record … na --reason …`, `--carry --reason …`). Report each reviewer-session approval to the owner in the running log.
6. **Merge** (`merge.command`) only when `lc-gate check pr <branch>` holds and the PR is a **merge candidate**: its required checks pass with the PR applied to the current main (`merge.candidate`: a merge queue where the host has one, otherwise update the branch and wait for the checks on the new head). A PR touching protected files (`owner_approval`) waits for the owner's approval. Batch pinned-file changes into one PR you coordinate. After the merge, fast-forward the local main. Chain several merges in one script call; a waiter must never wait on a process pattern its own command line contains (`pgrep -f` matches itself).
7. **Watchdog.** At session start, schedule the [watchdog prompt](../../templates/watchdog-prompt.md) with the project's values as a recurring job, and recreate it whenever the session restarts. Each tick also runs `lc-board status`, restarts a dead board with `lc-board start`, and sends the keeper the word `tick`. A usage-limit prompt in a session needs a person's choice; the watchdog only reports it.
8. **Update the docs.** When the owner says "update the docs", and at each phase exit, run `update-docs` or give it to one session.
9. **Running log.** One append-only file per phase in `handoff_dir`, one line per event: `- <date time>: <what changed>`. Lines the owner must act on start with `FOR THE OWNER`.
10. **Owner reads.** When the owner must read a PR or doc, open it for them (`sessions.owner_read`), not only by name.
11. **Close.** After the merge, close the session (`lc-close <name>`), take its stack down, remove the worktree and delete the local branch. Keep the remote branch.

## Briefs

1. **Scope one small, mergeable change:** one reviewable PR that leaves main working. Invoke `codebase-design` to place its seam, and find each concept's owner in `docs.code_map`. An open design question code can answer gets a throwaway `prototype` first.
2. **Name its owner:** the session that builds it, and whether it touches a sensitive path (`sensitive`) or a protected file (`owner_approval`).
3. **Order:** changes that touch the same files run in sequence; the others run in parallel. Each brief names its shared files and who else edits them.
4. **Write it** with `writing-for-agents` and the [brief template](../../templates/brief.md): the goal and the acceptance criteria it moves, what to reuse, decisions already made, what not to touch, how to verify, the lane and the report file. Link the project docs; don't repeat them.
5. Add the change to the phase's table in `docs.roadmap`.

Done when every acceptance criterion is covered by at least one brief, and each brief names its owner.
