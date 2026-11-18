# Review: stack hunt

Did the phase rebuild, under any name, something a chosen tool should hold? This session does only that (`stack: session <this file>` in `gate_phase`).

Scope: the whole phase diff, every file in `files.txt`: product code, tooling, tests and every manifest. Each PR's tool-fit record is the author's claim; read past it and past the mechanisms it names.

Inputs: the evidence folder, `docs.stack_decisions`, `docs.stack_tools`, `docs.stack_exceptions`, and each PR body's `## Tool fit` section (PRs in `prs.txt`).

1. **The known evasions:** a timer or sleep behind an alias; polling through a `setTimeout` that calls itself; a query or CLI spawned through a variable; a mechanism under a test or fixture folder that product code imports; a lease, queue, claim or wake table or column under another name.
2. **Everything else** in the tool-fit file's mechanism list, in whatever shape it was built.
3. **Across PRs:** a mechanism split over several PRs, each piece too small for its own record.
4. **Owner.** For each mechanism found: which stack decision owns it, and which tool function replaces it?

A finding names the mechanism at `path:line`, its decision and the replacing function. **Fail condition:** a mechanism no exceptions row covers; one a row covers is P3, naming the row.
