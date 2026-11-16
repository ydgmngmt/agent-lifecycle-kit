---
name: pr-reviewer
description: Use when you are the reviewer session for a pull request on a sensitive path.
---

# PR reviewer (sensitive path)

Inputs: the PR number, its base and head, the brief or issue, `docs.review_checklist`, and `sensitive` and `docs.code_map`.

1. Read the diff at the head, in your own worktree or with `git show`/`gh pr diff`; never check out in another session's worktree. Change nothing.
2. Invoke `code-review` with the base as the fixed point and the brief as the spec. Its subagents may run.
3. Answer every question of `docs.review_checklist` for the changed code, the project's security invariants (`docs.agents`) first, then every removed or loosened check with what covers it now.
4. Rewrite every finding into [finding.md](../lifecycle/finding.md). Keep only findings with a `path:line`.
5. Send the findings straight to the implementer, with a copy to the orchestrator. When the gate adds commits after your approval, read those commits before the merge.

Done when every checklist question is answered or has a finding, and the implementer has the list.
