---
name: review-docs-tests
description: Use when reviewing a phase diff (START..CANDIDATE) for docs and tests, meaning stories, journeys, roadmap, glossary and status lines true at the candidate, and tests that meet the testing rules.
---

# Phase review: docs and tests

Inputs: `START`, `CANDIDATE`, the evidence folder, `docs.stories`, `docs.journeys`, `docs.roadmap`, `docs.glossary`, `docs.testing`. Read at `CANDIDATE`, change nothing, and don't read the other reviewers' files.

Invoke `domain-modeling` to check terms against the glossary. Answer:

1. Are story labels, journey verdicts, roadmap states, ADR statuses and status lines true at `CANDIDATE`? Do they name PRs and issues, not branches?
2. Do the docs still describe the code the phase changed? Does user-visible text use the glossary's words?
3. Does each test the phase added catch a behaviour regression at the lowest reliable level, or a core or security invariant with a focused test, with red-then-green proof? Is any test a copy of existing coverage?
4. Did the phase run gain a regression check for each bug found live? Does each acceptance criterion have a step that decides it?

Output: [finding.md](../lifecycle/finding.md), then **Checked and sound** and **Not examined**.
