---
name: lead
description: Use when you are the lead session of a stage: splitting it into pull requests, starting an owner session for each, running the swarm that verifies them, answering questions, running the watchdog and the running log, and taking the stage to its exit.
---

# The lead

You are the root of pstack's Autopilot-full playbook, run through `adlc-mode`: read that skill and the playbook first. This skill adds the kit's tools around it. You own the plan and the verdicts, never a pull request.

Inputs: `.agents/project.yaml` (`stage`, `sessions`, `handoff_dir`, `owner_approval`, `protected_files`, `pinned_files`, `paths.sensitive`, `gate_pr`), `docs.roadmap`, `docs.acceptance`, `docs.orchestration`, `docs.code_map`.

1. **Plan.** The stage's acceptance criteria are agreed (`shape-product`) before any plan. Write the plan with pstack's Multi-phase plan playbook into `stage.plans`: the pull requests in landing order, the dependency graph, and one section per pull request. Add to each section the criteria it moves, the flow script that will show it, its `sensitive` paths and `owner_approval` files, and a "Needs the owner for" line. A box that does not apply reads `n/a: <reason>`. Add each pull request to the stage's table in `docs.roadmap`. Execution starts on the owner's go, asked on the board.
2. **Critical.** Propose `rigor: critical` for a section that touches `paths.sensitive`, holds a concurrency, money or authority invariant, or is a design that is hard to undo. Ask on the board, with what it adds (arena for the design, interrogate before the pull request opens) and a rough cost. Only the owner's yes puts the line in a kickoff.
3. **Stage branch.** Cut `stage.branch` from the default branch, push it, and run `lc-gate protect --branch <stage branch> --yes` so the host refuses a merge while a required check is red.
4. **Kickoff.** One file per pull request from the [kickoff template](../../templates/kickoff.md), in `<handoff_dir>/kickoffs/`. Its first line sends the session to `worker.md`; the rest is the goal, the pointer to its plan section, and its bar. Link the docs; don't repeat them.
5. **Spawn** each PR owner as a full session in its own worktree, on a branch off the stage branch, with `lc-spawn <name> <worktree> <kickoff file>`, never a script of your own, so the board knows it. Start a pull request once what it depends on has merged; run the independent ones in parallel, as many as the project's `machine` memory line allows. Every session opens a tab in the owner's terminal and takes no focus (`sessions.open_tab`); if that is unset, say so and ask before the first spawn. A session that only waits is parked: `lc-park <name> --resume "<point>"`, then `lc-park resume <name>`.
6. **Swarm.** At each code-ready head a PR owner reports, verify per the playbook's step 4: a full swarm once, the run lane alone after a rebase or a minor fix, nothing after a wording-only change. Verifiers are your subagents, never the PR owner's. Post the verdict on the pull request and tell the PR owner (`lc-tell <name>`). Log each verdict.
7. **Questions.** Before the owner leaves: one list of what the plan will need the owner for. Answer from the docs where they settle it; every other question goes on the board (`lc-board ask`, `board`). Never leave a question dialog open while the owner is away: it stops the watchdog and every relay. The board tells you each answer (`lc-tell lead`); keep no watch of your own.
8. **Board.** At the stage's start, `lc-board start`, give the owner its URL, and `lc-board keeper`. Keep it true by its rules.
9. **Watchdog.** At session start, schedule the [watchdog prompt](../../templates/watchdog-prompt.md) with the project's values as a recurring job; recreate it on restart. It is the playbook's audit (step 6).
10. **Running log:** one append-only file per stage (`board.running_log`), one line per event with `lc-log "<what changed>"`; lines the owner must act on start with `FOR THE OWNER`.
11. **Owner reads:** a pull request touching `owner_approval` files waits for the owner. Open it for the owner (`sessions.owner_read`), not only its name.
12. **Close** after a pull request's merge: `lc-close <name>`, take its stack down, remove the worktree, delete the local branch.
13. **Stage exit** (`stage-exit`) when the plan's last pull request has merged.
14. **Versions.** Before a stage starts: update the kit (`git pull` in its clone, `./install.sh`, the plugin update) and run `lc-pstack check`. If it fails, pstack moved under the fork: stop and tell the owner.
