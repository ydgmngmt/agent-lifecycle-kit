# Review: docs

This review may edit docs (never code). Invoke `domain-modeling` to check terms against the glossary.

Inputs: the evidence folder, `docs.stories`, `docs.journeys`, `docs.roadmap`, `docs.glossary`, `docs.decisions`, `docs.testing`, the running log and the owner's answers on the board since `START`.

1. **True at `CANDIDATE`.** Are story labels, journey verdicts, roadmap states, ADR statuses and status lines true? Do they name PRs and issues, not branches?
2. **The docs describe the code.** Do they still describe what the change touched? Does user-visible text use the glossary's words?
3. **Decisions recorded.** Is every decision made along the way (running log, briefs, board answers) in the glossary or an ADR where it belongs?
4. **Tests.** Does each added test catch a behaviour regression at the lowest reliable level, or a core or security invariant with a focused test, with red-then-green proof? Is any test a copy of existing coverage? Does each acceptance criterion have a step that decides it, and each bug found live a regression check?
5. **What was built and why.** Write a short section for the phase record: what the phase built, the decisions behind it, and what was left out.
6. **The sweep.** Run `update-docs` for what is stale; its PR is part of your evidence.

**Fail condition:** a critical finding (a project invariant can be broken now). Everything else is a follow-up for the lead.
