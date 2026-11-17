# Review: built as described

A live session at phase exit: drive the product by hand on a fresh stack at the candidate and compare what you see with what was asked for. A criterion passes only when you saw it pass. Starting the stack and driving it is not a fix: this review changes no code.

Inputs: `docs.roadmap`, `docs.acceptance`, `docs.journeys`, `docs.stories`, `docs.product`, `docs.decisions`, a lane (`lanes`), <the project's verify skill: starts the stack, signs in, drives the browser>, <the phase's design, if any>.

1. **Each acceptance criterion,** through the ordinary controls, from sign-in to the observable result, a reload and the next dependent action. No mocked responses, no injected state. PASS, FAIL, NOT TESTED, or MANUAL (needs a person or a live model: say what), with the screenshot or trace in the evidence folder.
2. **Each journey** of the phase, end to end: does each step do what the journey text says, in its order?
3. **Intent.** Does what you saw match the story, the product doc and the decisions, not only the criterion's letter? Name each place where it works but is not what was described.
4. **Failure cases.** Each refusal, conflict, restart or missing right the criteria name: does the person see what the criterion says?
5. **Design.** Style and layout only (spacing, hierarchy, type, colour, components) against the given design.

**Fail condition:** a criterion FAIL or NOT TESTED.
