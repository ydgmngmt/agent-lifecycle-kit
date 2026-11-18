---
name: lifecycle
description: ADLC (agent-driven development lifecycle) map: its steps, roles and gates, and which skill fires at each. Use at the start of any session in a repository that has `.agents/project.yaml`, or when unsure which step you are in or which skill applies.
---

# ADLC (agent-driven development lifecycle)

Diagram: [docs/adlc.png](../../docs/adlc.png). Read `.agents/project.yaml` first; skills name its keys as `docs.testing`, `profiles.pr`. A value is literal or a pointer (`path#section`) to the repo file that holds it: follow the pointer, never copy. Where the project's `docs.lifecycle` page says more than this skill, it wins.

## Steps

1. **Product scope:** requirements → stories → phases (`docs.roadmap`), then each phase's acceptance criteria. `shape-product`.
2. **Briefs:** one small, mergeable change each, with a named owner. `orchestrator`.
3. **Implementation:** one session per brief in its own worktree; it coordinates shared files with its peers before editing them. `implementer`.
4. **PR gate**, per change. `pr-gate`.
5. **Nightly on main:** `profiles.nightly`, green and on time.
6. **Phase exit**, once a phase's PRs have merged. `phase-exit`. Then the next phase starts.

A fix found at any gate loops back to implementation and is retested.

## Gates

`gate_pr:` and `gate_phase:` in the project file declare each gate's steps, one line each (`<step>: <kind> <argument> [if <paths key>]`); the order lives there only. `lc-gate` walks the list; each step leaves a record (PASS, FAIL, or N/A with a reason) bound to the candidate commit, and `lc-gate check` refuses while one is missing, stale or failed.

| Kind | Who does it |
| --- | --- |
| `command` | the runner runs it and records its exit |
| `workflow` | the runner starts the CI workflow and records the run |
| `session` | the runner spawns a session (`review`) on `sessions.gate_model`; it records its own step |
| `here` | the session running the gate |
| `owner` | a board question; the owner's answer is the record |

- `lc-gate run <pr|phase> <id>` does the next thing for each step without a record; rerun to advance. It reports a started session with no activity for 60 seconds.
- `lc-gate status <gate> <id>`: one row per step. Read it before saying anything about a gate.
- `gate_pr_mode`, `gate_pr_plan` (`off`, `observe`, `observe <n>`, `enforce`): whether a missing PR record or plan warns or refuses; `observe <n>` enforces once n PRs merged with every record.
- `lc-gate enforcement`: what refuses without each step, and whether each layer is on. Read it before calling a gate binding.

## Roles

- **Owner:** a person. Decides product meaning, scope, access, spend and authority; approves `owner_approval` changes; accepts each phase.
- **Orchestrator (the lead):** one session per phase. Briefs, starts sessions, merges, keeps the running log. Only the lead records N/A or carries a record.
- **Implementer:** one session per brief.
- **Gate sessions:** each started by `lc-gate run` with one question file.
- **Board keeper:** a cheap session that keeps the board true (`board`).

Status and questions go to the orchestrator. Peers settle shared files, lanes and findings between them and tell the orchestrator the outcome; anything changing scope, a product rule or the plan goes to the orchestrator.

## What enforces the gates

Say plainly which gate the host enforces (required checks, "up to date with main", a merge queue; a rule admins may bypass enforces nothing when agents use an admin's token) and which holds only by its records; check `ci.enforcement` first. CI runs `lc-gate check phase --diff`, so a phase can't be marked done without its record. A record shows a step ran, not that its result is right.

## Which skill fires when

| Step | Kit skill | Base skills |
| --- | --- | --- |
| Product scope, criteria | `shape-product` | `grilling`, `domain-modeling`, `research` |
| Briefs, sessions, merges | `orchestrator` | `writing-for-agents`, `codebase-design`, `prototype`, `grilling` |
| Implementation | `implementer` | `tdd`, `diagnosing-bugs`, `codebase-design` |
| PR gate | `pr-gate` | `code-review`, `pr`, `diagnosing-bugs` |
| Gate session | `review` | `code-review`, `codebase-design`, `diagnosing-bugs`, `domain-modeling` |
| Phase exit | `phase-exit` | `diagnosing-bugs` |
| New repository | `bootstrap` | `grilling` |
| "Update the docs" | `update-docs` | `domain-modeling` |
| Board | `board` | none |

Base skills are `mattpocock-skills:<name>` in Claude Code, or the bare `<name>` where installed as user skills (Codex reads `~/.agents/skills`). Shared: [finding.md](finding.md) (the finding format and dispositions), [report.md](report.md) (a session's done or blocked report).
