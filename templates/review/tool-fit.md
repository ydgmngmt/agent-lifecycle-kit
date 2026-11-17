# Review: tool fit

The PR gate's `tool-fit` step (`gate_pr`: `tool-fit: session <this file> if mechanism plan`). The author plans from the chosen tools before writing code; a separate session checks the plan against the diff, then hunts the diff for a chosen tool rebuilt under another name. The plan is the author's claim; the hunt is what tests it.

Inputs: the stack decisions (`docs.stack_decisions`: which tool owns which capability), the tools list with each tool's functions and documentation lookups (`docs.stack_tools`), the exceptions (`docs.stack_exceptions`), the plan record (`records/tool-fit.plan.json` and its evidence copy), the brief's **Stack fit** section, the diff `START`..`CANDIDATE`.

## The plan, before any code (the author)

Before the first edit of a file under `paths.mechanism`:

1. Read the tools list. Open the documentation of each tool the work touches through its **Look up** line, starting with the tools the brief names.
2. Write one line per piece of the work, in the accepted shapes below, each citing the docs page or lookup result it came from. Own code only where no chosen tool covers the piece, with the reason.
3. Record it while the branch has no commit of its own: `lc-gate record pr <branch> tool-fit plan --evidence <file>`. With `gate_pr_plan: enforce` the hooks refuse the first edit and commit without it.
4. Once the code exists, complete each line with the `file:line` of the call, add a line for any mechanism the plan missed, and copy the lines under `## Tool fit` in the PR body (`pr_body`), where CI's `pr-body` check reads them. A diff that adds no mechanism writes the single line `no new mechanism`.

A piece no chosen tool seems to fit: read that tool's current docs for the capability, then stop and ask the owner on the board (the mechanism, the invariant the tool can't hold, the docs page). Build nothing for it meanwhile. An allowed exception gets a row in the exceptions file, and its line names the row.

## Accepted lines

```
- I will call <function> (<docs page>) for <what>
- Own code in <module> for <what>: <why no chosen tool covers it>
- Exception <id> (<exceptions file>) for <what>
no new mechanism
```

A completed line adds ` at <file:line>` after `<what>`.

## A new mechanism

Anything the diff adds or widens of: a column or table holding work state (due times, polled flags, claims, leases, attempts, wakes); a background loop, timer or polling; a queue or retry; a dependency; a validator or schema format; an HTTP route or middleware; a cache; a package; a script that checks or generates; a signing, identity, secrets or telemetry path. Widening a mechanism that already deviates counts as adding one.

## Questions (the session)

1. **Plan against diff.** For each plan line: does the diff make that call at that `file:line`, through the tool the stack decisions give that capability? Is every mechanism the diff adds covered by a line?
2. **The hunt.** Ignoring the plan, read the diff for a chosen tool rebuilt under another name:
   - a timer or sleep behind an alias, or polling through a `setTimeout` that calls itself;
   - a query or a CLI spawned through a variable;
   - a mechanism under a test or fixture folder that product code imports;
   - a lease, queue, claim or wake table or column under another name;
   - then any mechanism from the list above, in whatever shape it was built.
3. For each mechanism found: which decision owns it, and which tool function replaces it?

**A finding** names the mechanism at `path:line`, the stack decision it breaks and the tool function that should replace it. **Fail condition:** a mechanism no plan line, chosen tool or exception row covers.
