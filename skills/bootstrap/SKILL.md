---
name: bootstrap
description: Use when a repository should be made ready for the ADLC, new or existing, when it has no `.agents/project.yaml` yet, when its gate steps, review question files or verification skill are missing, or when the user asks whether a project is ready to start a stage. A guided, resumable readiness check.
---

# Bootstrap: readiness check

Takes a repository to "ready to start a stage", one missing piece at a time. Each run detects everything afresh from the files and picks up at the first open item.

**Rules**
- Never overwrite a file. A piece that exists under another name or shape is referred to: in `.agents/project.yaml`, a pointer `path#section`, never a copy.
- Look before you ask. Ask only what the files can't tell, one round at a time, each question with a recommended answer (`grilling`).
- A clash between a doc and the lifecycle goes to the owner with both sides at `path:line`; don't resolve it.
- An item is done only with a path, and with a run where it is a command.

**Steps**
1. **Map** [checklist.md](checklist.md) in order. Look for each item under any name (docs, package scripts, CI workflows, agent instruction files): **present** (path), **incomplete** (path, what is missing) or **missing**.
2. **Show** a table (item, state, path, the skill or step that fills it) and the clashes.
3. **Guide** through the first open item: say in a line what it is for; invoke the skill the checklist names, or fill the kit template (`templates/`) from what the repository says; show the draft and write it once the person agrees; record its path in `.agents/project.yaml` (created from `templates/project.yaml` the first time, with only the keys known). A placeholder that doesn't apply (no browser, tenants, linter or CI) is written `none`. Then the next item.
4. An item that can't be done now (a person, an install, an access) says exactly what it needs and stops there; it stays open.
5. **Enforcement:** item 14a follows [enforcement.md](enforcement.md) step by step. It ends when `lc-gate enforcement --strict` exits 0, or each row still off is with the owner.
6. **Rules:** item 14b. Ask which tools the project chose and which paths own each, and which packages may not import which. Each answer backed by a written decision becomes a rule in `.agents/rules.yaml` (`templates/rules.yaml`), with a red and a green example; an answer without one goes to the owner first. A decision no rule kind fits exactly goes into `docs.stack_decisions`, which the stage exit's stack review reads. Then `lc-rules selftest`, `lc-rules baseline`, and the rules in the PR workflow and in `gate_pr`.
7. **Verification:** items 10a and 10b run pstack's generators as written (`lc-pstack path` prints where they live). 10a is not optional: without flow scripts nothing proves a pull request live, and every verifier would drive the app by hand.
8. **Ready** only when every item is present: say so, and name the first stage whose criteria are agreed. Until then, end with the checklist and the next open item.
