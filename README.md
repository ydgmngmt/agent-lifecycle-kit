# agent-lifecycle-kit: ADLC

**ADLC (agent-driven development lifecycle)**, packaged as skills, tools and templates. The kit knows nothing about any one project; each repository keeps its own values in `.agents/project.yaml`, including the steps of its gates.

![Agent-driven development lifecycle](docs/adlc.png)

## The lifecycle

1. **Product scope:** PRD → user stories → phases, and each phase's acceptance criteria (user outcomes, failure cases, invariants).
2. **Briefs:** one small, mergeable change per brief, with a named owner.
3. **Parallel implementation:** an orchestrator session assigns briefs to agent sessions (10+ at peak), each in its own worktree and able to spawn subagents. Status and questions go up; peers coordinate shared files before editing them.
4. **PR gate**, per change, and **Phase exit**, once a phase's PRs have merged. A fix at any gate loops back to implementation.
5. Once the phase exits, the **next phase** starts.

**Gates that leave a record.** Each gate is a step list in the project file (`gate_pr:`, `gate_phase:`). The runner `lc-gate` walks it: it runs commands, starts CI workflows, spawns review sessions and asks the owner on the board. Every step leaves a record (PASS, FAIL, or N/A with a reason, which only the lead may give), bound to the candidate commit, and `lc-gate check` refuses while one is missing. A typical Phase exit: freeze, a regression run, the integration suite, seven review sessions (built as described, correctness, security, architecture, duplication, dead code, docs), findings with dispositions, fix and retest, the owner's acceptance, lessons.

A `here` or `session` step whose line ends in `plan` (`tool-fit: session docs/review/tool-fit.md if mechanism plan`) also needs a plan, recorded with `lc-gate record pr <branch> <step> plan --evidence <file>` before the branch's first commit and refused after it, so the session plans from the project's chosen tools before it designs its own code. `check` requires that plan beside the step's final record, and a branch that had commits before the gate saw it gets a plan N/A with a reason from the lead.

A step whose line ends in `after-gate` (`pipeline: command <script that passes once the review pipeline reviewed this head> after-gate`, after `plan` when both are there) is one only the review pipeline's own result can satisfy. `lc-gate check` and the hook at the gate start (`no-mistakes axi run`) skip it, so the pipeline can start; the hook at `gh pr merge` and `lc-gate status` (with `--trailer`, `--write`) require it. `lc-gate run` walks such steps last and says they come after the pipeline.

The plan is enforced before the work, under `gate_pr_plan` in the project file (independent of `gate_pr_mode`; both take `off`, `observe`, `observe <n>` or `enforce`, default `observe`). `lc-gate plan-check [--staged] [--files <path>…]` fails when a planned step applies (the files are under its `if` paths, or it has none; the branch is not the default branch) and the branch has no plan record; files under `.agents/` never count, so the plan can be written there. The plugin's hook runs it on every `Edit`, `Write`, `MultiEdit` and `NotebookEdit` of a file in the repository and on every `git commit` (on every changed file), and refuses `git commit --no-verify` while a planned step applies: in enforce mode it refuses, in observe mode it logs to `<gates>/observe.log` and tells the session. For agents without Claude Code hooks, install the git hook: copy `templates/githooks/pre-commit` to `.githooks/pre-commit` and run `git config core.hooksPath .githooks` (it passes, with one line, where `lc-gate` is not on PATH; `core.hooksPath` replaces `.git/hooks`, so move any hook kept there).

What a record proves, and what it doesn't: a workflow row is checked against the run on GitHub, and a review or `here` row against its committed findings file. Who wrote a record rests on the environment: a session spawned for one step carries `LC_GATE_STEP`, and `lc-gate record` keeps it to that step, never N/A or a carry. Nobody records a `command` step's PASS by hand, nor carries one: the runner records it from the command's exit at the candidate (`lc-gate run <gate> <id> --rerun <step>` runs it again); FAIL, and N/A with a reason, stay with the lead. A `session` step's PASS is recorded only by the session the runner started for it (its `LC_GATE_STEP` names that step); the lead records N/A with a reason or carries an earlier PASS. So the author of a change can't record its own review. This guards against mistakes and shortcuts, not against a session that forges its environment: a session that unsets or sets the variable is treated as the lead or as the spawned session. The gate catches skipped steps and stale or failed results, not a session working against it.

