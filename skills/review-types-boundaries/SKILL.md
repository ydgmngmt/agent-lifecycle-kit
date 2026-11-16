---
name: review-types-boundaries
description: Use when reviewing a phase diff (START..CANDIDATE) for types and boundaries, meaning unchecked casts of data that crosses a boundary, wide optional types where a union belongs, and fallbacks that hide errors.
---

# Phase review: types and boundaries

Inputs: `START`, `CANDIDATE`, the evidence folder (report-only lint output on the phase's files, the baselined findings), `docs.code_map`. Read the code at `CANDIDATE`, change nothing, and don't read the other reviewers' files.

Invoke `codebase-design` for the interface vocabulary; `code-review` against `START` is optional. Then answer:

1. A wide type with optional fields where the states are a union; an options object whose fields are all optional although one combination is required.
2. Data that crosses a boundary (HTTP, model output, tool call, connector, sandbox, stored JSON, environment) and is cast instead of checked, or checked twice by different code. It should be checked once, where it enters, against its schema, and its type should come from that schema.
3. A fallback that hides a missing value; a catch that changes what an error means to its caller.
4. Report-only lint findings on lines the phase changed.

Output: [finding.md](../lifecycle/finding.md), then **Checked and sound** and **Not examined**.
