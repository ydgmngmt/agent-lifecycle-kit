# Enforcement

How a gate step becomes binding. To set each layer up in a repository, run the `bootstrap` skill: its [Enforcement stage](../skills/bootstrap/enforcement.md) walks every layer and ends on `lc-gate enforcement --strict`.

## The model

Each gate is a step list in the project file: `gate_pr:` per change, `gate_phase:` once a phase's PRs have merged. The runner `lc-gate` walks it: it runs commands, starts CI workflows, spawns review sessions and asks the owner on the board. Every step leaves a record (PASS, FAIL, or N/A with a reason, which only the lead may give), bound to the candidate commit, and `lc-gate check` refuses while one is missing, stale or failed.

Who may write a record:

- A `command` step's PASS: only the runner, from the command's exit at the candidate (`lc-gate run <gate> <id> --rerun <step>` runs it again). Nobody records or carries it by hand.
- A `session` step's PASS: only the session the runner started for it, which carries `LC_GATE_STEP` naming that step. So the author of a change can't record its own review.
- FAIL, N/A with a reason, and carrying an earlier PASS to a new candidate: the lead.

A workflow record is checked against the run on GitHub, and a review or `here` record against its committed findings file. Three rules hold throughout: no session records a check of its own work; CI judges a change by the base branch's copy of the checks and step lists (`templates/ci/from-base.sh`); the files that define the rules change only in a PR the owner reads (`protected_files`).

The gate catches skipped steps and stale or failed results. It does not catch a session working against it: one that sets or unsets `LC_GATE_STEP` is treated as the spawned session or as the lead.

## The step line

```
<id>: <kind> <argument> [if <paths key>] [plan] [after-gate]
```

- **kind:** `command`, `workflow`, `session`, `here` or `owner`.
- **`if <key>`:** the step applies only when the change touches the globs under `paths.<key>`.
- **`plan`** (on a `here` or `session` step, or a `command … after-gate` step): the author records a plan before the branch's first commit, with `lc-gate record pr <branch> <step> plan --evidence <file>`; it is refused after that commit. `check` requires the plan beside the step's final record. A branch that already had commits when the gate saw it gets a plan N/A with a reason from the lead.
- **`after-gate`** (last on the line): only the review pipeline's own result satisfies the step. `lc-gate check` and the hook at the gate start skip it, so the pipeline can start; the hook at `gh pr merge` and `lc-gate status` require it, and `lc-gate run` walks such steps last. On a `command … plan after-gate` step the final record is the pipeline's review of the head, which checks the plan against the code.

Example, from [the project template](../templates/project.yaml):

```
gate_pr:
  tool-fit: session docs/review/tool-fit.md if mechanism plan
  review: command node .agents/ci/pipeline-passed.mjs review after-gate
```

## The modes

`gate_pr_mode` (the PR gate's records, at the gate start and at `gh pr merge`) and `gate_pr_plan` (edits and commits without a required plan) each take `off`, `observe`, `observe <n>` or `enforce`; unset means `observe`.

- `observe` logs to `<gates>/observe.log` and tells the session what enforce would refuse.
- `observe <n>` observes until `<n>` PRs have merged with every record (counted from the merge hook's marks, `gates/pr/<id>/merged.json`), then enforces without an edit; the hook says so once. The template starts at `observe 3`.
- `enforce` refuses.

The plan check runs on every `Edit`, `Write`, `MultiEdit` and `NotebookEdit` of a file in the repository and on every `git commit`, and refuses `git commit --no-verify` while a planned step applies. Files under `.agents/` never count, so the plan can be written there. Agents without Claude Code hooks get the same check from the git hook: copy `templates/githooks/pre-commit` to `.githooks/pre-commit` and run `git config core.hooksPath .githooks`.

## The commands

The full usage is at the top of [`gate/gate.mjs`](../gate/gate.mjs).

| Command | What |
| --- | --- |
| `lc-gate run <phase\|pr> [id]` | Walk the gate: each step without a record gets the next thing for its kind |
| `lc-gate record <gate> <id> <step> …` | Record a result, an N/A, a carry or a plan |
| `lc-gate status <gate> <id>` | The table; `--write` generates the phase record, `--trailer` prints `Verified-By` |
| `lc-gate check <gate> <id>` | Exit 1 listing missing, stale or failed steps; `check phase --diff <base> <head>` is the CI form |
| `lc-gate plan-check [--staged] [--files <path>…]` | Exit 1 when a planned step applies and the branch has no plan |
| `lc-gate hook` | The plugin's hook ([`hooks/hooks.json`](../hooks/hooks.json)) |
| `lc-gate enforcement [--strict] [--md]` | What makes each step binding here, layer by layer, and whether each layer is on |
| `lc-gate protect [--yes]` | Branch protection on the default branch from `ci.required_checks` |
