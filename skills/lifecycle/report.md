# Merge-ready report

An owner session writes it to the report file its kickoff names when its pull request is merge-ready, then tells the lead in one line (`lc-tell lead`). The swarm's audit lane checks every receipt in it, so each claim names the command or the file that shows it.

- **Status:** DONE, DONE_WITH_CONCERNS, BLOCKED or NEEDS_CONTEXT.
- **Branch, full head SHA, PR number and CI state.**
- **Scope:** each box of its plan section, checked or not, with `path:line`.
- **Playbook and principles:** which playbook ran, and each principle that changed a choice.
- **Tests added:** each with the behaviour it catches, in one line, and its red-then-green proof.
- **Checks run:** each command and its result. The flow scripts: which ran, on which head, result and elapsed time.
- **Statechart, proof or model check:** the output's path and what it found, or "no state machine or proved algorithm touched".
- **Corrections:** each one, the level it was fixed at (architecture, types, rule, test, prose), the rule's id and its red example, and its row in the rule table.
- **Artifacts:** the recording or screenshot of the changed behaviour, linked in the pull request.
- **Docs updated:** stories, journeys, roadmap and glossary, or "no behaviour change".
- **Deviations, questions, and follow-ups filed as issues.**
