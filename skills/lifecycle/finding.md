# Finding format

Every review writes findings in this format: the PR reviewer, the phase-review dimensions, and the duplication and dead-code checks. When `code-review` is used, its Standards and Spec findings are rewritten into this format; this format is the one that is reported.

```
### <ID> <one line>
- Where: path:line (for a copy or a wrong layer, also the second site or the existing owner)
- Evidence: the 3-10 lines that show it, or the exact sequence (input and state → wrong result)
- Rule: the invariant or document line it breaks, or the existing code it should have used
- Why it matters: the concrete consequence
- Smallest remedy: what to change, where
- Severity: critical (a project invariant can be broken now) | high (a defect in realistic use, or a fault later work builds on) | medium | low
- Fix keeps behaviour: yes | no
- Owner decision needed: no | yes (which)
- Confidence: confirmed (callers traced) | likely | needs-check (what wasn't verified)
```

A reviewer's file holds its findings, then **Checked and sound** (one line per area, with the file that shows it) and **Not examined**. A clean result is valid. Every finding has a `path:line`. Give no general advice, and don't invent findings to fill the list.

**Dispositions**, set by whoever merges the lists:
- **blocking:** a failed acceptance criterion. It goes back to implementation, and the phase doesn't exit until it passes.
- **follow-up:** a fix or defect that a follow-up PR takes. It is tracked in the roadmap and doesn't block the exit.
- **issue:** needs design, or reaches beyond the change.
- **owner:** a product meaning or rule to decide, with a proposed answer.
- **rejected:** with one line saying why.

A critical finding (a project invariant can be broken now) goes to the orchestrator at once and is fixed, or accepted by the owner, before anything else.
