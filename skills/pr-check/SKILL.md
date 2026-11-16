---
name: pr-check
description: Use when a pull request's work is committed and must be verified, reviewed and gated before it merges.
---

# Pull request and protected merge

In order. Each step is done when its result is recorded for the report.

1. **Changed flow.** If the change touches behaviour a person or agent uses, invoke `live-check` to exercise it in the browser or the live API. Ask the orchestrator for a lane if you have none.
2. **Review.** The review is independent of the change and covers its test evidence.
   - **Self-review:** invoke `code-review` against the base, with the brief as the spec, and fix what it finds in scope.
   - **The gate's review** (`gate.run`) answers `docs.review_checklist`.
3. **Sensitive changes:** approval by the role the project file names, and targeted tests for the affected invariants, red on the base and green on the head.
   - **Protected files** (`owner_approval`): the human owner approves before the merge. They go in their own PR, with each hunk listed in the body.
   - **Sensitive code paths** (`sensitive`): an independent `pr-reviewer` session approves. The orchestrator starts it alongside the live check, never giving it to the implementer, and reports the approval to the owner.
4. **Docs.** A behaviour change updates the stories, journeys, roadmap and glossary in the same PR (`domain-modeling` for the terms).
5. **PR body.** Invoke `pr`. Under Evidence, put the live-check result and the red-then-green proof of each new test.
6. **PR CI.** Run `gate.run` with the intent in a file, then wait for the checks `ci.pr_checks` lists: `profiles.pr` and the dependency scan. An empty check list is not success.
7. **Merge candidate.** The required checks must pass with the PR applied to the current main, as `merge.candidate` describes: a merge queue where the host has one, otherwise update the branch from main and wait for the checks on the new head. The orchestrator then merges with `merge.command`.
