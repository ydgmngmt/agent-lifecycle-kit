---
name: shape-product
description: Use when product requirements, user stories, journeys or the list of phases are written or changed, when the owner states a new product rule, or before a phase's first brief (or when its scope changes) to agree its acceptance criteria.
---

# Product scope and acceptance criteria

Inputs: `docs.product`, `docs.stories`, `docs.journeys`, `docs.glossary`, `docs.decisions`, `docs.roadmap`, and the project's invariants (`docs.agents`).

Invoke `grilling` and `domain-modeling` together. Put each decision to the owner, one round at a time, with a recommended answer derived from the docs. Look facts up yourself; invoke `research` when a fact needs primary sources. Use the glossary's words, and add each new term to it in the same sitting.

## Product scope

1. Write each settled term into the glossary and each hard-to-reverse decision into an ADR in `docs.decisions`. Record only what the owner decided, with the date.
2. Update the stories and journeys the decision touches. A story states the behaviour wanted; its status label states what works today.
3. Place the stories in phases in `docs.roadmap`: each phase gets a goal and its stories. If a running phase's scope changed, tell the orchestrator; that phase's criteria are agreed again (below).

Done when every question the change raised is answered or listed as open, and the docs say what was decided.

## A phase's acceptance criteria

The phase exits on these. Draft them with the [acceptance template](../../templates/acceptance.md):

- **User outcomes:** what a person or agent can do at the end, each as a journey a browser run can pass or fail.
- **Failure cases:** what must happen when it goes wrong (refusal, conflict, restart, missing rights), each observable.
- **Invariants:** what must stay true throughout (isolation, authority, no duplicate effects), each with the check that would show a breach.

Number each criterion `<phase>-AC<n>`, so briefs, the phase run and the phase record can name it. Write the agreed criteria into the roadmap entry, or into a file it links (`docs.acceptance`).

Done when the owner has agreed every criterion and each one names the run or check that decides it.
