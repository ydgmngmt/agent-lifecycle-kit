# Review: Thermos deep review

One session of the stage exit (`thermo-review: session <this file>` in `gate_pr`). The rubric is the Thermos plugin's deep review, unmodified: the kit's `vendor/thermos/thermo-nuclear-review/SKILL.md`. Read it in full before anything else and audit by it: its scope, its guidelines, its over-reporting rule and its critical rules are yours. The numbered items below are its areas, so that each gets a row.

Scope: the whole stage diff, and only code it adds or changes. Inputs: the evidence folder, the stage's plan file and acceptance file (`stage.plans`, `docs.acceptance`), `docs.decisions`, <the project's invariants and where its feature gates live>.

Severity: the rubric's high is P1, its medium is P2, its low is P3. Each finding names `path:line` and the traced case, with no research left unfinished.

1. **Bugs.** Does any added or changed code do the wrong thing for an input or a sequence it can meet?
2. **Breaking functionality.** Traced through callers and across packages: does the change break something that worked?
3. **Security.** Does the change open a vulnerability, or weaken an isolation or authority check?
4. **Developer setup.** Does it change how the code is run or built locally: secrets, environment variables, ports, a script that must now be run?
5. **Feature leaks.** Does anything meant to sit behind a feature gate or an internal-only check now escape it?

When your own audit is done, and only then, read the stage pull request's discussion as the rubric says.

**Fail condition:** a high or medium finding.
