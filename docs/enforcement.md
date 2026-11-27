# Enforcement

How a gate step becomes binding. To set each layer up in a repository, run the `bootstrap` skill: its [Enforcement stage](../skills/bootstrap/enforcement.md) walks every layer and ends on `lc-gate enforcement --strict`.

## The model

Since 2.0 the kit has one gate, the **stage exit**: the step list `gate_pr:` in the project file, judged on the stage branch's pull request into the default branch (`gate_pr_only: default-branch`). A pull request into a stage branch is not this gate's: the host's required checks refuse it while one is red, and pstack's autopilot lets its owner session merge only after the swarm's verdict, which is the playbook's rule and not a record. The runner `lc-gate` walks the list in file order: it runs commands, reads the host's checks, starts CI workflows and spawns review sessions. Every step leaves a record (PASS, FAIL, or N/A with a reason, which only the lead may give), bound to the candidate commit, and `lc-gate check` refuses while one is missing, stale or failed.

Who may write a record:

- A `command` step's PASS: only the runner, from the command's exit at the candidate (`lc-gate run <gate> <id> --rerun <step>` runs it again). Nobody records or carries it by hand.
- A `checks` step's record: only the runner (or `lc-gate merge`), from the newest run of each `ci.required_checks` name on the exact commit. It holds for that commit only, never across a merge or by carry.
- A `session` step's PASS: only the session the runner started for it, which carries `LC_GATE_STEP` naming that step. So the author of a change can't record its own review. Its record is refused unless its findings file has a row for every question of its question file (`lc-gate questions <file>`), and a pass is refused while a row is P1 or P2 (or an older must-fix). It runs on `sessions.gate_model` and `sessions.gate_effort` (the template sets `opus`, `medium`), not the lead's model; `sessions.gate_parallel` caps how many run at once.
- FAIL, N/A with a reason, and carrying an earlier PASS to a new candidate: the lead.

A workflow record is checked against the run on GitHub, and a review or `here` record against its committed findings file. Three rules hold throughout: no session records a check of its own work; CI judges a change by the base branch's copy of the checks and step lists (`templates/ci/from-base.sh`); the files that define the rules change only in a PR the owner reads (`protected_files`).

The gate catches skipped steps and stale or failed results. It does not catch a session working against it: one that sets or unsets `LC_GATE_STEP` is treated as the spawned session or as the lead.

## The step line

```
<id>: <kind> <argument> [if <paths key>] [plan] [after <step>[,<step>]]
```

- **kind:** `command`, `workflow`, `checks` (no argument), `session`, `here` or `owner`. An argument may not end in `plan`, `if <word>` or `after <word>`: those are read as the flags; quote it (`bash -c 'terraform plan'`).
- **`if <key>`:** the step applies only when the change touches the globs under `paths.<key>`. A step with no argument keeps it: `owner if protected`.
- **`plan`** (on a `here` or `session` step, or a `command` step with `after`): the author records a plan before the branch's first commit, with `lc-gate record pr <branch> <step> plan --evidence <file>`; it is refused after that commit. `check` requires the plan beside the step's final record. A branch that already had commits when the gate saw it gets a plan N/A with a reason from the lead.
- **`after <step>[,<step>]`** (last on the line): the step starts once each named step, declared above it, has a record that holds with PASS or N/A. Without it, a `session`, `workflow` or `checks` step starts at once and a `command`, `here` or `owner` step waits for a record on every step above. `after-gate` (before 1.8) is refused.

A PR record **holds** for a later head when every commit between is a merge of main whose `git show --remerge-diff` prints nothing (no hand-resolved line). A `command` step with `if` also holds when the PR's own change between touches none of its paths. A `session` step whose record no longer holds gets a **follow-up review** of the change since: in a PR whose merges are all of main, its own change, `git log -p --first-parent --remerge-diff <old>..<new>` (git 2.36; an older git holds no record across a merge); otherwise `git diff <old> <new>`.

Example, from [the project template](../templates/project.yaml):

```
gate_pr:
  ci: checks
  rules: command lc-rules check --base $LC_GATE_BASE
  regression: workflow <stage workflow file> if code
  integration: workflow <integration workflow file> if code
  acceptance: command <cmd> verify:acceptance if code after ci
  thermo-review: session docs/review/thermo-review.md if code after ci,acceptance
  thermo-quality: session docs/review/thermo-quality.md if code after ci,acceptance
  stack: session docs/review/stack-hunt.md if mechanism after ci,acceptance
```

The three sessions start once the host's checks and `acceptance` pass; the regression and integration runs go on beside them. `if code` makes a docs-only pull request (the docs sweep) N/A for everything but the host's checks and the rules. The Thermos question files name the vendored rubrics (`vendor/thermos/`) and map their bar to P1, P2 and P3, so the rule "no pass on a P1 or P2 row" enforces Thermos's bar. The `here` and `owner` kinds and `gate_phase:` still work for a project that wants them; the template no longer uses them.

## The modes

