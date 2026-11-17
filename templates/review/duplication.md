# Review: duplication

The same thing built twice. Start from the duplication check's list (`checks.duplicates --list`) filtered to the touched files, and the baseline growth in the evidence folder; `code-review` against `START` (its Duplicated Code smell) is an optional first pass.

Inputs: the evidence folder (PR list, changed files, baseline growth, duplicate list), `checks.duplicates` and its baseline, `docs.code_map`.

1. **Clones the change added or grew.** For each, which copy is the owner (`docs.code_map`)? The remedy is to call the owner, or move one shared copy to the owner's package. A clone in tests counts too.
2. **Built twice under different names.** A helper, validator, component, fixture or test step that does what another already does. Search for the key identifiers, table names, routes and UI strings, across all the PRs of the phase.
3. **A local helper beside an owner** that already exports the same thing.
4. **Rewrite beside the original.** New code that rewrites working code instead of extending it, or leaves the old version beside the new one.
5. **Baseline growth.** An entry may grow only with the reason its PR states (a generated file, two formats that must stay separate). A grown entry without a reason is a finding.

A copy is a finding in itself: both `path:line` ranges are the evidence. After a fix, `checks.duplicates --prune` shrinks the baseline.

**Fail condition:** a critical finding (a project invariant can be broken now). Everything else is a follow-up for the lead.
