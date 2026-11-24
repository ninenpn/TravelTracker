---
name: dev-qa-loop
description: Run a task through the Developer → QA → Developer … loop until QA passes (max 5 rounds). Use when the user asks to build, change or fix something in Travel Tracker and wants it implemented AND independently verified, e.g. "/dev-qa-loop add X". Orchestrates the `developer` and `qa` agents through files in .claude/handoff/.
---

# Developer ↔ QA loop

Subagents cannot call each other, so **you (the main session) orchestrate**. Run the two agents strictly one after the other (never in parallel). They communicate only through files in `.claude/handoff/` (see docs/AGENTS.md for templates).

## 0. Prepare
1. Turn the user's request into `.claude/handoff/task.md`:
   ```
   # Task
   <one-paragraph goal>
   ## Acceptance criteria   (testable, numbered)
   1. ...
   ## Constraints / out of scope
   ## Commit/push after PASS?  yes|no   (default: yes only if the user said so)
   ```
   Make criteria concrete and verifiable (what the user will see, which data, which phone sizes). If the request is vague, choose sensible criteria and state them — do not stall.
2. Delete stale `.claude/handoff/dev-report.md` and `qa-report.md` from earlier tasks. Set `round = 1`.

## 1. Loop (max 5 rounds)
Repeat:
1. **Developer**: `Agent(subagent_type: "developer", prompt: "Round <n>. Read .claude/handoff/task.md" + (n>1 ? " and the QA findings in .claude/handoff/qa-report.md; fix every blocker/major finding" : "") + ". Implement, run `bash tests/run.sh --sql`, write .claude/handoff/dev-report.md.")`
2. **QA**: `Agent(subagent_type: "qa", prompt: "Round <n>. Verify the work for .claude/handoff/task.md independently as described in your instructions; write .claude/handoff/qa-report.md.")`
3. Read only the first line + Findings of `.claude/handoff/qa-report.md`:
   - `VERDICT: PASS` → leave the loop.
   - `VERDICT: FAIL` → `round += 1`, go to step 1 (the developer reads the report itself; do not paraphrase it).
   - Report missing/unparseable → ask QA once to rewrite it; if still bad, treat as FAIL.
4. If the same finding survives 2 rounds, add a hint to the next developer prompt (root-cause suspicion) instead of repeating verbatim.

If round 5 still fails: stop, show the user the remaining findings and your assessment (real defect vs. wrong test vs. unclear requirement) and ask how to proceed. Do **not** weaken tests or loosen criteria to force a PASS.

## 2. Finish
- Run `bash tests/run.sh --sql` yourself once more on the final tree (belt and braces).
- If the task says commit/push (or the user asked): follow `.claude/skills/deploy-and-verify/SKILL.md`.
- Report to the user in Thai: what changed, rounds taken, QA verdict + the final `RESULT:` lines, what was *not* verified, and any follow-up the user must do (e.g. run a SQL file, rotate a key). Keep it short and honest.

## Notes
- Agent files are loaded when a Claude Code session starts: after creating/editing `.claude/agents/*.md`, start a new session (or use `/agents`) before first use.
- Token hygiene: don't paste whole reports into your own context; read the verdict and findings only.
