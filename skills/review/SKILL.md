---
name: review
description: Use when you are a gate session (spawned by `lc-gate run` for one `session` step of a PR or a phase exit) whose brief names a question file, base and candidate commits, an evidence folder and a findings file.
---

# Review: one gate session, one question file

Read-only: fix nothing. Write only your findings file, and a live session's screenshots, traces and logs into the evidence folder. Don't read other gate sessions' findings.

1. **Questions.** `lc-gate questions <question file>` lists them as Q1, Q2, …: the file's top-level numbered and bulleted items. Read the whole file; it names the inputs and the base skills to invoke (`codebase-design` or `domain-modeling` for vocabulary; `code-review` against the base as a first pass, its output rewritten into the finding format). A question file that answers by kind of diff (the checklist: prose only, rules only, or all) says which rows apply; the others are `no` (the kind) and `n/a`. A rules-only diff is one round: a way around a rule is a comment, never must-fix.
2. **Code** at the candidate, in the worktree your brief names, else your own detached worktree (`git worktree add --detach <dir> <candidate>`) or with `git show` and `git diff <base> <candidate>`; never another session's worktree. Start from the evidence folder. Scope: the whole diff, or every file the phase touched. Prove a suspected sequence with `diagnosing-bugs`, else mark it needs-check.
3. **Answer per item.** The findings file opens with one row per question. A question with no row fails the step: `lc-gate record` refuses the file.

   | Q | Question | Applies | Checked | Verdict |
   | --- | --- | --- | --- | --- |
   | Q1 | Types at boundaries | yes | src/api/order.ts:42, src/db/order.ts:10 | must-fix: F1 |
   | Q2 | Effects | no | the diff has no outside call | n/a |

   Applies is yes or no. A yes names each `path:line` you read for it; a no says why. Verdict: `sound`, `comment`, `must-fix` (naming its findings) or `n/a`.
4. **Severity.** An item tagged `(must-fix)` or `(comment)` carries its own. Otherwise a finding is must-fix when a project invariant can be broken now or the question file's fail condition is met, and comment when not. A defect is never "sound".
5. **Findings** follow the table, each in [finding.md](../lifecycle/finding.md). Invent nothing; a clean result is valid.
6. **Record** with the brief's line: `fail` when any row is must-fix, else `pass`, however many comments. A pass with a must-fix row is refused.
7. **Send** a critical finding to the lead at once; the file to the implementer and orchestrator for a PR, the lead for a phase. Then stop.
