# Upgrading

After any upgrade, rerun the `bootstrap` skill: it finds what is missing and walks each item.

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
- **Review checklist:** `templates/review/checklist.md`, each item tagged `(must-fix)` or `(comment)`.
- **New keys:** `sessions.gate_model` and `sessions.gate_effort` (default `opus`, `xhigh`) for the sessions `lc-gate run` starts.
- **Sessions don't wait silently:** `lc-spawn` answers Claude Code's folder-trust prompt inside the repository's worktrees or `handoff_dir` and names it otherwise; `lc-gate run` reports a started session with no activity for 60 seconds.

## From 1.2 to 1.3

- **Mechanical rules.** `lc-rules` runs the rules of `.agents/rules.yaml` (`templates/rules.yaml`): each names the written decision it enforces and carries a red and a green example (`lc-rules selftest`). Existing findings go in `.agents/rules-baseline.json` once (`lc-rules baseline`), which then only shrinks (`--prune`). Run `./install.sh` again for the new link; the bootstrap's Rules stage (item 14b) writes the first rules.
- **CI:** copy the rules step of `templates/ci/pr.yml`; it runs `lc-rules check --base`, judged by the base commit's rules and baseline. Add both files to `protected_files`; `lc-gate enforcement` shows the rules layer once the file exists.
- **Review by kind of diff:** recopy `templates/review/checklist.md`, keeping your project's items: a prose-only diff answers the Docs items, a rules-only diff the Rules items, any other diff all of them.
- **New key:** `sessions.gate_parallel`, how many gate sessions `lc-gate run` starts at a time; unset, all at once as before.
- `lc-spawn` says the folder-trust prompt was answered only once the window no longer shows it.

## From 1.3 to 1.4

- **The checklist reviews every PR.** In `gate_pr`, drop the `if sensitive` from the `reviewer` step: `reviewer: session docs/review-checklist.md`. The checklist answers by kind of diff, so a prose-only diff is reviewed against the Docs items and a false statement fails it. Without a review pipeline, the code review is `correctness: session docs/review/correctness.md if flow`, beside it. `lc-gate enforcement` shows a `review` row, on for that step or for an `after-gate` step (an outside review pipeline), either without an `if`.
- **Rules without a CI host.** Add `rules: command lc-rules check --base $LC_GATE_BASE` to `gate_pr`; it runs at the candidate, judged by the base's rules and baseline. The mechanical rules row is on through it or a workflow, and counts with no host.
- **`--strict` fails when nothing refuses:** no host requiring the checks and no mode enforcing with its hook on (an `observe <n>` mode still counting included). Its `refusal` row says what is missing.
- **Local merges.** With no pull requests, the plugin hook checks `git merge <branch>` into the default branch against that branch's PR gate, as it does `gh pr merge`. Rerun `./install.sh` or update the plugin for the new hook entries.
- **Wizard:** it asks for `sessions.agent_flags` (how gate sessions get permissions unattended), offers `none` for browser, tenants, linter and CI, and puts a decision no rule kind fits into the review checklist as a `(must-fix)` item.
- **Quieter:** an observe message is told once per commit; a gate session's window closes 10 seconds after its own record (`LC_CLOSE_DELAY`), and `lc-gate run` closes one left open.

## From 1.4 to 1.5

- **New key:** `sessions.gate_setup`, optional: a command `lc-gate run` runs once in one worktree of the gate at the candidate (for example installing dependencies); the gate's session briefs name that worktree, so a session can run a check there. Unset, nothing changes.
- `lc-gate run` always writes `prs.txt` and `files.txt` into the evidence folder, so a skipped freeze step still leaves the scope.
- The lead may record an `owner` step N/A with a reason (a scratch or dry run); the phase record states that acceptance was not given.
- `lc-spawn` sends its answer to the folder-trust prompt again each second while the prompt shows: keys sent as it is first drawn are dropped.
- No CI host: keep `ci.enforcement: none`; `lc-gate enforcement` names it instead of asking for `ci.required_checks`.

## From 1.5 to 1.6

