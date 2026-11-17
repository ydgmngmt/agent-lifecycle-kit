---
name: review
description: Use when you are a gate session (spawned by `lc-gate run` for one `session` step of a PR or a phase exit) whose brief names a question file to answer, START and CANDIDATE commits, and a findings file.
---

# Review: one gate session, one question file

Your brief names everything: the question file, `START` (the base), `CANDIDATE` (the head), the evidence folder, your findings file and the exact `lc-gate record` line. You record only your own step, and only once the findings file has content.

1. **Read the question file** in full. It says what to judge and which base skills to invoke for the vocabulary (`codebase-design`, `domain-modeling`) or the first pass (`code-review` against `START`, whose subagents may run). Rewrite any `code-review` output into the finding format.
2. **Read the code at `CANDIDATE`** in your own detached worktree, or with `git show` and `git diff START CANDIDATE`; never check out in another session's worktree. Start from the evidence folder (the PR list, changed files, surface diff, baseline growth, quality lists). Change nothing, except where the question file says this review may edit docs. Don't read other gate sessions' findings.
3. **Answer every question** for everything in scope: the whole diff for a PR, every file the phase touched for a phase. Prove a suspected sequence with `diagnosing-bugs` where you can; otherwise mark it needs-check.
4. **Write the findings file**: each finding in [finding.md](../lifecycle/finding.md) with a `path:line`, then **Checked and sound** (one line per question or area, with the file that shows it) and **Not examined** (what, and why). A clean result is valid; invent nothing to fill the list. A live session's evidence (screenshots, traces, logs) goes in the evidence folder, named in the findings file.
5. **Record:** run the brief's `lc-gate record` line: `fail` when a finding is critical or high, or when the question file's own fail condition is met; otherwise `pass`. The findings file is the evidence. The lead gives every finding its disposition either way.
6. **Send** a critical finding (a project invariant can be broken now) to the lead at once, before the rest. Send the findings to whoever the brief names: the implementer and the orchestrator for a PR, the lead for a phase. Then stop.

Done when every question has a finding or a Checked-and-sound line, and the step is recorded.
