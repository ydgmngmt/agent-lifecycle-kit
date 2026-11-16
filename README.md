# agent-lifecycle-kit: ADLC

**ADLC (agent-driven development lifecycle)**, packaged as skills, tools and templates. The kit knows nothing about any one project; each repository keeps its own values in `.agents/project.yaml`.

![Agent-driven development lifecycle](docs/adlc.png)

## The lifecycle

1. **Product scope:** PRD → user stories → phases.
2. **Phase acceptance:** agree on the phase's user outcomes, failure cases and invariants. These are its acceptance criteria.
3. **Agent brief:** scope one small, mergeable change and name its owner.
4. **Parallel implementation:** an orchestrator session assigns briefs to agent sessions (10+ at peak), each in its own worktree and able to spawn subagents. Status and questions go up; peers coordinate shared files before editing them.
5. **Verification gates**; a fix at any gate loops back to implementation:
   - **Commit:** typecheck and run the targeted behaviour tests.
   - **Pull request and protected merge:**
     - **Changed flow:** exercised in the browser or the live API.
     - **PR CI:** build, typecheck, lint, unit tests, boundaries, API contracts, quality baselines and dependency scanning.
     - **Review:** an independent review of the change and its test evidence.
     - **Sensitive changes:** approval by the role the project file names (the human owner for protected files, an independent reviewer session for sensitive code paths) and targeted tests for the affected invariants.
     - **Merge candidate:** the required checks pass with the PR applied to the current main.
   - **Nightly on main:** the full integration suite.
   - **Phase exit:**
     - **Browser E2E:** the phase journeys on a fresh stack at the frozen merged commit.
     - **Evidence:** pass or fail per acceptance criterion, with traces and the SHA.
     - **Other checks:** API replay, navigation speed and data volume.
     - **Phase review:** architecture, reuse, security and quality across the merged PRs.
     - **Disposition:** failed exit criteria block; other findings become follow-up PRs; each bug found live adds a regression check.
6. Once the exit criteria pass, the **next phase** starts.

**Testing strategy:**
- Browser E2E runs are the primary way to find bugs.
- Keep behaviour regressions at the lowest reliable level.
- Use focused lower-level tests for core and security invariants.

The `lifecycle` skill holds the full map of steps, roles and skills.

## Contents

| Path | What |
| --- | --- |
| `skills/lifecycle` | The lifecycle, the finding format with its dispositions, and the report format |
| `skills/{shape-product,phase-acceptance,agent-brief,commit-check,pr-check,phase-exit}` | One skill per step |
| `skills/{orchestrator,implementer,live-check,pr-reviewer,phase-run}` | Coordinating and checking roles |
| `skills/review-*`, `skills/{duplication,dead-code}-check` | Phase-review dimensions and quality checks |
| `skills/bootstrap` | A guided, resumable readiness check that takes a repository to ready (`checklist.md`) |
| `bin/lc-spawn`, `lc-close`, `lc-view` | Start, close and watch agent sessions in tmux |
| `board/`, `bin/lc-board` | The owner's local page: phases, journeys, changes and criteria from the roadmap, live PRs and sessions, and the open questions with a place to answer them |
| `templates/` | `project.yaml`, lifecycle, roadmap, acceptance criteria, testing, phase exit, brief, watchdog prompt and running log, CI for the pr, nightly and phase profiles |
| `docs/adlc.png` | The diagram |

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

In a session in that repository, new or existing, invoke the `bootstrap` skill. It maps what the repository already has to the readiness checklist, shows what is present, incomplete or missing, and guides through each open item until the project is ready to start a phase. It never overwrites a file; `.agents/project.yaml` points to the existing ones.

## Machine-specific pieces

Opening a terminal tab on a new session depends on the machine. Set `LC_OPEN_TAB` in your shell profile to a command that receives the window name as `$1` (for example one that opens a terminal running `lc-view "$1"`). Nothing machine-specific belongs in this repository or in a project file.
