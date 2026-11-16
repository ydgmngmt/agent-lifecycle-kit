---
name: review-reuse
description: Use when reviewing a phase diff (START..CANDIDATE) for reuse, meaning the same thing built twice across PRs, local helpers beside an existing owner, and unused options.
---

# Phase review: reuse

Inputs: `START`, `CANDIDATE`, the evidence folder (`prs.txt`, `files.txt`), `docs.code_map`. Read the code at `CANDIDATE`, change nothing, and don't read the other reviewers' files.

Invoke `code-review` against `START`; its Duplicated Code, Speculative Generality and Middle Man smells are the starting list. Then answer:

1. Was the same thing built twice across the phase's PRs under different names: a helper, a validator, a component, a fixture, a test step? Search for the key identifiers, table names, routes and UI strings.
2. Is there a new local helper for something an owner already exports?
3. Did the phase add an option, parameter or branch that nothing uses at `CANDIDATE`?
4. Does new code rewrite working code instead of extending it, or leave the old version beside the new one?

A copy is a finding in itself; the two `path:line` pairs are the evidence. Output: [finding.md](../lifecycle/finding.md), then **Checked and sound** and **Not examined**.