`gate_pr_only: default-branch` limits the merge hook to pull requests into the default branch; unset, every pull request is checked, as before 2.0. `gate_pr_mode` (the gate's records, at `lc-gate merge`, at `gh pr merge` and at a `git merge` of a branch into the default branch) and `gate_pr_plan` (edits and commits without a required plan) each take `off`, `observe`, `observe <n>` or `enforce`; unset means `observe`.

- `observe` logs to `<gates>/observe.log` and tells the session what enforce would refuse.
- `observe <n>` observes until `<n>` PRs have merged with every record (counted from the merge hook's marks, `gates/pr/<id>/merged.json`), then enforces without an edit; the hook says so once. The template starts at `enforce`, and `gate_pr_plan` at `off`: none of its steps is planned.
- `enforce` refuses.

`lc-gate enforcement --strict` also exits 1 when nothing refuses at all: no host requires the checks and no mode enforces with its hook on. Its `refusal` row names what is missing.

An observe message for a commit is told once, however many hooks see that commit. The plan check runs on every `Edit`, `Write`, `MultiEdit` and `NotebookEdit` of a file in the repository and on every `git commit`, and refuses `git commit --no-verify` while a planned step applies. Files under `.agents/` never count, so the plan can be written there. Agents without Claude Code hooks get the same check from the git hook: copy `templates/githooks/pre-commit` to `.githooks/pre-commit` and run `git config core.hooksPath .githooks`.

## The commands

The full usage is at the top of [`gate/gate.mjs`](../gate/gate.mjs).

| Command | What |
| --- | --- |
| `lc-gate run <phase\|pr> [id] [--wait]` | Walk the gate: each step without a record gets the next thing for its kind; a follow-up review starts by itself. `--wait` walks again until a step changes (`LC_GATE_WAIT` seconds, 1500). `--rerun <step> --lead --reason "…"` starts one review past `sessions.gate_rounds` |
| `lc-gate tally <phase\|pr> [--since <date>] [--md]` | Per question of each session step: reviews, how often it applied, its P1, P2 and P3 rows, over every findings file |
| `lc-gate record <gate> <id> <step> …` | Record a result, an N/A, a carry or a plan; a gate session's own record closes its window after 10 seconds (`LC_CLOSE_DELAY`), and `run` closes any left open |
| `lc-gate status <gate> <id>` | The table; `--write` generates the phase record, `--trailer` prints `Verified-By` |
| `lc-gate check <gate> <id>` | Exit 1 listing missing, stale or failed steps; `check phase --diff <base> <head>` is the CI form |
| `lc-gate merge pr [branch]` | The one way a stage enters the default branch, one at a time: updates a behind branch (a conflict stops it), waits for the `checks` step on the head (`LC_GATE_MERGE_WAIT` seconds, 1800), requires every record, then `gh pr merge --merge --match-head-commit` with the `Verified-By` trailer |
| `lc-pr open --title <t> [--base <b>] [--draft] [--section "<Heading>=<file>"]…` | The PR from `pr.template` (else `.github/pull_request_template.md`); refused while a heading of `pr.required_sections` is empty |
| `lc-pr section "<Heading>" --file <f> [--pr <n>]` | Replaces one section of the PR body, every other byte kept; appends it when missing |
| `lc-tell <session\|lead> "<line>"` | One line to a session: logged in `<handoff_dir>/tell.log` and typed into its window; `lead` is `sessions.lead` |
| `lc-log "<line>"` | One line in `board.running_log`, stamped with the time and the sender |
| `lc-park <session> --resume "<point>"` · `lc-park resume <session>` | Close a session that only waits, with its resume point beside its brief; start it again on both |
| `lc-gate plan-check [--staged] [--files <path>…]` | Exit 1 when a planned step applies and the branch has no plan |
| `lc-gate hook` | The plugin's hook ([`hooks/hooks.json`](../hooks/hooks.json)) |
| `lc-gate enforcement [--strict] [--md]` | What makes each step binding here, layer by layer, and whether each layer is on |
| `lc-gate protect [--branch <name>] [--yes]` | Branch protection from `ci.required_checks`, on the default branch or on the named one (a stage branch) |
| `lc-pstack path` · `check` · `diff` | The installed pstack's folder; whether it is the version `pstack.lock` pins and upstream still matches what the fork and the vendored files started from; what moved |
| `lc-tools [--strict]` | The baseline tools ([tools](tools.md)): present or missing, with the install line; exit 1 when a core tool is missing |
| `lc-criteria <acceptance file> <folder>…` | Exit 1 listing each acceptance criterion no flow script under the folders names |
| `lc-rules check [--base <sha>]` | Exit 1 on a finding of `.agents/rules.yaml` beyond `.agents/rules-baseline.json`; with `--base`, the base commit's copy judges ([`rules/rules.mjs`](../rules/rules.mjs)) |
| `lc-rules selftest` | Each rule fails its red example and passes its green one |
| `lc-rules baseline [--prune]` | Adds the findings of rules new to the baseline; `--prune` drops fixed ones. It never grows a rule's entries |
