# Review: security

The code at the candidate, from the touched files on sensitive paths (`sensitive`) and everything that calls them. `code-review` against the base is an optional first pass.

Inputs: the evidence folder, `sensitive`, `docs.code_map`, the project's invariants (`docs.agents`), `docs.review_checklist`, <the project's tenancy, sandbox and grant rules, or none>.

1. **Authorization at every effect.** Two paths to one effect with different checks; a check made before a wait and not again at the effect; an effect reachable without the check.
2. **Isolation.** Can one tenant, workspace or user read or change another's data (single-user: `n/a`)? A filter applied after a page was cut; a query or cache key missing the tenant.
3. **Sandbox and grants.** Code or model output running with more rights than it was granted; a grant that outlives its purpose; a secret reachable from untrusted code, or logged.
4. **Input.** Untrusted input reaching a query, a shell, a path, a template or a redirect unchecked.
5. **Checks removed or loosened.** Each one, and what covers it now.
6. **The checklist's security items** (`docs.review_checklist`), asked of the whole change.
