# Review: correctness

Reads the code the change or phase touched at `CANDIDATE`. Invoke `codebase-design` for the interface vocabulary; `code-review` against `START` is an optional first pass.

Inputs: the evidence folder (changed files, report-only lint on them, the baselined findings), `docs.code_map`, <the project's boundary and schema rules>.

1. **Types at boundaries.** Data that crosses a boundary (HTTP, model output, tool call, connector, sandbox, stored JSON, environment) and is cast instead of checked, or checked twice by different code. It should be checked once, where it enters, against its schema, and its type should come from that schema.
2. **Types that allow wrong states.** A wide type with optional fields where the states are a union; an options object whose fields are all optional although one combination is required.
3. **Errors.** A fallback that hides a missing value; a catch that changes what an error means to its caller; an error swallowed or logged and dropped.
4. **Effects.** A read-then-act outside the effect's transaction; an outside call without an operation ID, a timeout, or a way to reconcile an unknown outcome; a retry that can repeat an effect.
5. **States with no exit.** A status that an exception, a restart or a stop can leave with no transition out, or that more than one place writes.
6. **Lint.** Report-only lint findings on lines the change added.
