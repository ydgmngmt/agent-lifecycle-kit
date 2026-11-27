# Way of working (ADLC)

How work on <project name> runs, from product scope to the next stage. This page owns the sequence and who does what; each step links to the doc that owns its detail. The build runs on pstack through the agent-lifecycle-kit's `adlc-mode`, and the project's values, including the stage exit's steps (`gate_pr`), are in [`.agents/project.yaml`](../../.agents/project.yaml).

![Agent-driven development lifecycle](adlc.svg)

## Steps

| Step | Who | Detail | Skill |
| --- | --- | --- | --- |
| **Plan:** PRD → user stories → stages, each stage's acceptance criteria, then its pull requests | owner with the lead | [product](<product doc>), [stories](<stories>), [roadmap](<roadmap>) | `shape-product`, `lead` (pstack Multi-phase plan) |
| **Build:** one owner session and worktree per pull request, off the stage branch | PR owner | [testing](<testing>), [code map](<code map>) | `adlc-mode` (pstack Autopilot-full and its playbooks) |
| **PR exit:** the required checks, then the swarm's verdict; the PR owner merges into the stage branch | host, lead's verifiers, PR owner | [verification skill](<verify skill>) | `adlc-mode` |
| **Nightly on the default branch:** full integration suite | CI | `verify:nightly` | none |
| **Stage exit:** the steps of `gate_pr` on the stage branch's pull request, run with `lc-gate run pr` | lead, review sessions | [question files](<review folder>) | `stage-exit`, `review` |
| **After the exit:** docs sweep, verification upkeep, lessons | lead | [docs log](<update_docs.log>) | `update-docs` |

`lc-gate status pr <stage branch>` shows where the stage exit stands.

## Who does what

- **Owner:** decides product meaning, scope, access, spend and authority; agrees each stage's acceptance criteria; approves changes to protected files (`owner_approval`); confirms a critical brief.
- **Lead:** one session per stage. Plans the pull requests, starts their owner sessions, verifies each with a swarm, runs the stage exit, keeps the running log ([orchestration](<orchestration>)).
- **PR owner:** one session per pull request, with its own subagents, from build to merge.
- **Verifiers:** the lead's subagents; they wrote none of the code they verify.
- **Gate sessions:** spawned by `lc-gate run`, one per `session` step, each answering one question file.

Status and questions go to the lead. Anything that changes scope, a product rule or the plan goes from the lead to the owner on the board.

## Verification profiles

| Profile | When | Command |
| --- | --- | --- |
| commit | before each push | `verify:commit` |
| PR | every pull request, in CI | `verify:pr`, plus <other PR checks> |
| acceptance | stage exit | `verify:acceptance` |
| stage | stage exit, in CI | `verify:stage` |
| nightly | each night on the default branch | `verify:nightly` |
