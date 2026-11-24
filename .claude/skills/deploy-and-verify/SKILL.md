---
name: deploy-and-verify
description: Commit, push (working branch and main) and confirm the GitHub Pages deploy actually went live for Travel Tracker; handle the flaky "Deployment failed, try again later" case correctly. Use after QA passes or whenever the user asks to deploy / check if deploy failed.
---

# Deploy and verify

1. **Gate**: `bash tests/run.sh --quick` must pass (no secrets/private data). Prefer the full `bash tests/run.sh --sql` first.
2. **Commit** only intended files (`git status`; no `.xlsx`, `private/`, `.env`, `.claude/handoff/*.md` reports). Message in Thai or English, end with the attribution lines given in the session reminder.
3. **Push**: `git push -u origin <working-branch>` then `git push origin <working-branch>:main` (retry network errors up to 4× with backoff). No PRs unless asked. Never force-push, never push an empty commit.
4. **Watch the deploy** (tools `mcp__github__actions_list`, owner `ninenpn`, repo `TravelTracker`): `list_workflow_runs` → the newest "Deploy to GitHub Pages" run for your commit SHA → `list_workflow_jobs` → if `failure`, `get_job_logs` with `return_content: true`.
5. **If it failed** — read the log, then:
   - `Deployment failed, try again later` / Pages-side error while build + upload steps are green → transient. **Do not use "re-run"** (the artifact from attempt 1 is gone → "Found 0 artifact(s)"). Start a fresh run: `mcp__github__actions_run_trigger` `run_workflow` with `workflow_id: pages.yml`, `ref: main` (workflow has `workflow_dispatch`). Wait ~20–60 s.
   - Any earlier step failing (checkout, stamp, upload) → real problem in the repo/workflow: fix it, new commit.
   - Check https://www.githubstatus.com/api/v2/summary.json if it keeps failing.
6. **Confirm it is live** (the stamped build id is the commit's short SHA):
   ```bash
   curl -sL https://ninenpn.github.io/TravelTracker/ | grep -o 'BUILD="[^"]*"'      # must equal git rev-parse --short HEAD
   curl -s  https://ninenpn.github.io/TravelTracker/app.js | grep -c "<a new function name from this change>"
   ```
   Poll every ~10 s for up to ~3 min. The service worker does not cache, so a hard refresh is enough on phones.
7. Tell the user the build id that is live and what (if anything) they must still do (SQL to run, key to rotate).
