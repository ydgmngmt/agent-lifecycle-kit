# Review: built as described

A live session at phase exit. You drive the product by hand on a fresh stack at `CANDIDATE` and compare what you see with what was asked for. This review decides acceptance criteria: a criterion passes only when you saw it pass.

Inputs: the phase's acceptance criteria and journeys (`docs.roadmap`, `docs.acceptance`, `docs.journeys`), its stories (`docs.stories`), the product intent (`docs.product`) and the decisions (`docs.decisions`), a lane (`lanes`), and <the project's verify skill, which starts the stack, signs in and drives the browser>. Where the phase was given a design, <where the design lives>.

1. For each acceptance criterion: drive it through the ordinary controls, as a person or agent would, from sign-in to the observable result, a reload, and the next dependent action. No mocked responses, no injected state. Record PASS, FAIL or NOT TESTED with the screenshot or trace in the evidence folder.
2. For each journey of the phase: walk it end to end. Does each step do what the journey text says, in the order it says?
3. Does what you saw match the story and the intent in the product doc and the decisions, not only the letter of the criterion? Name each place where it works but is not what was described.
4. Failure cases: drive each refusal, conflict, restart or missing right the criteria name. Does the person see what the criterion says?
5. Design: compare style and layout only (spacing, hierarchy, type, colour, components used) with the given design. Copy and data are not judged here.

Fail condition: any criterion FAIL or NOT TESTED. A step you could not do (it needs a person or a live model) is MANUAL, with what it needs.
