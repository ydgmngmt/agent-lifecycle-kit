# Review: architecture

Everything in the files the change or phase touched, old or new, not only the added lines. Invoke `codebase-design` for the vocabulary (module, interface, seam, depth, locality).

Inputs: the evidence folder (changed files, surface diff), `docs.code_map`, `docs.decisions`, `docs.stack_decisions`.

1. **One owner.** Does each concept still have one owner: one module that writes a table, resolves a selection, decides a permission or moves a state?
2. **Rules where every caller gets them.** Did a rule land in a route handler, a screen, a test harness or tooling instead of its owner?
3. **Dependency direction.** Are dependencies acyclic? Does each new one point from a feature to the core it uses, and does the core reach a feature only through a port it defines?
4. **Deep modules.** Name each shallow pass-through and each interface that leaks its implementation.
5. **A present reason for every abstraction.** Each interface, port, factory or option has a user today; a port with one adapter only where it guards an existing dependency or trust boundary.
6. **Locality.** Does one decision stay in one place, or did one idea touch many files?
7. **Validation at entry, authorization at the effect.**
8. **Interruption and recovery.** Are restarts, timeouts, cancellations and partial failures states with a way out?
9. **Platform primitives** for platform guarantees (durability, scheduling, identity, transactions), not hand-built copies.
10. **Buy/build boundary.** Does a tool take over something the project owns? (A chosen tool rebuilt by hand is the stack hunt's question.)
11. **Navigability.** Is the code map still true and complete? Does a package's entry show what it offers?
12. **Safe to refactor.** Do tests reach a package through its public interface?
13. **Consistency.** One way to page, to change state, to report an error.
14. **The whole change.** What does it add up to, beyond each file? Name the three changes that would most ease building on it, each a proposed issue.
