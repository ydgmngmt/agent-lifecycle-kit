---
name: shape-product
description: Use when product requirements, user stories, journeys or the list of phases are written or changed, when the owner states a new product rule, or before a phase's first brief (or when its scope changes) to agree its acceptance criteria.
---

# Product scope and acceptance criteria

Inputs: `docs.product`, `docs.stories`, `docs.journeys`, `docs.glossary`, `docs.decisions`, `docs.roadmap`, the project's invariants (`docs.agents`).

Invoke `grilling` and `domain-modeling` together: each decision to the owner, one round at a time, with a recommended answer from the docs. Look facts up yourself (`research` for primary sources). Use the glossary's words; add each new term in the same sitting.

## Product scope

1. Each settled term into the glossary; each hard-to-reverse decision into an ADR (`docs.decisions`). Only what the owner decided, dated.
2. Update the stories and journeys the decision touches. A story states the behaviour wanted; its status label what works today.
3. Place stories in phases in `docs.roadmap`, each phase with a goal. If a running phase's scope changed, tell the orchestrator; its criteria are agreed again.

Done when every question raised is answered or listed as open, and the docs say what was decided.

## A phase's acceptance criteria

The phase exits on these ([acceptance template](../../templates/acceptance.md)):

- **User outcomes:** what a person or agent can do at the end, each a journey a browser run can pass or fail.
- **Failure cases:** what must happen when it goes wrong (refusal, conflict, restart, missing rights), each observable.
- **Invariants:** what stays true throughout (isolation, authority, no duplicate effects), each with the check that would show a breach.

Number each `<phase>-AC<n>`. Write the agreed criteria into the roadmap entry or a file it links (`docs.acceptance`).

Done when the owner agreed every criterion and each names the run or check that decides it.
