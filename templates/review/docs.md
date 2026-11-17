# Review: docs

Read-only like every review: name each stale doc as a finding; the lead runs `update-docs` on them. Invoke `domain-modeling` to check terms against the glossary.

Inputs: the evidence folder, `docs.stories`, `docs.journeys`, `docs.roadmap`, `docs.glossary`, `docs.decisions`, `docs.testing`, the running log and the owner's answers on the board since the base.

1. **True at the candidate.** Are story labels, journey verdicts, roadmap states, ADR statuses and status lines true? Do they name PRs and issues, not branches?
2. **The docs describe the code.** Do they still describe what the change touched? Does user-visible text use the glossary's words?
3. **Decisions recorded.** Is each decision made along the way (running log, briefs, board answers) in the glossary or an ADR?
4. **Tests.** Does each added test catch a behaviour regression at the lowest reliable level, or an invariant with a focused test, with red-then-green proof? Is any a copy of existing coverage? Does each acceptance criterion have a step that decides it, and each bug found live a regression check?
5. **What was built and why.** In the findings file, a short section for the phase record: what the phase built, the decisions behind it, what was left out.
