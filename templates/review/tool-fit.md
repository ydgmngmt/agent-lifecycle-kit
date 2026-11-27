# Tool fit

What a pull request's `## Tool fit` section holds, and what counts as a new mechanism. The author writes the section from `docs.stack_decisions`, `docs.stack_tools` (each tool's functions and docs) and `docs.stack_exceptions`; CI's `pr-body` check reads its line shapes; the stage exit's stack review ([stack-hunt.md](stack-hunt.md)) reads past it.

## Accepted lines

The PR body's `## Tool fit` section (`pr_body`) holds only these. A line adds ` at <file:line>` after `<what>` once the code exists.

```
- I will call <function> (<docs page>) for <what>
- Own code in <module> for <what>: <why no chosen tool covers it>
- Exception <id> (<exceptions file>) for <what>
no new mechanism
```

A piece no chosen tool seems to fit: read that tool's current docs for the capability, then ask the owner on the board (the mechanism, the invariant the tool can't hold, the docs page) and build nothing for it meanwhile. An allowed exception gets a row in the exceptions file, and its line names the row.

## A new mechanism

Anything the diff adds or widens of: a column or table holding work state (due times, polled flags, claims, leases, attempts, wakes); a background loop, timer or polling; a queue or retry; a dependency; a validator or schema format; an HTTP route or middleware; a cache; a package; a script that checks or generates; a signing, identity, secrets or telemetry path. Widening a mechanism that already deviates counts.
