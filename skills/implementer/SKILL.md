---
name: implementer
description: Use when you are a session given a brief to build one pull request.
---

# Implementer

1. **Read** the brief in full, then the project files it names. Send the orchestrator a finding first only if the brief clashes with the docs; give both sides with `path:line`, and carry on with what doesn't depend on the answer.
2. **Reuse first.** Find each concept's owner in `docs.code_map` and extend it. Invoke `codebase-design` when you add a module or interface.
3. **Smallest diff** that meets the brief. Touch only what it needs, match the existing style, and remove what your change orphans.
4. **Bugs:** invoke `diagnosing-bugs` and reproduce the bug first. **Tests:** write them where `docs.testing` says, for observable behaviour and regressions. Invoke `tdd` for a test-first slice and record the seam and what it catches in the report.
5. **Subagents** only for independent parts (separate files, a mechanical move, a codebase lookup), at most `sessions.max_subagents` at a time. You check each result yourself. Subagents never gate, push or use a lane.
6. **Commit check** (`commit-check`) before each push, then **PR check** (`pr-check`): live check, reviewer if sensitive, self-review, docs, PR body, gate.
7. **Report** ([report.md](../lifecycle/report.md)) to the orchestrator, and stay available for fixes.

Peers: message other sessions directly about file ownership, lanes and review findings. Anything that changes scope, a product rule or the plan goes to the orchestrator.
