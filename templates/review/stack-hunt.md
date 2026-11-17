# Review: stack hunt

Did the phase rebuild, under any name, something a chosen tool should hold? This session does only that (`gate_phase`: `stack: session <this file>`); the architecture session leaves it here.

**Scope.** The whole phase diff (`START`..`CANDIDATE`), every file in `files.txt`: product code, tooling, tests and every manifest. Each PR's tool-fit record is the author's claim. Read past it, and past the mechanisms the records name.

**Inputs.** Besides the evidence folder: the stack decisions (`docs.stack_decisions`), the tools list with each tool's functions and docs (`docs.stack_tools`), the exceptions (`docs.stack_exceptions`), and the tool-fit records (the `## Tool fit` section of each PR body in `prs.txt`).

**Questions.**

- **The known evasions.**
  - A timer or sleep behind an alias.
  - Polling through a `setTimeout` that calls itself.
  - A query or a CLI spawned through a variable.
  - A mechanism under a test or fixture folder that product code imports.
  - A lease, queue, claim or wake table or column under another name.
- **Then everything else you can think of**, from the mechanism list in the tool-fit question file: work-state columns, loops and timers, queues and retries, dependencies, validators and schema formats, HTTP routes and middleware, caches, packages, checking or generating scripts, signing, identity, secrets or telemetry paths. Look for each in whatever shape it was built.
- **Across PRs.** A mechanism split over several PRs, each piece too small for its own record to name.
- **For each mechanism found:** which stack decision owns it, and which tool function replaces it (from the tools list)?

**A finding** names the mechanism at `path:line`, its stack decision and the tool function that should replace it. **Fail condition:** a mechanism no exceptions row covers. One a row covers is a comment that names the row.
