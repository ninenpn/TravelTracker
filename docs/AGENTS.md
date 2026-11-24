# Developer ↔ QA workflow

```
 user request ──► /dev-qa-loop (main session = orchestrator)
                     │ writes .claude/handoff/task.md
        ┌────────────▼─────────────┐
        │ round n (max 5)          │
        │  developer agent ──► dev-report.md
        │  qa agent        ──► qa-report.md   (VERDICT: PASS | FAIL)
        └────┬───────────────┬─────┘
          FAIL│            PASS│
   developer reads          final test run → (optional) commit/push → deploy-and-verify → report to user
   qa-report.md, fixes
```
Subagents cannot spawn each other, so the **main session orchestrates**; the agents talk only through files in `.claude/handoff/` (git-ignored except `.gitkeep`).

## Files
| File | Purpose |
|---|---|
| `.claude/agents/developer.md` | implements; runs `bash tests/run.sh --sql`; writes `dev-report.md`; never commits |
| `.claude/agents/qa.md` | independent verification; read-only on the repo; writes only `qa-report.md` |
| `.claude/skills/dev-qa-loop` | the orchestration loop (`/dev-qa-loop <task>`) |
| `.claude/skills/run-qa` | run + interpret the whole test suite |
| `.claude/skills/deploy-and-verify` | commit/push, Pages deploy check, the "Deployment failed, try again later" recovery, confirm build id |
| `.claude/skills/supabase-ops` | safe database operations (keys, RLS, PIN reset, quota, what needs the user) |
| `.claude/skills/import-trip` | Excel/Drive trip → Supabase pipeline |
| `CLAUDE.md` | project memory + hard rules (loaded every session) |

Agent definitions load at session start — after editing them, open a new session (or run `/agents`).

## How to use
- **Whole task with verification**: `/dev-qa-loop add a "share trip" button to the menu` (say "and deploy" if you want it pushed).
- **Just verify the current tree**: `/run-qa` (or ask the `qa` agent directly).
- **Just build**: ask the `developer` agent — but remember it does not self-verify independently.
- **Deploy**: `/deploy-and-verify`.

## Handoff templates
`task.md`
```
# Task
<goal>
## Acceptance criteria
1. <observable, testable>
## Constraints / out of scope
## Commit/push after PASS?  yes|no
```
`dev-report.md`
```
# Dev report — round <n>
Criteria as understood: ...
Changed files: <path> — <why>
Tests added/changed: ...
Verification: <commands> → <RESULT lines>
Not verified / risks: ...
```
`qa-report.md` — format in `.claude/agents/qa.md` (first line `VERDICT: PASS|FAIL`).

## Rules of the loop
- QA is the only one who can declare PASS; Developer never edits the QA report.
- Never weaken tests, criteria or checks to turn a FAIL into PASS. A wrong test must be corrected openly (with the reason in the dev report) and QA re-checks it.
- Max 5 rounds, then escalate to the user with the remaining findings.
- Every round must run the real gates (`bash tests/run.sh --sql`); reports without command output are not evidence.
- Nothing private or secret in the repo, ever (CLAUDE.md rules 1–2); QA checks the diff for it.
