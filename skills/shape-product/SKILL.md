---
name: shape-product
description: Use when product requirements, user stories, journeys or a phase's scope are being written or changed, or when the owner states a new product rule.
---

# Shape the product

Inputs: `docs.product`, `docs.stories`, `docs.journeys`, `docs.glossary`, `docs.decisions` from `.agents/project.yaml`.

1. Invoke `grilling` and `domain-modeling` together (the pair `grill-with-docs` names). Put the decisions to the owner, one round at a time, each with a recommended answer derived from `docs.product`.
2. Look up facts yourself. Invoke `research` when a fact needs primary sources.
3. Write each settled term into the glossary and each hard-to-reverse decision into an ADR in `docs.decisions`, in the same sitting. Record only what the owner decided, with the date.
4. Update the stories and journeys the decision touches. A story states the behaviour wanted; its status label states what works today.
5. If the scope of a planned or running phase changed, update `docs.roadmap` and tell the orchestrator.

Done when every question the change raised is answered or listed as open, and the docs say what was decided.
