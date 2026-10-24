# Vercel Deployment (2026-10-23)

Status: folder promotion complete; Vercel frontend READY and **actual projection reads connected via the approved guarded public-read API**. Initial ingress/CloudFront failures below are historical evidence. This is not wallet E2E or completed load/performance validation.

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
- The frontend is HTTPS. The backend origin is HTTP; that hop and the replaceable task IP remain limitations. The initial frontend promotion did not change AWS; the separately approved public-read follow-up below updates only the API service and TCP 3001 ingress.

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

## HTTPS Connection Follow-up: Organization Policy Block

This section records the earlier stopped CloudFront-only attempt. The later explicitly approved public-read alternative is recorded separately below; the organization denial itself was not bypassed or resolved.

On 2026-10-23 the user explicitly approved a CloudFront **FREE** plan, API ingress restricted to CloudFront origin-facing ranges, and Vercel origin update/redeployment. Paid plans, paid ALBs, database changes and wallet transactions were excluded. If the free plan could not be verified, the operation had to stop.

Read-only preflight found no existing CloudFront distribution, load balancer or Route53 hosted zone to reuse. The existing API's AWS public DNS name resolves to its observed IPv4 address, and the regional AWS-managed CloudFront origin-facing prefix list exists. These are feasibility observations, not deployed connectivity.

The decisive preflight command was:

```powershell
aws pricing-plan-manager list-subscriptions --region us-east-1 --output json --no-cli-pager
```

It returned `AccessDeniedException`: `pricingplanmanager:ListSubscriptions` is **explicitly denied by an AWS Organizations service control policy (SCP)** for the current `AccountFullAccessRole` session. The installed CLI supports the `pricing-plan-manager` service; this is not a missing-command or expired-login failure. No alternate identity, console endpoint or API was tried to circumvent that deny.

Consequently:

- CloudFront/WAF resources or pricing subscriptions: **none created**.
- Security-group ingress, ECS services/tasks, RDS, operating data and checkpoints: **unchanged**.
- Vercel API origin, source deployment and production alias: **unchanged** in this follow-up.
- No paid-plan fallback, public `0.0.0.0/0` port rule, live load test or wallet request.
- Actual values on the public frontend remain unavailable; this request is not complete.

### Administrator Handoff

Ask the AWS Organizations administrator to review the explicit SCP deny for this member account. Request the minimum access needed to inspect/activate only the intended CloudFront FREE subscription: `pricingplanmanager:ListSubscriptions`, `pricingplanmanager:GetSubscription`, and `pricingplanmanager:CreateSubscription`. This is a review request, not an instruction to grant wildcard administrator access or enable paid plans. Other resource permissions must also be checked before creation; they have not been proven by the read-only checks.

