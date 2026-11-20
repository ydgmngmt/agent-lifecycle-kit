# agent-lifecycle-kit

**Agent-driven development, with gates.** Coding agents plan, build, review and merge. Good documents alone do not keep them on course: agents given a sound plan, an architecture and written principles still drift, each change looking reasonable on its own. This kit is an agent-driven development lifecycle (ADLC) that a repository installs, and it adds the two parts that were missing:

- **An orchestrator.** One lead session splits a phase of the plan into pull requests, starts an agent session for each with a short brief, and keeps a board the owner watches.
- **Review gates.** A change lands only when independent checks show it is good code and does what the plan and the project's decisions say. Every pull request passes the project's exact rules, a check that the chosen tools are used, and an independent review. Every phase ends with independent sessions reviewing the whole, then the owner's acceptance.

The owner decides and accepts; the agents do the rest. The kit knows nothing about any one project: each repository keeps its own values, gate steps included, in `.agents/project.yaml`.

![Agent-driven development lifecycle](docs/adlc.png)

## Proof

![Without the kit and with it](docs/proof.svg)

One real product was built by agents that had a plan, an architecture and written principles, and they still wrote their own code beside the tools they were told to use. Put through the gates, none of those changes would merge. This is work in progress, with more red-team rounds to come: [method, cases and limits](docs/proof.md).

## What it does, and why

| Step | What happens | Why |
| --- | --- | --- |
| Product scope | The owner and an agent turn requirements into phases, each with acceptance criteria. | "Done" is written down before any code. |
| Briefs | The orchestrator cuts a phase into small changes, one brief each. | A small change can be reviewed, and a session with one job stays on it. |
| Implementation | One agent session per brief, in its own worktree. | Sessions do not trip over each other. |
| PR gate | Exact rules, a check that the chosen tools are used, and an independent review. Each step leaves a record tied to the commit; no record, no merge. | An agent cannot call its own work good. |
| Nightly | The full test run on the main branch. | Slow checks still run without holding up every change. |
| Phase exit | Independent sessions review the whole phase against its criteria, then the owner accepts. | Some defects only show where changes meet, and a person says the phase is done. |
| Lessons | A finding the reviews keep raising becomes an exact rule; the owner decides. | The gates get stricter with use. |

## Install

**Claude Code** (plugin; skills are then named `agent-lifecycle-kit:<skill>`):

```
/plugin marketplace add <path to this clone, or owner/agent-lifecycle-kit>
/plugin install agent-lifecycle-kit@agent-lifecycle-kit
```

**Codex and the shell:** `./install.sh` links the skills into `~/.agents/skills` and `bin/lc-*` into `~/.local/bin`; `--uninstall` removes them. Don't also link the skills into `~/.claude/skills`.

The skills call the [mattpocock-skills](https://github.com/mattpocock/skills) set; install it alongside.

## A new repository

1. **`bootstrap`** (the skill, in a session in that repository): maps what it already has to the readiness checklist and guides through each open item. It never overwrites a file.
2. **`lc-gate enforcement`**: one line per gate step and layer, saying who records it, what refuses without it, and whether that is actually on. `--strict` exits 1 when a configured layer is off.
3. **`lc-gate protect`**: prints the branch protection for `ci.required_checks`; `--yes` applies it. It only ever adds.

Per pull request: `lc-pr open` writes the body from the template, `lc-gate run pr` walks the gate until `lc-gate check pr` holds, and `lc-gate merge pr` merges, one at a time. The full list is in [Enforcement](docs/enforcement.md#the-commands).

**Mechanical rules.** What the project decided and a diff can break exactly (who may import a package, which dependencies are allowed, words or files that may not appear) becomes a rule in `.agents/rules.yaml`. Each rule names its written decision and is proved on a red and a green example; `lc-rules check` fails a finding beyond the baseline, and CI judges each change by the base commit's rules. The bootstrap writes the first ones; the phase exit proposes more from findings the reviews keep raising, and the owner decides.

## What enforces what

| Strength | Who | What it refuses |
| --- | --- | --- |
| Host refuses | Branch protection set by `lc-gate protect` | A merge while a required check is red or missing, a push to the default branch, administrators skipping either |
| Local hook refuses | The plugin hook and the git `pre-commit` hook | An edit or commit without its plan, a merge without the PR gate's records |
| Independent record | The runner, a CI run, the host's checks, a separate session or the owner | A step its author wants to mark done on their own word |
| Owner reads | The owner, in a pull request of its own, for the files in `protected_files` | A change loosening the rules that judge it; CI judges each change by the base branch's copy |
| Author's own word | Nobody: never a gate step | Nothing; `lc-gate enforcement` flags it |

## What still escapes

- Sessions that share the owner's host login can do whatever the owner can, including changing the protection.
- Records are unsigned files: a session that forges its environment or writes a record by hand is not caught, and a record proves a review ran, not that it was good.
- The hooks hold only where they are installed: the plugin where it is enabled, the git hook where `core.hooksPath` is set.

## More

- [Enforcement](docs/enforcement.md): the model, the modes, the step syntax, the commands
- [Upgrading](docs/upgrading.md): each release since 0.8
- [Machine-specific pieces](docs/machine.md)
- [Proof](docs/proof.md): method, cases and limits
- [The lifecycle skill](skills/lifecycle/SKILL.md): steps, roles and gates
- [The readiness checklist](skills/bootstrap/checklist.md) and [the project file template](templates/project.yaml)
- [License](LICENSE)
