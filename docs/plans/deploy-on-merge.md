# Plan: Deploy on merge

Status: workflow written; needs the two repo secrets, then a first run

Goal: a push to `main` (a merged PR) deploys the app, so nobody has to run `pnpm run deploy` by hand.

## Decisions

| Topic      | Choice                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool       | GitHub Action (`.github/workflows/deploy.yml`), not Cloudflare Workers Builds: lives in the repo, reviewed like code. Free: the repo is public                                      |
| Steps      | `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm db:migrate:remote`, `pnpm run deploy`. A failing check stops the deploy                                                       |
| Migrations | D1 migrations run in the workflow, before the deploy, so new code never meets an old schema. Durable Object migrations are in `wrangler.jsonc` and apply with the deploy, as before |
| Secrets    | `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub. The Worker's own secrets stay in Cloudflare (`wrangler secret put`); a deploy keeps them                              |
| Overlap    | `concurrency: deploy`: one deploy at a time, a newer one waits                                                                                                                      |
| Manual run | `workflow_dispatch` ("Run workflow" in the Actions tab). `pnpm run deploy` from a laptop still works                                                                                |

## Steps

- [x] **1.** Workflow file.
- [ ] **2.** Cloudflare API token (dashboard > My Profile > API Tokens > Create Token, "Edit Cloudflare Workers" template, then add **Account > D1 > Edit**; limit it to this account and the `deathstalker.dev` zone). Copy the account ID from the Workers overview page.
- [ ] **3.** GitHub: add both as repository secrets (`gh secret set CLOUDFLARE_API_TOKEN`, `gh secret set CLOUDFLARE_ACCOUNT_ID`).
- [ ] **4.** First run: merge this PR (or "Run workflow"); the run is green and `wrangler deployments list` shows a new deployment.
- [ ] **5.** Update `docs/project-context.md` §10 (Phase 4 deploy line).
