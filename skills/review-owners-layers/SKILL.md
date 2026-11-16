---
name: review-owners-layers
description: Use when reviewing a phase diff (START..CANDIDATE) for owners and layers, meaning whether each concept still has one owner and each rule sits in the right package.
---

# Phase review: owners and layers

Inputs: `START`, `CANDIDATE`, the evidence folder (`surface.diff`, `files.txt`), `docs.code_map`. Read the code at `CANDIDATE`, change nothing, and don't read the other reviewers' files.

Invoke `codebase-design` for the vocabulary (module, interface, seam, depth). Invoke `code-review` against `START` if you want its Standards pass, then rewrite its output into the format below. Then answer, for the whole diff:

1. Does each concept the phase touched still have one owner: one module that writes a table, resolves a selection, decides a permission or moves a state?
2. Did a rule land in a route handler, a screen, a test harness or tooling?
3. Does each new dependency between packages point from a feature to the core it uses, never back?
4. Does each new export have a user outside its package?

Output: findings in [finding.md](../lifecycle/finding.md), then **Checked and sound** and **Not examined**.
