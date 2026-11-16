# Way of working (ADLC)

How work on <project name> runs, from product scope to the next phase. This page owns the sequence and who does what; each step links to the doc that owns its detail. The skills of the agent-lifecycle-kit fire at each step, and the project's values are in [`.agents/project.yaml`](../../.agents/project.yaml).

![Agent-driven development lifecycle](adlc.png)

## Steps

| Step | Who | Detail | Skill |
| --- | --- | --- | --- |
| **Product scope:** PRD → user stories → phases | owner with the orchestrator | [product](<product doc>), [stories](<stories>), [roadmap](<roadmap>) | `shape-product` |
| **Phase acceptance:** user outcomes, failure cases, invariants | owner with the orchestrator | [roadmap](<roadmap>) | `phase-acceptance` |
| **Agent brief:** one small, mergeable change with a named owner | orchestrator | [orchestration](<orchestration>) | `agent-brief` |
| **Parallel implementation:** one session and worktree per change | implementer | [testing](<testing>), [code map](<code map>) | `implementer` |
| **Commit:** typecheck and targeted behaviour tests, before each push | implementer | `verify:commit` | `commit-check` |
| **Pull request and protected merge:** changed flow, PR CI, review, sensitive changes, merge candidate | implementer, reviewer session, owner, orchestrator | [review checklist](<checklist>), [gate runbook](<runbook>) | `pr-check`, `live-check`, `pr-reviewer` |
| **Nightly on main:** full integration suite | CI | `verify:nightly` | none |
| **Phase exit:** browser E2E, evidence per criterion, other checks, phase review, disposition | lead and phase-review sessions | [phase review](<phase review>) | `phase-exit`, `phase-run`, the review skills |

## Who does what

- **Owner:** decides product meaning, scope, access, spend and authority; agrees each phase's acceptance criteria; approves changes to protected files (`owner_approval`). Each reviewer-session approval of a sensitive code path is reported to the owner.
- **Orchestrator:** one session per phase. Assigns briefs, routes reviews, merges merge candidates and keeps the running log ([orchestration](<orchestration>)).
- **Implementer:** one session per change, which may use its own subagents.
- **Reviewer session:** one per PR on a sensitive code path, never the implementer; its approval is the merge approval for that path.
- **Phase-review sessions:** one per dimension at phase exit.

Status and questions go to the orchestrator. Peers coordinate shared files before editing them; anything that changes scope, a product rule or the plan goes to the orchestrator.

## Verification profiles

| Profile | When | Command |
| --- | --- | --- |
| commit | before each push | `verify:commit` |
| PR | every PR, in CI | `verify:pr`, plus <other PR checks> |
| phase | phase exit | `verify:phase` |
| nightly | each night on main | `verify:nightly` |