Adding an IAM Allow or logging in again cannot override an explicit SCP deny. Do not remove organization guardrails or change accounts without separate authorization. See [AWS SCP permissions](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html) and [PricingPlanManager prerequisites](https://docs.aws.amazon.com/PricingPlanManager/latest/UserGuide/getting-started-pricingplanmanager-api.html).

After the administrator resolves the permission, recheck the FREE plan and its account eligibility before creating resources. The API requires an existing CloudFront distribution and a CLOUDFRONT-scope WAF ACL for a subscription; do not provision uncovered paid resources on the assumption that later subscription approval will succeed. Confirm the creation/enrollment sequence and any temporary billing exposure first. Keep caching disabled for financial API responses, the origin-facing ingress narrow, and the original operator access/DB rules unchanged. Only then update the Vercel server origin, redeploy, and perform bounded real API/desktop/mobile verification. No successful connected-screen evidence exists yet.

## Approved Limited Public Read Connection

On 2026-10-23 the user explicitly approved API protection and API-only redeployment, public IPv4 TCP 3001 ingress, and Vercel origin update/redeployment. The user acknowledged the HTTP origin hop, direct public reachability and remaining traffic/cost risk. Database/indexer changes, wallet actions and Git commit/push were excluded. This is a new authorized route, not a workaround for an organization permission denial.

| Item | Observed result |
| --- | --- |
| API source | New `backend/src/api/public-read.ts`, enabled only by exact `PUBLIC_READ_MODE=true`; invalid flags fail startup |
| Public surface | Query-free GET health/streams/stream detail/user trades only; operations/other paths 404, non-GET 405, GET bodies rejected |
| Limits | 90/min per real socket IP, 300/min per process, 2 active public handlers; 429/503 with Retry-After before DB/RPC; forwarded headers ignored |
| Response/log policy | No-store, no reflected CORS, no per-request logs in public mode; real loopback health probe exempt from public budgets |
| ECR image | Existing repository, new tag `public-read-20261023`, immutable digest `sha256:1700775d71a612667a393ccd2cb685e5a15c38ea5d76e8a1bfa2c462473509ad` |
| API rollout | `vestora-backend-api:4`, protected native Node health probe, HEALTHY and COMPLETED at 1 running/0 pending; previous revision-3 task STOPPED before ingress opened |
| Preserved resources | Indexer revision 4 and original task `c29918d6941b4e7d91dca27dac8ce403` remained RUNNING; no migration, worker update or DB setting/data manipulation |
| Origin snapshot | `http://54.206.10.33:3001`; task replacement can change it |
| Ingress | Added only IPv4 TCP 3001 `0.0.0.0/0`, rule `sgr-0a9f5cc30be80c67b`; existing operator /32, DB 5432 self-group and IPv6 rules unchanged |
| Vercel environment | Server-only `VESTORA_API_PROXY_TARGET` updated; the existing shared variable covers Production and Preview; browser base unchanged |
| Production deployment | `dpl_CTZcDLf52YNG1McnvD5eUeMTKPJU`, READY, immutable `https://vestora-ijbanmjpg-shusi1625s-projects.vercel.app`, alias unchanged |
| Direct protected smoke | 4 requests before internet opening: health/list 200, metrics 404, POST streams 405; each had `public-v1` marker |
| Anonymous Vercel smoke | 6 requests: health/list/#4 detail/B trade history 200, metrics 404, POST streams 405; no-store preserved |
| Actual projection | 4 streams, synced/applied, indexed=projected=11976568, lag 0 at observation; not a sustained freshness/performance claim |
| Browser observations | Isolated headless Edge, market/assets at 1440x1000 and 390x844, 4 screenshots inspected, 7 actual API GETs all 200 (cap 24), no page errors/whole-page horizontal overflow |
| Browser exclusions | No wallet access; 2 direct RPC attempts blocked by the test. B watch-only rows #3/#4 rendered; wallet-balance unavailable and stale-data notices remained visible. No balance/signature/E2E claim |
| Local verification | Guard 13/13, app 14/14 with fake DB/RPC, existing proxy 8/8, backend typecheck/build, production Docker build and network-disabled image smoke passed |

Docker Desktop's credential helper failed locally. The successful upload used a separate file-based temporary Docker config and removed that authentication file immediately in a finally block. No credential, .env file or secret value was copied to source or printed. The existing Docker configuration was not edited.

## 2026-10-24 Approved Frontend QA Release

- User explicitly approved this frontend-only release. Existing project `shusi1625s-projects/vestora`, deployment `dpl_6ERvKHwVxG7qtz2ErBF6TY5yNTN5`, immutable URL https://vestora-lvvkqtrsx-shusi1625s-projects.vercel.app, production https://vestora-alpha.vercel.app. READY at2026-10-23T16:42:25.551Z; `api/read` remains in Sydney. No environment-variable, AWS/API service, DB/indexer or wallet mutation was performed.
- Included product changes: sequential abort-aware personal-history detail reads; unknown acquisition when history is unavailable; account-scoped previously confirmed receipt retained outside the history list's error boundary. Production asset `index-DC8wiL3n.js` matches the verified local build1207.39kB/gzip367.48kB. Existing Node22.x target and npm-ci/Vite build configuration remain; Vercel build passed.
- Anonymous smoke: eight serial GETs, at most1/s, no retries. Market/transactions HTML, API health/list/#1 detail200; manual-QA source, original archive and QA output404. Financial API no-store remains. Build READY is not alone treated as a successful data test.
- Actual Chrome: same product hash, B actual empty history/A public watch-only four-record history, correct known acquisition labels and personal claims, exact #2 receipt remains open through normal projection advancement11977966 to11977969. Live history-failure/recovery transitions were not forced; those remain isolated evidence. The user's newly reported A load error was not reproduced/captured by this healthy observation.
- Seven read-only RPCs confirmed the supplied C address has0.001SepoliaETH at block11977930. This does not authorize transactions or prove the wallet's final maximum gas affordability. B#3 hold and disconnected live marketplace/cancellation remain intact.
- **Working copy differs from this deployment:** the later user-reported silent reconnect led to an explicit account-permission selection flow and `계정 변경` button. That subsequent change passed local check179/179+proxy8/8, load-safety32/32, UI-performance180/180, QA types and production build (`index-DyM0ahtv.js`,1208.60kB/gzip367.77kB), but needs another explicit release approval and actual MetaMask revalidation. Do not attribute this account-picker change to the release above.
- Vercel npm audit output reported7 findings. A subsequent omit-dev audit reported4 (low1/moderate3, high0/critical0); no major upgrades or audit-fix command was applied. Existing large-chunk and third-party annotation warnings persist. Package audit is not a deployed exploit/security assessment.
- Plan/ledger: [follow-up goal](./deployed-qa-goal-2026-10-23.md). Raw smoke, C funding, browser observations and current local logs: `C:/Users/AAAAA/.codex/visualizations/2026/08/26/01a03f12-2ef4-76b2-a500-d626b17f045e/goal-qa-2026-10-23/`. No commit/push, real load test or actual chain transaction in this QA release.

### Separately Approved Account-Selection Release

The preceding working-copy note is historical. The user subsequently explicitly approved one more frontend deployment. `dpl_45AszhS4a5i3Vx8hSBhTkcjVHQHB` is now READY (2026-10-23T16:56:27.975Z), immutable https://vestora-geqaw0ufk-shusi1625s-projects.vercel.app; production alias is unchanged. Vercel build produced the verified `index-DyM0ahtv.js` and the Sydney read function. The second bounded anonymous eight-GET smoke passed the same actual API/no-store and QA-file exclusion checks; raw output is `reconnect-release-smoke.json`, build log `reconnect-vercel-build.log`.

Actual Chrome reload shows the new asset, `계정 변경` button and unchanged B#3 hold. Explicit connection/account change now requests only the existing account-access capability before reading exposed accounts; it does not revoke token approvals, sign or submit a transaction. Unsupported/cancelled/malformed selection has no silent cached-account fallback. This implementation and deployment do not prove the actual MetaMask picker worked: human selection/rejection, A data-error reproduction and real on-chain tests remain pending. No AWS/config/DB/indexer/commit/push or wallet mutation was added to this approval.

The added network rule is IPv4-wide: application path/method/rate limits, not source-identity authentication, provide the restricted surface. Direct-origin callers can bypass Vercel's response-byte cap but cannot bypass the API gate. In-process counters reset on restart and multiply if replicas are added. This is not a DDoS defense or a bill cap. Existing ECS/RDS operations, ECR storage and transfer can cost money; no CloudFront/WAF/ALB/DNS/paid plan was created.

**Rollback order: revoke `sgr-0a9f5cc30be80c67b` before reverting API revision 4 or disabling public mode.** Retain the operator /32 and DB rule. Reverting Vercel alone does not close the origin. See [limited public-read guide](../../infra/public-read-demo.md). The known B #3 account hold and disabled marketplace/cancellation writes remain unchanged. No load test, contract/DB migration, indexer redeployment, Git commit/push or wallet signing was performed.

## 2026-10-24 Separately Approved Feature-Parity Release

The user skipped the remaining local boundary matrix and explicitly requested frontend redeployment first. Existing project/alias and server-origin variables were reused. Deployment `dpl_3maxBhcQspcZUaTSrpuQgbei2YyL` was READY at the2026-10-23T20:10:18.977Z inspection; immutable URL https://vestora-7o7vy0z8h-shusi1625s-projects.vercel.app, production https://vestora-alpha.vercel.app/market.

The latest build includes restored mint/list/unlist/protected-buy/issuer-cancel actions, direct ID routes, shared pending guards and the journal/accounting correction. Earlier disabled-action descriptions above belong to older releases. This release enables the UI/engine paths, not automatic sends or permission to perform actual transactions. Absolute-time creation, B#3 hold and all unresolved reservations remain.

Fresh local checks passed473 UI/model,8deployment,32safety,180UI-regression, QA types and production build. Vercel's Node22-configured build succeeded. Deployed `index-BiUzrgH2.js` matched the local bundle bytes. Post-release16-GET smoke passed seven SPA deep links, actual API health/list/#5, asset/locale equality and QA/metrics404 checks;5 actual streams, applied/equal checkpoint11978969 and lag0 at observation.

Actual C/Chrome showed assets#5, card/list, empty sales/issued/history states and the restored sale form. Selected desktop/mobile screens had no document overflow or nested buttons; viewport reset. No wallet/condition-check button was pressed. Listing#2 has zero remaining rights, so its disabled purchase is correct. Remaining boundary/native-wallet/positive-transaction cases were not promoted. Full evidence and console/build warnings: [feature-parity release report](./frontend-parity-release-2026-10-24.md).

No AWS/backend/DB/indexer/contract/environment change, new load run, actual signature, commit or push occurred. Previous deployment is retained; the new release approval is consumed, not reusable for another release.
