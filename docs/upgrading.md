# Upgrading

After either upgrade, rerun the `bootstrap` skill: it finds what is missing and walks each item.

## From 0.8 to 1.0

- **Skills merged, 23 into 10.** Run `./install.sh` again to drop the old links. `phase-acceptance` is in `shape-product`; `agent-brief` in `orchestrator`; `commit-check` in `implementer`; `pr-check`, `live-check` and `pr-reviewer` in `pr-gate`; `phase-run` in `phase-exit`; the five `review-*`, `duplication-check` and `dead-code-check` in `review`, with their questions in `templates/review/*.md`; `board-keeper` in `board`.
- **New project file keys:** `gate_pr_mode`, `paths`, `gate_pr`, `gate_phase`. Copy the blocks from `templates/project.yaml` and the question files from `templates/review/`.
- **CI:** the phase workflow takes a `candidate` input and names it in its `run-name`; the PR workflow runs `lc-gate check phase --diff`.
- `docs.phase_review` holds only the project's values; `lc-gate status phase <id> --write` generates the record into `docs.phase_records`.

## From 1.0 to 1.1

- **No `here` step in `gate_pr`:** `lc-gate enforcement --strict` fails on one. Replace an author's self-review or live check with a `command … after-gate` step on the review pipeline's result (`templates/ci/pipeline-passed.mjs`) or a `session` step; a planned step becomes `session … plan` (`templates/review/tool-fit.md`).
- **New keys:** `gate_pr_plan`, `ci.required_checks`, `pr_body` (`heading`, `if`, `shapes`), `paths.mechanism`, `docs.stack_decisions`, `docs.stack_tools`, `docs.stack_exceptions`. The modes accept `observe <n>`; a file still on `observe` or `enforce` behaves as before.
- **CI:** the phase-record step runs through `.agents/ci/from-base.sh` (from `templates/ci/`), and the new `pr-body.yml` checks the PR body's record. Add both to `ci.required_checks`, then run `lc-gate protect`.
- **Phase exit:** a `stack` step with `templates/review/stack-hunt.md`; the architecture question file leaves the hunt to it.

## From 1.1 to 1.2

- **Answer per item.** A gate session's findings file opens with one row per question (`| Q<n> | question | yes/no | path:line checked | sound/comment/must-fix/n/a |`); `lc-gate record` refuses a session's record without a row for each, and a pass with a must-fix row. `lc-gate questions <file>` lists a question file's questions: its top-level numbered and bulleted items, so keep anything else in a question file out of lists. Recopy the question files from `templates/review/`; the docs review no longer edits docs.
- **Review checklist:** `templates/review/checklist.md`, each item tagged `(must-fix)` or `(comment)`, with the block asked on every diff.
- **New keys:** `sessions.gate_model` and `sessions.gate_effort` (default `opus`, `xhigh`) for the sessions `lc-gate run` starts.
- **Sessions don't wait silently:** `lc-spawn` answers Claude Code's folder-trust prompt inside the repository's worktrees or `handoff_dir` and names it otherwise; `lc-gate run` reports a started session with no activity for 60 seconds.
