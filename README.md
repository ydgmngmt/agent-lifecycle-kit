# agent-lifecycle-kit

A way of working for agent-driven software development, packaged as skills, tools and templates. It knows nothing about any one project; each repository keeps its own values in `.agents/project.yaml`.

## The lifecycle

**Work breakdown:** product requirements → user stories → phases → pull requests → commits.

**Coordination:** a phase goes to one orchestrator session. It starts one full session per PR (implementers), each of which may use its own subagents. Sessions report status and questions to the orchestrator. Peers coordinate directly, and decisions go up.

**Verification gates, in order:**
1. **Commit check**, before each push: typecheck and the specs covering the changed files.
2. **PR check:** live check of the changed flow, review (a reviewer session on sensitive paths), CI, and merge once review and CI pass.
3. **Phase exit:** freeze a candidate; run the browser journeys on a fresh stack plus the other suites; review the phase diff by dimension; fix the findings in batched PRs and rerun the affected flows; then close the phase.

**Testing strategy:** browser end-to-end runs first; tests for observable behaviour and regressions; implementation-level tests for core behaviour and security invariants; a regression step for every bug found live; a supply-chain check on dependencies.

The `lifecycle` skill holds the full map of steps, roles and skills.

## Contents

| Path | What |
| --- | --- |
| `skills/lifecycle` | The lifecycle, the shared finding format and the report format |
| `skills/{shape-product,cut-phase,commit-check,pr-check,phase-exit}` | One skill per step |
| `skills/{orchestrator,implementer,live-check,pr-reviewer,phase-run}` | Coordinating and checking roles |
| `skills/review-*`, `skills/{duplication,dead-code}-check` | Phase-review dimensions and quality checks |
| `skills/bootstrap` | Sets a repository up from the templates |
| `bin/lc-spawn`, `lc-close`, `lc-view` | Start, close and watch agent sessions in tmux |
| `templates/` | `project.yaml`, lifecycle, roadmap, testing, phase review, brief, watchdog prompt and running log, CI profiles |

The step and role skills invoke the [mattpocock-skills](https://github.com/mattpocock/skills) set (`grilling`, `domain-modeling`, `research`, `prototype`, `codebase-design`, `tdd`, `diagnosing-bugs`, `code-review`, `pr`, `writing-for-agents`). Install it alongside this kit.

## Install

**Claude Code** (plugin, versioned):

```
/plugin marketplace add <path to this clone, or owner/agent-lifecycle-kit>
/plugin install agent-lifecycle-kit@agent-lifecycle-kit
```

Skills are then named `agent-lifecycle-kit:<skill>`.

**Codex and the shell:** run `./install.sh`. It links `skills/*` into `~/.agents/skills` (which Codex reads) and `bin/lc-*` into `~/.local/bin`. It never overwrites an entry that isn't its own link; `./install.sh --uninstall` removes the links. Don't link the skills into `~/.claude/skills` as well, or Claude Code lists each one twice.

## A new repository

In a session in that repository, invoke the `bootstrap` skill. It reads the repository, asks only what it can't derive, writes `.agents/project.yaml`, adds the docs and the four `verify:*` profiles, and points CI at them.

## Machine-specific pieces

Opening a terminal tab on a new session depends on the machine. Set `LC_OPEN_TAB` in your shell profile to a command that receives the window name as `$1` (for example one that opens a terminal running `lc-view "$1"`). Nothing machine-specific belongs in this repository or in a project file.
