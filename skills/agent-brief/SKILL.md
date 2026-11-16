---
name: agent-brief
description: Use when splitting an accepted phase into changes, or writing the brief that hands one change to an implementer session.
---

# Agent brief

Inputs: the phase's acceptance criteria, `docs.code_map`, `docs.roadmap`.

1. **Scope one small, mergeable change:** one reviewable PR that leaves main working. Invoke `codebase-design` to place its seam, and find each concept's owner in `docs.code_map`. An open design question code can answer gets a throwaway `prototype` first.
2. **Name its owner:** the session that will build it, and whether the change needs a reviewer session (`sensitive`) or the human owner's approval (`owner_approval`).
3. **Order:** changes that touch the same files run in sequence; the others run in parallel. Note in each brief the shared files and who else edits them.
4. **Write the brief** with `writing-for-agents` and the [brief template](../../templates/brief.md). It covers the goal and the acceptance criteria it moves, what to reuse, decisions already made, what not to touch, how to verify, the lane and the report file. Link the project docs; don't repeat them.
5. Add the change to the phase's table in `docs.roadmap`.

Done when every acceptance criterion is covered by at least one brief, and each brief names its owner.