- **Severity P1 to P4, apart from who acts.** P1: wrong at merge and it harms; P2: wrong against the intent, the brief, a written decision or the checklist; P3: real but small; P4: a note in the row. A verdict is `sound`, `P1`, `P2`, `P3` or `n/a`; `lc-gate record` refuses a pass with a P1 or P2 row. A row still `must-fix` counts as P2 and `comment` stays valid, so older question files keep working; recopy `templates/review/checklist.md` to retag your items `(P2)` and `(P3)`.
- **The review judges the PR against its brief.** The checklist's first item asks whether the diff does everything its brief's "Done when" lines say, and nothing outside its scope: add it to `docs.review_checklist`. The PR gate's session brief names the implementer's brief, found through the board's `spawned.tsv` by the branch's worktree, so start implementers with `lc-spawn`; with none known, the PR body is the brief. Briefs end with their scope and "Done when" lines (`templates/brief.md`).
- **Deep first, narrow after a fix.** A session step that failed at an earlier candidate the new one descends from gets a review of the fix only: the brief names the earlier findings and the range. After two such reviews still failing, `lc-gate run` starts no further session; the lead decides (N/A with a reason, or a decision on the board). The rounds are kept in `rounds.json` in the gate's state folder.

## From 1.6 to 1.7

- **The live check is a command.** The author keeps a flow script per changed flow; `live-check` in `gate_pr` runs the scripts covering the diff on the pushed head, in place of a session or a pipeline test step. Copy the flow-script item from `templates/review/checklist.md` into your checklist.
- **1.7.1:** commits on top of a passed session step get a review of only the change since the pass. Give `live-check` its own `paths.live` (the flow paths plus the scripts, their config and helpers), so a script-only change runs its script.
- **1.7.2:** a new journey's flow script may start from the project's draft command; the orchestrator keeps every session on the latest kit.

## From 1.7 to 1.8

Change the project file before updating the kit: a step line with `after-gate` is refused, and the git pre-commit hook refuses commits while one is left.

- **`after-gate` goes.** Drop the outside review pipeline's step (`review: command node .agents/ci/pipeline-passed.mjs …`) and `.agents/ci/pipeline-passed.mjs`.
- **`ci: checks`** in `gate_pr`, after the steps that run locally: the host's `ci.required_checks` on the pushed head. With no CI host, leave it out.
- **`live-check: command … if live after ci`**: `after-gate` becomes `after ci`.
- **`reviewer: session docs/review-checklist.md after ci,live-check`**: the review starts once the checks pass.
- **Merge with `lc-gate merge pr <branch>`;** set `merge.command` to it and drop `merge.candidate`. Drop `gate.run` and `ci.pr_checks`.
- **`pr.template`** and **`pr.required_sections`** (comma-separated) for `lc-pr`; run `./install.sh` again for its link.
- **Git 2.36** or later, for the follow-up review's `--remerge-diff`.

## From 1.8 to 1.9

- **No idle turns at the PR gate.** A session step whose FAIL, or PASS at an ancestor, no longer holds gets its follow-up review by itself, once its `after` holds. `lc-gate run … --wait` returns when a step changes (`LC_GATE_WAIT`, 1500 s); use it in place of polling.
- **Rounds per gate.** `sessions.gate_rounds` (2): follow-up reviews of a step that may end in FAIL, whatever the commit. At the count only `lc-gate run <gate> <id> --rerun <step> --lead --reason "…"` starts another; the reason goes into the record's history. `lc-gate status` prints the count. `rounds.json` has a new shape: counts start again from this version.
- **A gone session** (a brief, no window, no record) is started again once.
- **Stacked PRs.** Without `--base`, a PR gate's base is the PR's base branch on the host when that is not the default branch.
- **`if <key>`** reads the base's `paths.<key>` as well as the head's.
- **New keys:** `sessions.lead` (the orchestrator's window, for `lc-tell lead` and the board), `sessions.gate_flags` (docs/machine.md), `sessions.memory_floor_mb`.
- **New commands:** `lc-tell`, `lc-log`, `lc-park` (run `./install.sh` again for their links) and `lc-gate tally`. The board shows the read-afterwards list and tells the lead each answer; drop the lead's own `lc-board answers --wait`.
- `lc-gate enforcement` names `gate.run`, `ci.pr_checks` and `merge.candidate` when they are still in the project file.
