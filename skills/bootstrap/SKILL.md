---
name: bootstrap
description: Use when setting up a repository for the agent-driven lifecycle, meaning one with no `.agents/project.yaml` yet, or when the user asks to adopt or update the lifecycle kit in a project.
---

# Bootstrap a repository

Templates are in this kit's [templates/](../../templates/). Derive everything you can by looking; ask only what you can't.

1. **Read the repository:** package scripts, CI workflows, test configs, quality tools, `AGENTS.md`, `CLAUDE.md`, the testing doc, glossary, ADR folder, product docs and stories, and any roadmap or plans. Note what already exists for each `templates/project.yaml` key.
2. **Ask** the open values in one round, using `grilling`'s format with a recommended answer each: the owner (a role, not a name), the paths that need the owner's approval, protected files, sensitive paths, stack lanes, who merges, the merge command, how a merge candidate is checked (merge queue or update-and-recheck), and the dependency scan. Skip any the repository already answers.
3. **Write `.agents/project.yaml`** from the template, with every key filled or deleted. Where a value already lives in a repo file, write a pointer to it (`path#section`), not a copy.
4. **Add the missing docs** from the templates, filled for this project: `docs.lifecycle` with the diagram `docs/adlc.png` beside it, `docs.roadmap`, `docs.phase_review`, an acceptance file per phase, and the testing doc if none exists. Where a doc exists, propose the changes it needs; don't overwrite it.
5. **Profiles.** Add `verify:commit`, `verify:pr`, `verify:phase` and `verify:nightly` as thin scripts over the commands the project already has. Point CI at `verify:pr` and `verify:nightly` (`templates/ci/`), keeping what CI runs today.
6. **Pointers.** Add one line to `AGENTS.md` and to `CLAUDE.md`: "Way of working: `docs/agents/lifecycle.md`; skills: agent-lifecycle-kit; project values: `.agents/project.yaml`." If those are protected files, put the lines in their own PR for the owner.
7. **Verify:** run `profiles.commit` and `profiles.pr` once and record the time each takes; then check that the `lifecycle` skill resolves in a fresh session.

Done when `.agents/project.yaml` has no `<…>` left, each profile runs, and the docs link to each other.
