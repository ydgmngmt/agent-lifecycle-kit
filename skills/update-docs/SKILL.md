---
name: update-docs
description: Use when the owner or the orchestrator says "update the docs", "docs update" or "bring the docs up to date", or at a phase exit. A sweep that brings the domain docs and the lifecycle docs in line with what was decided and built since the last run. Docs only.
---

# Update the docs

Bring two sets of documents in line with what was decided and built since the last run. Docs only: no code, no tests.

## The two sets

`docs.domain_set` and `docs.lifecycle_set` in the project file; where it has none:

1. **Domain:** glossary, ADRs, product requirements and stories, journeys, product principles, the base skills' setup docs (issue tracker, triage labels, domain-docs layout), and the issues themselves (opened, closed, relabelled or linked to their PRs). Invoke `domain-modeling`. A glossary entry says what a term means, with no implementation detail. An ADR only for a decision hard to reverse, surprising without context, and a real trade-off.
2. **Lifecycle:** the lifecycle page, project file, roadmap, acceptance files, phase-exit values and records, review question files and checklist, orchestration, code map, testing rules, gate runbook, AGENTS.md and CLAUDE.md. A general rule belongs in this kit as well.

## The sweep

1. **Start** at the last line of `update_docs.log` (date and main commit of the last run); with no log, the last phase exit, or a date from the orchestrator.
2. **List** every decision since (running log, briefs, board answers) and every merged behaviour change (`git log --merges <start>..origin/main`, each PR body), one line each with its source.
3. **Check** each against both sets: true, stale (say what), or missing. A doc saying what the code or a decision no longer supports is stale.
4. **Fix** what is stale in plain words and the glossary's terms, without quoting the owner, editing only the wrong lines:
   - other documents: one PR through `pr-gate` (evidence: each changed claim true at the head, every link resolves);
   - `protected_files`: their own PR, each hunk listed, for the owner;
   - a clash or an unmade decision: not settled; it goes on the owner's list with a recommended answer.
5. **Log** one line in `update_docs.log` in the same PR: `- <date> · main <commit> · <PRs> · <changed / already true / needs the owner>`.
6. **Report** what changed (document, decision), what was already true, and what needs the owner.
