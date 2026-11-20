---
name: review
description: Use when you are a gate session (spawned by `lc-gate run` for one `session` step of a PR or a phase exit) whose brief names a question file, base and candidate commits, an evidence folder and a findings file.
---

# Review: one gate session, one question file

Read-only: write only your findings file, and a live session's screenshots, traces and logs into the evidence folder. Don't read other gate sessions' findings.

1. **Questions.** `lc-gate questions <question file>` lists them as Q1, Q2, …: the file's top-level numbered and bulleted items. Read the whole file; it names the inputs and the base skills to invoke (`codebase-design` or `domain-modeling` for vocabulary). A question file that answers by kind of diff says which rows apply; the others are `no` (the kind) and `n/a`. A rules-only diff is one round: a way around a rule is P3.
2. **Code** at the candidate, in the worktree your brief names, else your own detached worktree (`git worktree add --detach <dir> <candidate>`) or with `git show` and `git diff <base> <candidate>`; never another session's worktree. Start from the evidence folder. Scope: the whole diff, or every file the phase touched.
3. **Depth.** Read every changed file in full, and the callers of what it changes. Trace one concrete input or sequence through each changed function; prove a suspected sequence with `diagnosing-bugs`, else mark it needs-check. No time or length budget; report every P1, P2 and P3 you can substantiate.
4. **A follow-up review** (the brief's scope says so: after a fix, or since a pass): read only the change the scope names: in a PR whose merges are all of main, `git log -p --first-parent --remerge-diff <old>..<candidate>` (its own commits and a merge's hand-resolved lines, nothing main brought in), else `git diff <old> <candidate>`. After a fix, check that each earlier P1 and P2 is resolved and that those lines add none. Raise nothing else, unless a P1 or P2 with its evidence. Every question keeps a row: a resolved one is `sound`, one the fix doesn't touch keeps its verdict.
5. **Answer per item.** The findings file opens with one row per question. A question with no row fails the step: `lc-gate record` refuses the file.

   | Q | Question | Applies | Checked | Verdict |
   | --- | --- | --- | --- | --- |
   | Q1 | Types at boundaries | yes | src/api/order.ts:42, src/db/order.ts:10 | P2: F1 |
   | Q2 | Effects | no | the diff has no outside call | n/a |

   Applies is yes or no. A yes names each `path:line` you read for it; a no says why. Verdict: `sound`, `P1`, `P2` or `P3` (naming its findings) or `n/a`; a P4 is a note in the row.
6. **Severity** says how serious, never who acts:
   - **P1:** wrong at merge and it harms: a bug, a regression, lost data, a broken security invariant.
   - **P2:** wrong against the intent, the brief, a written decision or the checklist, in a way later work builds on.
   - **P3:** real but small. **P4:** style, a possible improvement, an unlikely case.

   Every P1 and P2 names `path:line` and the case that fails. An item's tag is its findings' level unless P1; an older `(must-fix)` is P2, `(comment)` P3. Ask the owner only for a decision on product meaning, scope, access or spend the docs don't settle. A defect is never "sound".
7. **Findings** follow the table, each in [finding.md](../lifecycle/finding.md). Invent nothing; a clean result is valid.
8. **Record** with the brief's line: `fail` when any row is P1 or P2, else `pass`, however many P3; `lc-gate record` refuses a pass with one.
9. **Send** with `lc-tell <session|lead> "<line>"`: a P1 to the lead at once; the findings file's path to the implementer and the lead for a PR, the lead for a phase. Then stop.
