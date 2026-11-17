---
name: implementer
description: Use when you are a session given a brief to build one pull request, or before each push.
---

# Implementer

1. **Read** the brief in full, then the project files it names. Send the orchestrator a finding first only if the brief clashes with the docs; give both sides with `path:line`, and carry on with what doesn't depend on the answer.
2. **Isolate and coordinate.** Work in your own worktree and branch. Before you edit a file the brief names as shared, agree with the peer session that also edits it.
3. **Reuse first.** Find each concept's owner in `docs.code_map` and extend it. Invoke `codebase-design` when you add a module or interface.
4. **Smallest diff** that meets the brief. Touch only what it needs, match the existing style, and remove what your change orphans.
5. **Bugs:** invoke `diagnosing-bugs` and reproduce the bug first. **Tests:** keep behaviour regressions at the lowest reliable level, and use focused lower-level tests for core and security invariants (`docs.testing`). Invoke `tdd` for a test-first slice and record the seam and what it catches in the report.
6. **Subagents** only for independent parts (separate files, a mechanical move, a codebase lookup), at most `sessions.max_subagents` at a time. You check each result yourself. Subagents never gate, push or use a lane.
7. **Docs.** Update the docs your change makes stale in the same PR: stories, journeys, roadmap and glossary (`domain-modeling` for the terms). If you are asked to "update the docs", that is the `update-docs` sweep, not a note about your change.
8. **Before each push** (the commit check):
   - Follow the limits in `machine` before a heavy command.
   - Run `profiles.commit`: typecheck and the targeted behaviour tests covering the changed files, plus any you name.
   - A failure is yours to fix, even in code you didn't change; if it is not small, file an issue and say so in the report. A rebase without conflicts needs no rerun.
   - Done when `profiles.commit` exits 0 on the head you push.
9. **PR gate.** Run `lc-gate run pr <branch>` and follow `pr-gate` until `lc-gate check pr <branch>` holds.
10. **Report** ([report.md](../lifecycle/report.md)) to the orchestrator, and stay available for fixes.

Peers: message other sessions directly about file ownership, lanes and review findings. Anything that changes scope, a product rule or the plan goes to the orchestrator.
