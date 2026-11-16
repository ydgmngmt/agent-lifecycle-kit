---
name: lifecycle
description: ADLC (agent-driven development lifecycle) and which skill fires at each step. Use at the start of any session in a repository that has `.agents/project.yaml`, or when unsure which step you are in or which skill applies.
---

# ADLC (agent-driven development lifecycle)

The diagram is [docs/adlc.png](../../docs/adlc.png). The project's values (doc paths, commands, protected files, owner-approval paths, sensitive paths, lanes) are in `.agents/project.yaml`. Read it first; every skill of this kit refers to its keys as `docs.testing`, `profiles.pr` and so on. A value is either literal or a pointer to the repo file that holds it (`path#section`, with a note on what to read there). Follow the pointer and use what the file says; the file is the source of truth, never a copy. The project's `docs.lifecycle` page says how each step is done there; where it says more than this skill, it wins.

## Steps

1. **Product scope:** product requirements → user stories → phases (`docs.roadmap`). Skill: `shape-product`.
2. **Phase acceptance:** agree on the phase's user outcomes, failure cases and invariants. These are its acceptance criteria, and the phase exits on them. Skill: `phase-acceptance`.
3. **Agent brief:** scope one small, mergeable change and name its owner. Skill: `agent-brief`.
4. **Parallel implementation:** the orchestrator assigns each brief to a session (a terminal) in its own worktree. A session may spawn subagents and coordinates shared files with its peers before editing them. Skills: `orchestrator`, `implementer`.
5. **Verification gates**, below. A fix found at any gate loops back to implementation and is retested.

## Roles

- **Owner:** a person. Decides product meaning, scope, access, spend and authority. Approves every change to the protected files the project file lists under `owner_approval`.
- **Orchestrator:** one session per phase. Assigns work, routes reviews, merges, runs the watchdog and keeps the running log.
- **Implementer:** one session per brief, which may use its own subagents.
- **Checking roles:** `pr-reviewer`, `live-check`, `phase-run`, `duplication-check`, `dead-code-check`, and the phase-review dimensions `review-owners-layers`, `review-reuse`, `review-types-boundaries`, `review-effects-security` and `review-docs-tests`.

**Messages.** Status and questions go up to the orchestrator. Peers message each other to coordinate (shared files, lanes, review findings). Anything that changes scope, a product rule or the plan goes to the orchestrator, who is told the outcome of every peer agreement.

## Verification gates

1. **Commit:** typecheck and run the targeted behaviour tests (`profiles.commit`), before each push. Skill: `commit-check`.
2. **Pull request and protected merge.** Skill: `pr-check`.
   - **Changed flow:** exercise the affected behaviour in the browser or the live API.
   - **PR CI:** build, typecheck, lint, unit tests, boundaries and API contracts; quality baselines (dead code, duplication) and dependency scanning (`profiles.pr`, `ci.pr_checks`).
   - **Review:** an independent review of the change and its test evidence.
   - **Sensitive changes:** approval by the role the project file names, and targeted tests for the affected invariants. That role is the human owner for protected files (`owner_approval`) and an independent reviewer session for sensitive code paths (`sensitive`). The orchestrator reports each reviewer-session approval to the owner.
   - **Merge candidate:** the required checks pass with the PR applied to the current main (`merge.candidate`).
3. **Nightly on main:** the full integration suite (`profiles.nightly`), after all of a phase's PRs merge and every night. It must be green and start on time.
4. **Phase exit.** Skill: `phase-exit`.
   - **Browser E2E:** freeze the merged commit and run the phase journeys on a fresh stack.
   - **Evidence:** pass or fail for each acceptance criterion, with traces and the commit SHA.
   - **Other checks:** replay the API tests; check navigation speed and data volume.
   - **Phase review:** architecture, reuse, security and quality across the merged PRs.
   - **Disposition:** a failed exit criterion blocks the phase. Other findings are tracked as follow-up PRs and don't block. Each bug found live adds a regression check.
   - Once the exit criteria pass, the next phase starts.

## Testing strategy

- Browser E2E runs are the primary way to find bugs.
- Keep behaviour regressions at the lowest reliable level.
- Use focused lower-level tests for core and security invariants.

## Which skill fires when

| Step | Kit skill | Base skills it invokes |
| --- | --- | --- |
| Product scope | `shape-product` | `grilling`, `domain-modeling`, `research` |
| Phase acceptance | `phase-acceptance` | `grilling`, `domain-modeling` |
| Agent brief | `agent-brief` | `writing-for-agents`, `codebase-design`, `prototype` |
| Implementation | `implementer` | `tdd`, `diagnosing-bugs`, `codebase-design` |
| Commit | `commit-check` | none |
| Pull request | `pr-check`, `live-check`, `pr-reviewer` | `code-review`, `pr` |
| Phase exit | `phase-exit`, `phase-run`, the review skills | `code-review`, `codebase-design`, `diagnosing-bugs`, `domain-modeling` |
| Coordination | `orchestrator` | `writing-for-agents`, `grilling` |
| New repository | `bootstrap` | `grilling` |

Base skills are the `mattpocock-skills` set: `mattpocock-skills:<name>` in Claude Code, or the bare `<name>` where they are installed as user skills (Codex reads `~/.agents/skills`).

## Shared reference

- [finding.md](finding.md): the one finding format every review uses, and the dispositions.
- [report.md](report.md): the report a session sends when it is done or blocked.
