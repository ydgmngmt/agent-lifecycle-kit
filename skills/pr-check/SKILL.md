---
name: pr-check
description: Use when a pull request's work is committed and must be verified, reviewed and gated before it merges.
---

# PR check

In order. Each step is done when its result is recorded for the report.

1. **Live check.** If the change touches a flow a person or agent uses, invoke `live-check`. Ask the orchestrator for a lane if you have none.
2. **Reviewer session.** If the change touches a sensitive path (`sensitive` in the project file), the orchestrator starts a `pr-reviewer` session, never the implementer. It runs alongside the live check, and its findings go straight to the implementer.
3. **Self-review.** Invoke `code-review` against the base branch, with the brief as the spec. Fix what it finds in scope.
4. **Docs.** A behaviour change updates the stories, journeys, roadmap and glossary in the same PR (`domain-modeling` for the terms).
5. **PR body.** Invoke `pr`. Put the red-then-green proof of each new test under Evidence.
6. **Gate and CI.** Run `gate.run` with the intent in a file, then wait for CI (`profiles.pr` and the checks `ci.pr_checks` lists). An empty check list is not success.
7. **Merge.** The orchestrator merges with `merge.command` once the review and CI pass on a head that includes the current main. A PR touching `protected_files` waits for the owner.
