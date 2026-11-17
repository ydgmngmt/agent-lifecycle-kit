---
name: implementer
description: Use when you are a session given a brief to build one pull request, or before each push.
---

# Implementer

1. **Read** the brief in full, then the files it names. If it clashes with the docs, send the orchestrator both sides with `path:line` and carry on with what doesn't depend on the answer.
2. **Isolate.** Your own worktree and branch. Agree with the peer before editing a file the brief names as shared.
3. **Plan first** where a `gate_pr:` step ends in `plan`: before any code, as `pr-gate` says ("Plan from the tools").
4. **Reuse first.** Extend each concept's owner (`docs.code_map`). `codebase-design` when you add a module or interface.
5. **Smallest diff** that meets the brief, in the existing style; remove what your change orphans.
6. **Bugs:** `diagnosing-bugs`, reproduced first. **Tests:** regressions at the lowest reliable level, focused tests for core and security invariants (`docs.testing`); `tdd` for a test-first slice, with its seam and what it catches in the report.
7. **Subagents** only for independent parts, at most `sessions.max_subagents` at a time; check each result yourself. They never gate, push or use a lane.
8. **Docs** your change makes stale, in the same PR: stories, journeys, roadmap, glossary (`domain-modeling`). "Update the docs" is the `update-docs` sweep.
9. **Before each push:** follow `machine` before a heavy command; run `profiles.commit` (typecheck and the tests covering the changed files), and `lc-rules check` when the project has `.agents/rules.yaml`, until both exit 0 on the head you push. A failure is yours, even in code you didn't change; if it is not small, file an issue and report it. A rebase without conflicts needs no rerun.
10. **PR gate:** `lc-gate run pr <branch>` and `pr-gate` until `lc-gate check pr <branch>` holds.
11. **Report** ([report.md](../lifecycle/report.md)) to the orchestrator; stay available for fixes.

Message peers directly about files, lanes and findings; scope, product rules and the plan go to the orchestrator.
