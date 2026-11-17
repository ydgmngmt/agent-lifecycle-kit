---
name: update-docs
description: Use when the owner or the orchestrator says "update the docs", "docs update" or "bring the docs up to date", or at a phase exit. A sweep that brings the domain docs and the lifecycle docs in line with what was decided and built since the last run. Docs only.
---

# Update the docs

"Update the docs" means one thing: bring two sets of repository documents in line with what was decided and built since the last run, and nothing else. These documents keep the repository in check. Docs only: no code, no tests.

## The two sets

The project file names the paths: `docs.domain_set` and `docs.lifecycle_set` in `.agents/project.yaml`. Where it doesn't, use these:

1. **Domain docs:** the glossary, the decision records (ADRs), the product requirements and user stories, the user journeys, the product principles, the base skills' setup docs (issue tracker, triage labels, domain-docs layout), and the issue tracker itself: issues opened, closed, relabelled or linked to their PRs to match. Invoke `domain-modeling` for this set. A glossary entry says what a term means, with no implementation detail. Write an ADR only for a decision that is hard to reverse, surprising without its context, and a real trade-off.
2. **Lifecycle docs:** the lifecycle page, the project file, the roadmap, the phase acceptance files, the phase-exit values and phase records, the review question files, orchestration, the code map, the review checklist, the testing rules, the gate runbook and the agent instruction files (AGENTS.md, CLAUDE.md). Where a rule is general rather than the project's own, it belongs in this kit as well.

## The sweep

1. **Start point.** Read the last line of the run log (`update_docs.log` in the project file). It gives the date and the main commit of the last run. With no log, start from the last phase exit, or ask the orchestrator for a start date.
2. **List what happened since:** every decision (from the running log in `handoff_dir`, the briefs written since the start point, and the owner's answers on the board) and every merged behaviour change (`git log --merges <start commit>..origin/main`, and each PR's body). One line each, with its source.
3. **Check each item against both sets.** For each document it touches: already true, stale (say what), or missing. A document that says something the code or a decision no longer supports is stale too.
4. **Fix what is stale,** in plain words, with the glossary's terms, and without quoting the owner. Keep each edit to the lines that are wrong.
   - Non-protected documents: one PR, through the usual PR gate (`pr-gate`) (the evidence is that each changed claim is true at the head and every link resolves).
   - Protected files (`protected_files`): their own PR, each hunk listed in its body, for the owner to read.
   - A clash between two documents, or a decision nobody has made: don't settle it; it goes on the owner's list with a recommended answer.
5. **Log the run:** add one line to `update_docs.log` in the same PR: `- <date> · main <commit> · <PRs> · <counts changed / already true / needs the owner>`. The next run starts there.
6. **Report** to whoever asked: what changed (document and the decision behind it), what was already true, and what needs the owner (protected files, clashes, missing decisions).
