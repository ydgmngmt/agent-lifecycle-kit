---
name: cut-phase
description: Use when starting a phase, choosing its exit criteria, splitting it into pull requests, or writing a brief for an implementer session.
---

# Cut a phase

Inputs: `docs.roadmap`, `docs.stories`, `docs.code_map`, the phase's plan.

1. **Roadmap entry.** Give the phase a goal, its stories and journeys, and **exit criteria** that a phase run can pass or fail: journeys run live on a fresh stack. Write them into `docs.roadmap`.
2. **Split into PRs.** One PR is one reviewable change. Invoke `codebase-design` to place each seam, and find each concept's owner in `docs.code_map` before planning new code. PRs that touch the same files run in sequence; the others run in parallel.
3. **Open design questions** that code can answer get a throwaway `prototype` before the PR that depends on them.
4. **Briefs.** Invoke `writing-for-agents` and fill [brief template](../../templates/brief.md) for each session: goal and why, what to reuse, decisions already made, what not to touch, how to verify, lane, report file. Link the project docs instead of repeating them.
5. Note in the roadmap which PRs touch sensitive paths (`sensitive` in the project file), so each gets its reviewer session.

Done when each PR of the phase has a brief, and the exit criteria are in the roadmap.
