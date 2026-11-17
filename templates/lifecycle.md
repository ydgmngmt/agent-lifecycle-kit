# Way of working (ADLC)

How work on <project name> runs, from product scope to the next phase. This page owns the sequence and who does what; each step links to the doc that owns its detail. The skills of the agent-lifecycle-kit fire at each step, and the project's values, including each gate's steps (`gate_pr`, `gate_phase`), are in [`.agents/project.yaml`](../../.agents/project.yaml).

![Agent-driven development lifecycle](adlc.png)

## Steps

| Step | Who | Detail | Skill |
| --- | --- | --- | --- |
| **Product scope:** PRD → user stories → phases, and each phase's acceptance criteria | owner with the orchestrator | [product](<product doc>), [stories](<stories>), [roadmap](<roadmap>) | `shape-product` |
| **Briefs:** one small, mergeable change with a named owner | orchestrator | [orchestration](<orchestration>) | `orchestrator` |
| **Parallel implementation:** one session and worktree per change | implementer | [testing](<testing>), [code map](<code map>) | `implementer` |
| **PR gate:** the steps of `gate_pr`, run with `lc-gate run pr` | implementer, reviewer session, owner, orchestrator | [review checklist](<checklist>), [gate runbook](<runbook>) | `pr-gate`, `review` |
| **Nightly on main:** full integration suite | CI | `verify:nightly` | none |
| **Phase exit:** the steps of `gate_phase`, run with `lc-gate run phase` | lead, review sessions, owner | [phase exit values](<phase review>), [phase records](<phase records>) | `phase-exit`, `review` |

`lc-gate status <pr|phase> <id>` shows where a gate stands.

## Who does what

- **Owner:** decides product meaning, scope, access, spend and authority; agrees each phase's acceptance criteria; approves changes to protected files (`owner_approval`); accepts each phase on the board.
- **Orchestrator (the lead):** one session per phase. Assigns briefs, merges merge candidates, keeps the running log, and alone records a gate step N/A or carried, with a reason ([orchestration](<orchestration>)).
- **Implementer:** one session per change, which may use its own subagents.
- **Gate sessions:** spawned by `lc-gate run`, one per `session` step, each answering one question file; never the implementer.

Status and questions go to the orchestrator. Peers coordinate shared files before editing them; anything that changes scope, a product rule or the plan goes to the orchestrator.

## Verification profiles

| Profile | When | Command |
| --- | --- | --- |
| commit | before each push | `verify:commit` |
| PR | every PR, in CI | `verify:pr`, plus <other PR checks> |
| phase | phase exit | `verify:phase` |
| nightly | each night on main | `verify:nightly` |
