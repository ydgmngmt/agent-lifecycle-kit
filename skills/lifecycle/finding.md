# Finding format

Every stage-exit session (`review`) writes its findings in this format. A Thermos audit's findings are written in it too, with the severity its question file maps them to.

```
### <ID> <one line>
- Where: path:line (for a copy or a wrong layer, also the second site or the existing owner)
- Evidence: the 3-10 lines that show it, or the exact sequence (input and state → wrong result)
- Rule: the invariant or document line it breaks, or the existing code it should have used
- Why it matters: the concrete consequence
- Smallest remedy: what to change, where
- Severity: P1 (wrong at merge and it harms) | P2 (wrong against the intent or a written decision, in a way later work builds on) | P3 (real but small); a P4 is a line, not a finding
- Fix keeps behaviour: yes | no
- Owner decision needed: no | yes (which)
- Confidence: confirmed (callers traced) | likely | needs-check (what wasn't verified)
```

A P3 is fixed when it is a few lines inside the change, else recorded; it is never alone a reason for another round.

A gate session's file opens with one row per question of its question file (`review`: applies, the `path:line` it checked, the verdict), then its findings. A clean result is valid. Every finding has a `path:line`. Give no general advice, and don't invent findings to fill the list.

**Dispositions**, set by the lead, who reads the cited lines of every finding:
- **blocking:** a P1 or P2, or a failed acceptance criterion. It goes back to the build, and the stage doesn't exit until its step passes.
- **follow-up:** a fix or defect that a follow-up PR takes. It is tracked in the roadmap and doesn't block the exit.
- **issue:** needs design, or reaches beyond the change.
- **owner:** a product meaning or rule to decide, with a proposed answer.
- **rejected:** with one line saying why.

A P1 goes to the lead at once and is fixed, or accepted by the owner, before anything else.
