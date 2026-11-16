---
name: bootstrap
description: Use when a repository should be made ready for the ADLC, new or existing, when it has no `.agents/project.yaml` yet, or when the user asks whether a project is ready to start a phase. A guided, resumable readiness check.
---

# Bootstrap: readiness check

Takes a new or existing repository to "ready to start a phase", one missing piece at a time. Run it again at any point: it detects everything afresh from the files and picks up at the first open item.

**Rules**
- Never overwrite an existing file. Where a piece exists under another name or shape, refer to it: in `.agents/project.yaml`, as a pointer `path#section`, never a copy.
- Look before you ask. Ask the person only what the files can't tell you, interactively, one round at a time, each question with a recommended answer (`grilling`'s format).
- When an existing doc clashes with the lifecycle, list the clash for the owner (both sides, `path:line`). Don't resolve it.
- An item is done only with a path, and with a run where it is a command.

**Steps**
1. **Map.** Go through [checklist.md](checklist.md) in order. For each item, look for it under any name: read the repo's docs, package scripts, CI workflows and agent instruction files. Mark it **present** (path), **incomplete** (path, and what is missing) or **missing**.
2. **Show** the checklist as a table: item, state, path, the skill or step that fills it. Add the list of clashes.
3. **Guide** through the first open item:
   - Explain in a line what it is for.
   - Invoke the skill the checklist names, or fill the kit template (`templates/`) with what the repository already says.
   - Show the draft and write it once the person agrees.
   - Record its path in `.agents/project.yaml`. Create that file from `templates/project.yaml` the first time, with only the keys known so far.
   - Then go to the next open item.
4. If an item can't be done now (it needs a person, an install or an access), say exactly what is needed and stop there. Its state stays open for the next run.
5. **Ready** only when every item is present: say so, and name the first phase whose acceptance criteria are agreed. Until then, end with the checklist and the next open item.
