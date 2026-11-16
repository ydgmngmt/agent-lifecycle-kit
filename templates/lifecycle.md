# Way of working

How work on <project name> runs, from product requirements to a closed phase. This page owns the sequence and who does what. Each step links to the doc that owns its detail. The skills of the agent-lifecycle-kit fire at each step; the project's values are in [`.agents/project.yaml`](../../.agents/project.yaml).

## Work breakdown

[Product](<product doc>) → [user stories](<stories>) → phases ([roadmap](<roadmap>)) → pull requests → commits. A **phase** is the unit with one exit and one review.

## Who does what

- **Owner:** decides product meaning, scope, access, spend and authority, and reads every change to a protected file.
- **Orchestrator:** one session per phase. Plans the PRs, briefs sessions, routes reviews, merges and keeps the running log ([orchestration](<orchestration>)).
- **Implementer:** one full session per PR, which may use its own subagents.
- **Reviewer session:** one per PR on a sensitive path, never the implementer.
- **Phase-review sessions:** one per dimension at phase exit.

Sessions report to the orchestrator. Peers coordinate directly; anything that changes scope, a product rule or the plan goes to the orchestrator.

## Steps

| Step | Who | Detail | Skill |
| --- | --- | --- | --- |
| Product requirements, stories, a phase's scope | owner with the orchestrator | [product](<product doc>), [glossary](<glossary>) | `shape-product` |
| Cut a phase: roadmap entry, exit criteria, PRs, briefs | orchestrator | [roadmap](<roadmap>), [orchestration](<orchestration>) | `cut-phase` |
| Implement a PR | implementer | [testing](<testing>), [code map](<code map>) | `implementer` |
| Commit check, before each push | implementer | `verify:commit`, [testing](<testing>) | `commit-check` |
| PR check: live check, review, CI, gate | implementer, reviewer session | [review checklist](<checklist>), [gate runbook](<runbook>) | `pr-check`, `live-check`, `pr-reviewer` |
| Merge | orchestrator | [orchestration](<orchestration>) | `orchestrator` |
| Phase exit: candidate, phase run, review, fixes, close | lead and phase-review sessions | [phase review](<phase review>) | `phase-exit`, `phase-run`, the review skills |

## Verification profiles

| Profile | When | Command |
| --- | --- | --- |
| commit | before each push | `verify:commit` |
| PR | every PR, in CI | `verify:pr`, plus <other PR checks> |
| phase | phase exit | `verify:phase` |
| nightly | each night on main | `verify:nightly` |
