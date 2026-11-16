---
name: lifecycle
description: The agent-driven development lifecycle and which skill fires at each step. Use at the start of any session in a repository that has `.agents/project.yaml`, or when unsure which step you are in or which skill applies.
---

# Agent-driven development lifecycle

The project's values (doc paths, commands, protected and pinned files, sensitive paths, lanes) are in `.agents/project.yaml`. Read it first; this skill and every skill of this kit refer to its keys as `docs.testing`, `profiles.pr` and so on. The project's own `docs.lifecycle` page says how each step is done there; where it says more than this skill, it wins.

## Work breakdown

Product requirements (`docs.product`, `docs.stories`) → user stories → **phases** (`docs.roadmap`) → pull requests → commits. A **phase** is the unit with one exit and one review. It goes to the orchestrator.

## Roles

- **Owner:** a person. Decides product meaning, scope, access, spend and authority, and reads every protected-file change.
- **Orchestrator:** one session per phase. Cuts the phase into PRs, briefs sessions, routes reviews, merges and keeps the running log. Skill: `orchestrator`.
- **Implementer:** one full session per PR, which may use its own subagents. Skill: `implementer`.
- **Checking roles:** `pr-reviewer`, `live-check`, `phase-run`, `duplication-check`, `dead-code-check`, and the phase-review dimensions `review-owners-layers`, `review-reuse`, `review-types-boundaries`, `review-effects-security` and `review-docs-tests`.

**Messages.** Sessions report status and questions to the orchestrator. Peers may message each other to coordinate (file ownership, lanes, review findings). Anything that changes scope, a product rule or the plan goes to the orchestrator, who is told the outcome of every peer agreement.

## Gates, in order

1. **Commit check**, before each push or hand-over to review: `profiles.commit` (typecheck plus the specs covering the changed files). Skill: `commit-check`.
2. **PR check:** live check of the changed flow, review, CI (`profiles.pr`), then merge once review and CI pass. Skill: `pr-check`.
3. **Phase exit:** freeze a candidate, run the phase run (`profiles.phase`), review the phase diff by dimension, fix the findings in batched PRs and rerun the affected flows. The phase is closed only after all of that passes; the next phase's building may start before then. Skill: `phase-exit`.

**Nightly:** `profiles.nightly` on the main branch. It must be green and start on time; a failure becomes an issue the same morning.

## Testing strategy

- Browser end-to-end runs are the primary way to verify and to find bugs.
- Write tests for observable behaviour and regressions. Keep implementation-level tests for core behaviour and security invariants.
- Every bug found live gets a regression step in the phase run.
- Dependencies are checked for supply-chain risk (`checks.supply_chain`).

## Which skill fires when

| Step | Kit skill | Base skills it invokes |
| --- | --- | --- |
| Changing product requirements, stories, a phase's scope | `shape-product` | `grilling`, `domain-modeling`, `research` |
| Cutting a phase and planning its PRs | `cut-phase` | `codebase-design`, `prototype`, `writing-for-agents` |
| Implementing a PR | `implementer` | `tdd`, `diagnosing-bugs`, `codebase-design` |
| Before a push | `commit-check` | none |
| PR check | `pr-check`, `live-check`, `pr-reviewer` | `code-review`, `pr` |
| Phase exit | `phase-exit`, `phase-run`, the review roles | `code-review`, `codebase-design`, `diagnosing-bugs`, `domain-modeling` |
| New repository | `bootstrap` | `grilling` |

Base skills are the `mattpocock-skills` set: `mattpocock-skills:<name>` in Claude Code, or the bare `<name>` where they are installed as user skills (Codex reads `~/.agents/skills`).

## Shared reference

- [finding.md](finding.md): the one finding format every review uses.
- [report.md](report.md): the report a session sends when it is done or blocked.
