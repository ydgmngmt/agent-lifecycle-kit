# Review: architecture

In depth. Judge everything in the files the change or phase touched, old or new, not only the added lines. Invoke `codebase-design` for the vocabulary (module, interface, seam, depth, locality).

Inputs: the evidence folder (changed files, surface diff), `docs.code_map`, `docs.decisions`, <the project's stack decisions: which tool owns which capability>.

1. **One owner.** Does each concept still have one authoritative owner: one module that writes a table, resolves a selection, decides a permission or moves a state?
2. **Rules where every caller gets them.** Did a rule land in a route handler, a screen, a test harness or tooling instead of its owner?
3. **Dependency direction.** Are source dependencies acyclic? Does each new dependency point from a feature to the core it uses, and does the core reach a feature only through a port it defines?
4. **Deep modules.** Does each module hide more than its interface shows? Name each shallow pass-through and each interface that leaks its implementation.
5. **A present reason for every abstraction.** Each interface, port, factory or option has a user today. A port with a single adapter is allowed when it guards an existing dependency or trust boundary.
6. **Locality.** Does a change to one decision stay in one place, or did this change have to touch many files for one idea?
7. **Validation at entry, authorization at the effect.** Data is checked where it enters; rights are checked where the effect happens.
8. **Interruption and recovery.** Are restarts, timeouts, cancellations and partial failures modelled as states with a way out?
9. **Platform primitives** for platform guarantees (durability, scheduling, identity, transactions) instead of hand-built copies.
10. **Reuse of chosen tools.** Is anything a chosen tool already owns rebuilt here (a scheduler, a lease, a queue, a validator, an HTTP client, token handling)? Does a tool take over something the project owns?
11. **Navigability.** Is the code map still true and complete? Does a package's entry show what it offers?
12. **Safe to refactor.** Do tests reach a package through its public interface?
13. **Consistency.** One way to page, to change state, to report an error.
14. **The whole change.** What does it add up to, beyond each file?

End with the three changes that would most make this code easier to keep building on, each filed as a proposed issue.

**Fail condition:** a critical finding (a project invariant can be broken now). Everything else is a follow-up for the lead.
