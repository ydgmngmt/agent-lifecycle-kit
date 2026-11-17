# Review: security

Reads the code at `CANDIDATE`, starting from the touched files on sensitive paths (`sensitive`) and everything that calls them. `code-review` against `START` is an optional first pass. Prove a suspected sequence with `diagnosing-bugs` where you can.

Inputs: the evidence folder, `sensitive`, `docs.code_map`, the project's invariants (`docs.agents`), `docs.review_checklist`, <the project's tenancy, sandbox and grant rules>.

1. **Authorization at every effect.** Two paths to the same effect with different checks; a check made before a wait and not again at the effect; an effect reachable without the check.
2. **Isolation.** Can one tenant, workspace or user read or change another's data? A filter applied after a page was cut; a query or cache key missing the tenant.
3. **Sandbox and grants.** Code or model output that runs with more rights than it was granted; a grant that outlives its purpose; a secret reachable from untrusted code or logged.
4. **Input.** Untrusted input that reaches a query, a shell, a path, a template or a redirect unchecked.
5. **Checks removed or loosened.** Each one, and what covers it now.
6. **The checklist's security questions** (`docs.review_checklist`), asked of the whole change.

Any finding that breaks a project invariant now is critical: send it to the lead at once.

**Fail condition:** a critical finding (a project invariant can be broken now). Everything else is a follow-up for the lead.
