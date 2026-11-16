---
name: phase-acceptance
description: Use before a phase's first brief, or when its scope changes, to agree its acceptance criteria (user outcomes, failure cases and invariants) with the owner.
---

# Phase acceptance

Inputs: the phase's entry in `docs.roadmap`, its stories and journeys, `docs.product`, `docs.glossary`, and the project's invariants (`docs.agents`).

1. Draft the criteria with the [acceptance template](../../templates/acceptance.md):
   - **User outcomes:** what a person or agent can do at the end, each as a journey a browser run can pass or fail.
   - **Failure cases:** what must happen when it goes wrong (refusal, conflict, restart, missing rights), each observable.
   - **Invariants:** what must stay true throughout (isolation, authority, no duplicate effects), each with the check that would show a breach.
2. Invoke `grilling` and `domain-modeling` and put the draft to the owner, one round at a time, with a recommended answer each. Use the glossary's words; add new terms to it.
3. Number each criterion (`<phase>-AC<n>`), so the phase-exit evidence and the briefs can name it.
4. Write the agreed criteria into the roadmap entry, or into a file it links.

Done when the owner has agreed every criterion and each one names the run or check that decides it.
