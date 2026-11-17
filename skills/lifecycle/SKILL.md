---
name: lifecycle
description: ADLC (agent-driven development lifecycle) map: its steps, roles and gates, and which skill fires at each. Use at the start of any session in a repository that has `.agents/project.yaml`, or when unsure which step you are in or which skill applies.
---

# ADLC (agent-driven development lifecycle)

The diagram is [docs/adlc.png](../../docs/adlc.png). The project's values (doc paths, commands, protected files, owner-approval paths, sensitive paths, lanes, gate steps) are in `.agents/project.yaml`. Read it first; every skill of this kit refers to its keys as `docs.testing`, `profiles.pr` and so on. A value is either literal or a pointer to the repo file that holds it (`path#section`, with a note on what to read there). Follow the pointer; the file is the source of truth, never a copy. The project's `docs.lifecycle` page says how each step is done there; where it says more than this skill, it wins.

## Steps

1. **Product scope:** product requirements → user stories → phases (`docs.roadmap`), then each phase's acceptance criteria (user outcomes, failure cases, invariants). Skill: `shape-product`.
2. **Briefs:** one small, mergeable change per brief, with a named owner. Skill: `orchestrator`.
3. **Parallel implementation:** one session per brief, in its own worktree, which may spawn subagents and coordinates shared files with its peers before editing them. Skill: `implementer`.
4. **PR gate**, per change. Skill: `pr-gate`.
5. **Nightly on main:** the full integration suite (`profiles.nightly`). It must be green and start on time.
6. **Phase exit**, once a phase's PRs have merged. Skill: `phase-exit`. Once it exits, the next phase starts.

A fix found at any gate loops back to implementation and is retested.

## Gates

A gate is a step list the project declares: `gate_pr:` and `gate_phase:` in `.agents/project.yaml`, one line per step (`<step>: <kind> <argument> [if <paths key>]`). The order and the steps live there and nowhere else. The runner `lc-gate` walks the list; every step leaves a record (PASS, FAIL, or N/A with a reason) bound to the candidate commit, and `lc-gate check` refuses while one is missing, stale or failed.

| Kind | Who does it |
| --- | --- |
| `command` | the runner runs it and records its exit |
| `workflow` | the runner starts the CI workflow and records the run |
| `session` | the runner spawns a session with a brief; it follows `review` and records its own step |
| `here` | the session running the gate does it and records it |
| `owner` | a board question; the owner's answer is the record |

- `lc-gate run <pr|phase> <id>`: does the next thing for each step without a record. Rerun to advance.
- `lc-gate status <gate> <id>`: one row per step. Read it before saying anything about a gate.
- `gate_pr_mode` (`off`, `observe`, `enforce`) says whether a missing PR record only warns or refuses.

## Roles

- **Owner:** a person. Decides product meaning, scope, access, spend and authority. Approves every change to the protected files under `owner_approval`, and accepts each phase.
- **Orchestrator (the lead):** one session per phase. Briefs, starts sessions, merges, keeps the running log. Only the lead records N/A or carries a record.
- **Implementer:** one session per brief.
- **Gate sessions:** the reviewer of a sensitive PR and the phase-exit reviews, each started by `lc-gate run` with one question file.
- **Board keeper:** a cheap session that keeps the owner's board true (`board`).

**Messages.** Status and questions go up to the orchestrator. Peers message each other to coordinate (shared files, lanes, review findings). Anything that changes scope, a product rule or the plan goes to the orchestrator, who is told the outcome of every peer agreement.

## What enforces the gates

Say plainly which gate the host enforces and which holds only by the runner's records; never call a gate enforced without having checked the host's settings.
- **Host-enforced, where the plan allows it:** required status checks and "up to date with main" on the default branch, a merge queue, no force-push or deletion. A rule that admins may bypass enforces nothing when agents use an admin's token.
- **Recorded:** every gate step. `lc-gate check` refuses a missing record; CI runs `lc-gate check phase --diff` so a phase can't be marked done without its record. A record is evidence that a step ran, not that its result is right.

The project file records which is which (`ci.enforcement`).

## Testing strategy

- Browser E2E runs are the primary way to find bugs.
- Keep behaviour regressions at the lowest reliable level.
- Use focused lower-level tests for core and security invariants.

## Which skill fires when

| Step | Kit skill | Base skills it invokes |
| --- | --- | --- |
| Product scope, acceptance criteria | `shape-product` | `grilling`, `domain-modeling`, `research` |
| Briefs, sessions, merges | `orchestrator` | `writing-for-agents`, `codebase-design`, `prototype`, `grilling` |
| Implementation | `implementer` | `tdd`, `diagnosing-bugs`, `codebase-design` |
| PR gate | `pr-gate` | `code-review`, `pr`, `diagnosing-bugs` |
| A gate session | `review` | `code-review`, `codebase-design`, `diagnosing-bugs`, `domain-modeling` |
| Phase exit | `phase-exit` | `diagnosing-bugs` |
| New repository | `bootstrap` | `grilling` |
| "Update the docs" | `update-docs` | `domain-modeling` |
| Board, keeper | `board` | none |

Base skills are the `mattpocock-skills` set: `mattpocock-skills:<name>` in Claude Code, or the bare `<name>` where they are installed as user skills (Codex reads `~/.agents/skills`).

## Shared reference

- [finding.md](finding.md): the one finding format every review uses, and the dispositions.
- [report.md](report.md): the report a session sends when it is done or blocked.
