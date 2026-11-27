# Review: Thermos code quality

One session of the stage exit (`thermo-quality: session <this file>` in `gate_pr`). The rubric is the Thermos plugin's code-quality review, unmodified: the kit's `vendor/thermos/thermo-nuclear-code-quality-review/SKILL.md`. Read it in full before anything else and audit by it: its standards, its review questions, its approval bar and its presumptive blockers are yours. The numbered items below are its priorities, in its order, so that each gets a row.

Scope: the whole stage diff. Inputs: the evidence folder, `docs.code_map` (which module owns which concept), `docs.decisions`, the stage's plan file (`stage.plans`).

Severity: a structural regression that harms at merge is P1. Each of the rubric's presumptive blockers is P2, unless the stage pull request or the plan file already gives a justification you accept: then P3, naming the justification. Everything else is P3. Each finding names `path:line` and the simpler shape, concretely.

1. **Structural regressions.** Did the stage leave the local architecture worse than it found it?
2. **Missed simplification.** Is there a restructuring that would delete whole branches, helpers, modes or layers while keeping the behaviour?
3. **Spaghetti growth.** Ad-hoc conditionals, special cases or feature checks added into flows that were not about them?
4. **Boundaries and types.** Unneeded optionality, casts, loose object shapes or silent fallbacks that hide the real contract? Logic in the wrong layer, or leaking through an interface?
5. **File size and decomposition.** Did a file cross 1,000 lines in this stage, or grow where a split was the obvious move?
6. **Modularity and abstraction.** A wrapper or abstraction that does not earn its place, or a bespoke helper where the codebase has a canonical one?
7. **Legibility.** Is the code direct and boring, or does it rely on magic and incidental control flow?

**Fail condition:** a P1, or a presumptive blocker with no accepted justification.
