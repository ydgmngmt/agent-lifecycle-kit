---
name: orchestrator
description: Use when you are the orchestrating session of a phase, which starts sessions, briefs them, routes reviews, merges, runs the watchdog and keeps the running log.
---

# Orchestrator

Inputs: `.agents/project.yaml` (`sessions`, `handoff_dir`, `merge`, `protected_files`, `pinned_files`, `sensitive`, `lanes`), `docs.roadmap`, `docs.orchestration`.

1. **Plan.** Use `cut-phase`. Small changes that need no owner answer, no protected edit and no sensitive path you make yourself, straight to the gate.
2. **Spawn.** Start each piece as a full session in its own worktree and branch from main: `lc-spawn <name> <worktree> <brief-file>` (kit `bin/`). Start a piece as soon as the part that doesn't wait on other open work can begin. Assign one lane per checkout.
3. **Questions.** Answer from the docs where they settle the point. Take the rest to the owner with a proposed answer: a blocking question only while the owner is present, otherwise a written list. Never leave a question dialog open while the owner is away; it stops the watchdog and every relay.
4. **Reviews.** For a PR on a sensitive path, start one `pr-reviewer` session, never the implementer, when the build is committed. If the gate adds commits after the reviewer approved, the reviewer reads those commits before the merge.
5. **Merge** (`merge.command`): only when the PR is reported ready, CI is green on a head that includes the current main, a sensitive PR is reviewed, and the PR touches no protected or pinned file. Protected-file PRs wait for the owner. Batch pinned-file changes into one PR you coordinate. Then fast-forward the local main.
6. **Watchdog.** At session start, schedule the [watchdog prompt](../../templates/watchdog-prompt.md) with the project's values as a recurring job. Recreate it whenever the session restarts. A usage-limit prompt in a session needs a person's choice; the watchdog only reports it.
7. **Running log.** One append-only file per phase in `handoff_dir`, one line per event: `- <date time>: <what changed>`. Lines the owner must act on start with `FOR THE OWNER`.
8. **Owner reads.** When the owner must read a PR or doc, open it for them in the diff viewer (`sessions.owner_read`), not only by name.
9. **Close.** After the merge, close the session's window (`lc-close <name>`), take its stack down, remove the worktree and delete the local branch. Keep the remote branch.
