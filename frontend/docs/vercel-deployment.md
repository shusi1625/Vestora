# Vercel Deployment (2026-10-23)

Status: folder promotion complete and Vercel frontend READY. **Live API integration is blocked by the existing AWS ingress allowlist. This is not an end-to-end working deployment.**

Production frontend: [vestora-alpha.vercel.app](https://vestora-alpha.vercel.app/market).

## Source and Scope

- Previous `frontend/` (Next.js) moved to `frontend-legacy/`; previous `frontend-sample/` (Vite) moved to `frontend/` without deleting the legacy implementation or local environment files.
- All 262 tracked source-file hashes matched the pre-move manifest before production edits. After closing the old isolated manual-QA fixture, the empty former `frontend-sample` directory was removed without recursive deletion.
- Existing four local commits through `15f96f8` were pushed to `origin/main` before migration.
- Old manual/UI previews and the isolated 1,000-row fixture were stopped only to release filesystem locks. No fixture restart, new request allowance, record reset, live load test or wallet transaction was performed.

## Hosting Contract

The Vercel project root is this `frontend/` directory. Use Node 22, `npm ci`, `npm run build:prod`, output `dist`, and the committed `vercel.json`. The Vercel CLI deploys this directory, not the repository root or a QA output.

Set server-only `VESTORA_API_PROXY_TARGET` to the verified existing API origin in Production and Preview. No wallet/private RPC key is required. The public browser API base stays `/vestora-api`; Vercel builds reject sample mode or a different browser API base.

- `api/read.js` and `server/read-proxy.mjs`: fixed configured origin, GET only, streams/detail/user-trades/health allowlist, no caller query passthrough, cookies or Authorization forwarding, redirects, retries or cache.
- Upstream timeout 10 seconds, response cap 2 MiB, function maximum duration 15 seconds, Sydney region. This does not implement global rate limiting or prove abuse resistance.
- Explicit workspace SPA routes serve `index.html`; API errors remain JSON rather than falling back to an HTML page.
- `.vercelignore` excludes local environment files, dependencies, original archives/docs, QA source and outputs from uploads. Product assets/locales and server source remain included.
- The frontend is HTTPS. The existing backend origin is HTTP; that hop and the replaceable task IP remain limitations. No AWS networking/service change is part of this deployment.

Vercel references: [Node runtime](https://vercel.com/docs/functions/runtimes/node-js), [configuration](https://vercel.com/docs/project-configuration/vercel-json).

## New-Origin Transaction Safety

The known B-account unresolved #3 claim is held in code for the exact Sepolia contract/account across origins, even when new-origin localStorage is empty. New claims and payment creation for that account fail before quote/send. Read/receipt recovery and the old original record remain available. No synthetic hash or pending record is inserted.

Other browser pending records are origin-local and not automatically migrated. Do not clear or resend an old request just because this domain shows no local record. The hold is not a claim of on-chain failure or success and is removed only after explicit evidence-backed review.

Live buy/list/unlist/payment cancellation remain disabled. Deployment does not resolve B #3, complete functional P0, pass all 100 manual cases, or turn incomplete G2/G3 into successful performance results.

## Verification Ledger

The final deployment report will record local checks, the production deployment URL/status, bounded read-only API smoke, SPA deep links, product-vs-QA asset inspection, and desktop/mobile browser observations. No wallet signing, backend load run or AWS mutation is authorized by the smoke checks.

Local promotion checks: product model 147/147, deployment adapter 8/8, load safety 32/32, UI performance harness 180/180, lint/app types/QA types/source audit and Vite production build passed. The preserved Next app passed 31/31 tests and its production build. All 500 dependency entries in the lockfile were unchanged; only root name/engine metadata changed. Current documentation links checked: 102 resolved.

Existing-origin preparation smoke: `/health` and `/streams` each read once, both HTTP 200; 4 streams, applied projection and identical indexed/projected checkpoint `11976131`. These two reads do not establish load capacity or a deployed frontend.

New project: `shusi1625s-projects/vestora` on the authenticated Hobby team. CLI deploys only the local `frontend/` directory; no Git integration or repository-root build is assumed. The project was initially created with default framework/Node settings; committed Vercel config and package engines select Vite/Node 22 for the deployment. Server-only API origin is configured for Production and Preview. CLI credentials/OIDC files are local and ignored, never source files.

## Observed Production Results

| Item | Observed result |
| --- | --- |
| Migration commit | `62b4c7c`, pushed to origin/main |
| API rewrite compatibility fix | `630d1bd`, pushed; deployment adapter regression 8/8 again |
| Initial deployment | `dpl_8JWjJnGQ41TBwBQPdZQfEAcZmcrP`, READY, but API returned 400 because Vercel retains the original pathname and appends the rewrite query |
| Fixed deployment | `dpl_9ppsaeP8E8wXqDpquN3rDmLseHbx`, READY, immutable URL `https://vestora-93njuaqd6-shusi1625s-projects.vercel.app` |
| Public production alias | `https://vestora-alpha.vercel.app`; anonymous requests did not require Vercel login |
| Cloud build/runtime | Vite, npm ci, Node 22; `api/read` function in syd1, timeout 15s |
| Direct workspace entry | `/market`, `/assets`, `/my/sales`, `/manage/issued`, `/manage/create`, `/transactions`: all HTTP 200 HTML |
| Excluded source/credentials | `/tests/manual-qa/main.tsx`, `/docs/original-source.zip`, `/.env.local`: all HTTP 404; response bodies not copied |
| Write/unknown-path guards | POST `/vestora-api/streams`: 405. Unknown API path after compatibility fix: 404 JSON |
| Live upstream integration | Fixed proxy health/list/detail each returned 504 `upstream-unavailable`, not sample data or HTML |
| Browser attempt | Isolated headless Edge could not obtain a projection before the 30s UI wait deadline; no successful screenshots or personal UI validation claimed |

The original-prefix query handling now accepts only one internal `path` equal to the original path; mismatches, duplicates and other queries remain rejected. The first READY deployment was not called functional merely because its build passed.

## Confirmed Network Block and Next Approval

A single read-only `describe-security-groups` query confirmed the existing ECS security group allows TCP 3001 only from the operator's IPv4 `/32`. The local two-read preparation smoke succeeds from that allowed source; the Vercel server origin is not allowed. No ingress rule, ECS task, DB, DNS or AWS resource was modified.

HTTPS is available for the frontend, but actual data cannot load until an approved backend access path exists. The user was asked to choose between a properly scoped HTTPS API entry point (cost/configuration review first), a temporary explicitly risk-accepted public demo port, or retaining the restriction and deferring live data. Do not open `0.0.0.0/0`, invent fixed Hobby egress IPs, or create paid AWS resources without that decision.

The failed browser attempt is not a full desktop/mobile audit, live balance verification or wallet E2E. Its isolated profile had no real wallet, blocked direct RPC, capped API reads at 24 and closed after failure. Existing browser records were not changed. No G2/G3 approval was reused.
