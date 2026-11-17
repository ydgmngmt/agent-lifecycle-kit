# Review: tool fit

The PR gate's `tool-fit` step (`tool-fit: session <this file> if mechanism plan`). The author planned before any code (`pr-gate`); this session checks the plan against the diff, then hunts the diff for a chosen tool rebuilt under another name.

Inputs: `docs.stack_decisions`, `docs.stack_tools` (each tool's functions and docs), `docs.stack_exceptions`, the plan record (`records/tool-fit.plan.json` and its evidence copy), the brief's **Stack fit**, the diff.

## Accepted lines

The plan, and the PR body's `## Tool fit` section (`pr_body`), hold only these. A completed line adds ` at <file:line>` after `<what>`.

```
- I will call <function> (<docs page>) for <what>
- Own code in <module> for <what>: <why no chosen tool covers it>
- Exception <id> (<exceptions file>) for <what>
no new mechanism
```

A piece no chosen tool seems to fit: read that tool's current docs for the capability, then ask the owner on the board (the mechanism, the invariant the tool can't hold, the docs page) and build nothing for it meanwhile. An allowed exception gets a row in the exceptions file, and its line names the row.

## A new mechanism

Anything the diff adds or widens of: a column or table holding work state (due times, polled flags, claims, leases, attempts, wakes); a background loop, timer or polling; a queue or retry; a dependency; a validator or schema format; an HTTP route or middleware; a cache; a package; a script that checks or generates; a signing, identity, secrets or telemetry path. Widening a mechanism that already deviates counts.

## Questions

1. **Plan against diff.** Does the diff make each plan line's call at its `file:line`, through the tool the stack decisions give that capability? Is every mechanism the diff adds covered by a line?
2. **The hunt.** Ignoring the plan: a timer or sleep behind an alias, or a `setTimeout` that calls itself; a query or CLI spawned through a variable; a mechanism under a test or fixture folder that product code imports; a lease, queue, claim or wake table or column under another name; then any mechanism above, in whatever shape.
3. **Owner.** For each mechanism found: which decision owns it, and which tool function replaces it?

A finding names the mechanism at `path:line`, the decision it breaks and the replacing function. **Fail condition:** a mechanism no plan line, chosen tool or exception row covers.
