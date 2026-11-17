# Review: duplication

The same thing built twice. Start from `checks.duplicates --list` filtered to the touched files, and the baseline growth in the evidence folder; `code-review` against the base (Duplicated Code) is an optional first pass. A copy is a finding; both `path:line` ranges are its evidence.

Inputs: the evidence folder (PR list, changed files, baseline growth, duplicate list), `checks.duplicates` and its baseline, `docs.code_map`.

1. **Clones the change added or grew,** tests included. Which copy is the owner (`docs.code_map`)? The remedy calls the owner, or moves one shared copy into the owner's package.
2. **Built twice under different names.** A helper, validator, component, fixture or test step doing what another does. Search key identifiers, table names, routes and UI strings across all the phase's PRs.
3. **A local helper beside an owner** that already exports it.
4. **Rewrite beside the original:** new code that rewrites working code instead of extending it, or leaves the old version in place.
5. **Baseline growth** without the reason its PR states (a generated file, two formats that must stay separate).