## Enforcement

A record only binds if something refuses without it. Five strengths, weakest last:

1. **The host refuses:** required checks on a protected default branch, branch up to date, pull requests only, administrators included. `lc-gate protect` sets this from `ci.required_checks` (it prints the plan; `--yes` applies it; it only ever adds).
2. **A local hook refuses**, earlier and cheaper: the plugin's hook on edits, commits, the gate start and `gh pr merge`, and the git `pre-commit` hook for every agent.
3. **An independent record:** made by the runner (a command's exit, a CI run), the review pipeline (an `after-gate` step), a separate session, or the owner.
4. **The author's own word** is never a gate step: `lc-gate enforcement` flags a `here` step in `gate_pr`.

Three rules hold throughout. No session records a check of its own work. A change is judged by the base branch's copy of the checks and step lists (`templates/ci/from-base.sh`). The files that define the rules change only in a PR the owner reads (`protected_files`).

The modes start at `observe 3`: the gate logs and tells until three PRs have merged with every record (counted from the merge hook's own marks, `gates/pr/<id>/merged.json`), then enforces without anyone editing the file, and the hook says so once. A project that wants refusals from the first PR writes `enforce`.

`lc-gate enforcement` prints one line per gate step and per layer: who records it, what refuses without it, and whether that layer is actually on. It reads the real state: the modes, `core.hooksPath` and the hook file, the plugin in Claude Code's settings, the branch protection through `gh api` (with a timeout, and a clear line when `gh` is missing, the host is unreachable or its plan doesn't allow protection), the workflows for the required checks, and the rule files against `protected_files`. `--strict` exits 1 when a layer the project configured is off; `--md` prints Markdown for the board or a PR. The bootstrap's Enforcement stage (`skills/bootstrap/enforcement.md`) sets each layer up and ends on `--strict`. For the template project, set up in a scratch repository:

| Layer | What | Recorded or set by | Refuses without it | State |
| --- | --- | --- | --- | --- |
| host refuses | required checks on main: verify-pr, pr-body | lc-gate protect, with the owner's host login | the merge, while a check is missing or red | on |
| host refuses | branch up to date before merge | lc-gate protect, with the owner's host login | a merge of a head not tested on the current base | on |
| host refuses | pull requests only | lc-gate protect, with the owner's host login | a push straight to the default branch | on |
| host refuses | administrators included | lc-gate protect, with the owner's host login | the owner's login (and every session using it) skipping the above | on |
| host refuses | no force push, no deletion | lc-gate protect, with the owner's host login | history rewritten under the records | on |
| host refuses | workflow for verify-pr | CI, on every pull request | a required check that never reports blocks every merge | on: .github/workflows/pr.yml |
| host refuses | workflow for pr-body | CI, on every pull request | a required check that never reports blocks every merge | on: .github/workflows/pr-body.yml |
| host refuses | checks judged by the base branch's copy | from-base.sh in the workflow | a pull request loosening the check, step list or mode that judges it | on: .github/workflows/pr-body.yml |
| local hook refuses | git pre-commit hook (core.hooksPath) | git, for every agent and person | a commit of planned files without the plan | on: .githooks/pre-commit |
| local hook refuses | Claude Code plugin hook | Claude Code, on this machine | an edit or commit without the plan; gh pr merge without the records | on |
| mode | gate_pr_mode | the project file | nothing yet: logged and told (observe) | observing, 0 of 3 |
| mode | gate_pr_plan | the project file | nothing yet: logged and told (observe) | observing, 0 of 3 |
| independent record | gate_pr commit-check: command `<cmd>` verify:commit | the runner, from the command's exit at the head | the hook at the gate start and at gh pr merge (observe: logged only) | on |
| independent record | gate_pr tool-fit: session docs/review/tool-fit.md if mechanism plan | a separate session lc-gate run starts | the hook at the gate start and at gh pr merge (observe: logged only) | on |
| local hook refuses | gate_pr tool-fit plan, before the first edit and commit | the author, before the work: a plan, which the step then checks | nothing yet: logged and told (observe) | on |
| independent record | gate_pr reviewer: session docs/review-checklist.md if sensitive | a separate session lc-gate run starts | the hook at the gate start and at gh pr merge (observe: logged only) | on |
| independent record | gate_pr review: command node .agents/ci/pipeline-passed.mjs review after-gate | the runner, from the review pipeline's result for the head | the hook at gh pr merge (observe: logged only) | on |
| independent record | gate_pr live-check: command node .agents/ci/pipeline-passed.mjs test if flow after-gate | the runner, from the review pipeline's result for the head | the hook at gh pr merge (observe: logged only) | on |
| owner reads | .agents/project.yaml, .githooks/pre-commit, .github/workflows/pr.yml and pr-body.yml, .agents/ci/from-base.sh, pipeline-passed.mjs and pr-body-check.mjs, docs/review/tool-fit.md, docs/review-checklist.md, docs/stack-decisions.md, stack-tools.md and stack-exceptions.md (one row each) | the owner, in a pull request of its own | nothing by itself: the base-copy checks name the change, and the owner reads it | on |

**What still escapes.** This is a set of tripwires, not a tamper-proof system:
- Sessions that share the owner's host login can do whatever the owner can, including changing the protection; "administrators included" only stops the settings being skipped silently.
- Records are files in the state directory, not signed: a session that forges its environment (`LC_GATE_STEP`) or writes a record file by hand is not caught by the gate itself.
- A record proves a review ran on that head, not that it was a good review.
- The plugin hook holds only where the plugin is enabled, and the git hook only in clones with `core.hooksPath` set.

A phase's id in `lc-gate run phase <id>` is its roadmap heading's name in lower case with dashes (`## Core journeys (current)` is `core-journeys`), as on the board; the CI check requires a phase marked done to link the record of that id.

**Testing strategy:**
- Browser E2E runs are the primary way to find bugs.
- Keep behaviour regressions at the lowest reliable level.
- Use focused lower-level tests for core and security invariants.

The `lifecycle` skill holds the full map of steps, roles and skills.

## Contents

| Path | What |
| --- | --- |
| `skills/lifecycle` | The map of steps, roles and gates; the finding format with its dispositions; the report format |
| `skills/shape-product` | Product scope and a phase's acceptance criteria |
| `skills/orchestrator`, `skills/implementer` | The lead (briefs, sessions, merges) and the session that builds one PR |
| `skills/pr-gate`, `skills/phase-exit` | Running each gate with `lc-gate`, and how to do its `here` steps |
| `skills/review` | A gate session: answer one question file, write the findings, record the step |
| `skills/board` | How every session uses the owner's board, and the keeper session that keeps it true |
| `skills/update-docs` | "Update the docs": one sweep that brings the domain docs and the lifecycle docs in line with what was decided and built |
| `skills/bootstrap` | A guided, resumable readiness check that takes a repository to ready (`checklist.md`) |
| `gate/`, `bin/lc-gate` | The gate runner: `run`, `record`, `status`, `check`, `plan-check`, the `hook` of `hooks/hooks.json`, and `enforcement` and `protect` (`gate/enforcement.mjs`) |
| `bin/lc-spawn`, `lc-close`, `lc-view` | Start, close and watch agent sessions in tmux |
| `board/`, `bin/lc-board` | The owner's local page: phases, journeys, changes and criteria from the roadmap, live PRs and sessions, and the open questions with a place to answer them |
| `templates/` | `project.yaml` with the gate blocks, the review question files (`review/*.md`), the gate brief, lifecycle, roadmap, acceptance criteria, testing, the phase exit's values and record, brief, watchdog prompt, CI for the pr, nightly and phase profiles, the PR body check, the base-copy wrapper and the review pipeline's result (`ci/`), the stack decisions, tools and exceptions (`review/stack-*.md`), the git `pre-commit` hook (`githooks/`) |
| `docs/adlc.png` | The diagram |

The skills invoke the [mattpocock-skills](https://github.com/mattpocock/skills) set (`grilling`, `domain-modeling`, `research`, `prototype`, `codebase-design`, `tdd`, `diagnosing-bugs`, `code-review`, `pr`, `writing-for-agents`). Install it alongside this kit.

## Install

**Claude Code** (plugin, versioned):

```
/plugin marketplace add <path to this clone, or owner/agent-lifecycle-kit>
/plugin install agent-lifecycle-kit@agent-lifecycle-kit
```

Skills are then named `agent-lifecycle-kit:<skill>`.

**Codex and the shell:** run `./install.sh`. It links `skills/*` into `~/.agents/skills` (which Codex reads) and `bin/lc-*` into `~/.local/bin`, and removes its links to skills the kit no longer has. It never overwrites an entry that isn't its own link; `./install.sh --uninstall` removes the links. Don't link the skills into `~/.claude/skills` as well, or Claude Code lists each one twice.

## A new repository

In a session in that repository, new or existing, invoke the `bootstrap` skill. It maps what the repository already has to the readiness checklist, shows what is present, incomplete or missing, and guides through each open item until the project is ready to start a phase, gate steps and question files included. It never overwrites a file; `.agents/project.yaml` points to the existing ones.

## From 1.0 to 1.1

- **No `here` step in `gate_pr`.** `lc-gate enforcement --strict` fails on one. Replace a self-review or live check done by the author with a `command … after-gate` step on the review pipeline's result (`templates/ci/pipeline-passed.mjs`), or a `session` step; a planned step becomes `session … plan` (`templates/review/tool-fit.md`), so a separate session checks the plan against the diff.
- **New keys:** `ci.required_checks`, `pr_body` (`heading`, `if`, `shapes`), `paths.mechanism`, `docs.stack_decisions`, `docs.stack_tools`, `docs.stack_exceptions`; the modes accept `observe <n>`. A file still on `observe` or `enforce` behaves as before.
- **CI:** the phase-record step runs through `.agents/ci/from-base.sh` (copy it from `templates/ci/`), and the new `pr-body.yml` checks the PR body's record. Add both to `ci.required_checks`, then `lc-gate protect`.
- **Phase exit:** a `stack` step with `templates/review/stack-hunt.md`; the architecture question file leaves the hunt to it.
- Rerun `bootstrap`: its Enforcement stage walks each of these and ends on `lc-gate enforcement --strict`.

## From 0.8

- **Skills merged, 23 into 10.** `phase-acceptance` is in `shape-product`; `agent-brief` in `orchestrator`; `commit-check` in `implementer`; `pr-check`, `live-check` and `pr-reviewer` in `pr-gate`; `phase-run` in `phase-exit`; the five `review-*`, `duplication-check` and `dead-code-check` in `review`, with their questions moved to `templates/review/*.md`; `board-keeper` in `board`. Run `./install.sh` again to drop the old links.
- **New project.yaml keys:** `gate_pr_mode`, `paths`, `gate_pr`, `gate_phase`. Copy the blocks from `templates/project.yaml` and the question files from `templates/review/` into the repo, or rerun `bootstrap`.
- **CI:** the phase workflow takes a `candidate` input and names it in its `run-name`; the PR workflow runs `lc-gate check phase --diff`.
- `docs.phase_review` now holds only the project's values; the record is generated by `lc-gate status phase <id> --write` into `docs.phase_records`.

## Machine-specific pieces

Opening a terminal tab on a new session depends on the machine. Set `LC_OPEN_TAB` in your shell profile to a command that receives the window name as `$1` (for example one that opens a terminal running `lc-view "$1"`). Nothing machine-specific belongs in this repository or in a project file.
