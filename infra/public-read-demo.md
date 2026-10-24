# Limited Public Read Demo

## Scope

On 2026-10-23 the user approved keeping the Vercel same-origin proxy, hardening and redeploying only the API service, exposing TCP 3001 to the internet after verification, and updating/redeploying Vercel for a replaced origin IP. Database/indexer changes, migrations, wallet signatures, Git commits and pushes are excluded.

This supersedes the earlier CloudFront-only choice. It is a separate explicitly approved public-read route, not a bypass of the denied PricingPlanManager permission. No CloudFront, WAF, ALB, DNS zone or pricing subscription is created.

## Protection Contract

- Vercel remains the browser-facing HTTPS origin with its existing GET-only, fixed-target, query-free, cookie-free read proxy and 10s timeout/2 MiB cap.
- The API independently restricts raw URLs to GET `/health`, `/streams`, `/streams/:streamId`, `/users/:address/trades`; all queries and other methods/paths are rejected before domain handlers.
- `PUBLIC_READ_MODE=true` is mandatory for this deployment. `/metrics`, `/listings`, `/market/stats` and user-stream diagnostics are not public. CORS reflection and per-request logs are disabled in public mode.
- Real socket-IP budget: 90/min; whole-process budget: 300/min; at most 2 active public handlers. Forwarded headers cannot supply the rate key. Over-cap reads fail with 429/503 and Retry-After before DB/RPC work. Budgets are shared across all public paths, including rejected paths.
- Real loopback GET `/health` is exempt so external budget exhaustion cannot trigger unhealthy container replacement. Other loopback paths are not exempt.
- API uses an immutable ECR image digest. Existing roles, secret references, CPU/memory, ports, subnets and service count are preserved. Only an API image, public-mode flag and native Node health probe are added. No migration or worker command is run.

## Safe Rollout Order

1. Run offline guard/app/proxy regressions and backend typecheck/build. Test the built image with networking disabled.
2. Upload a new tag to the existing ECR repository; resolve and pin its immutable digest.
3. Register/update the API only, while ingress still permits only the original operator IPv4 /32.
4. Verify the new task is healthy and serves `x-vestora-read-policy: public-v1`; verify operational paths and writes are denied.
5. Require completed rollout, exactly one new API task and no old unguarded API task before internet ingress.
6. Add only TCP 3001 IPv4 ingress. Retain the operator rule and DB TCP 5432 self-group rule unchanged. Do not add IPv6 ingress or open database ports. Record the new security-group rule ID for removal.
7. Update only the Vercel server origin variable and redeploy the existing project. Keep browser API base `/vestora-api` and all transaction holds.
8. Bounded smoke: actual health/list/detail/history, direct and proxied denials, desktop/mobile read screens. Do not generate a live request flood to demonstrate the limiter.

## Rollback

**Revoke the added internet rule before rolling back the API image or disabling PUBLIC_READ_MODE.** Otherwise the old unrestricted operational API becomes publicly accessible. Preserve the operator /32 and the DB rule. Reverting Vercel alone does not close the origin. No database rollback/migration or indexer restart is part of this procedure.

## Limits

Internet ingress is IPv4-wide on TCP 3001; "limited" refers to the application surface and budgets, not network identity authentication. Anyone can directly call allowed public reads. The Vercel-to-origin hop remains HTTP; never forward credentials on it. The proxy's response cap does not cap direct-origin response sizes. This does not provide distributed rate limits, a DDoS defense, cost guarantees, TLS for the origin hop, stable origin IPs, paginated queries, live wallet E2E or completed load/performance tests. Budgets reset on restart and multiply if replicas are added. Existing ECS/RDS, ECR storage and transfer costs remain.

## Local Evidence

- `corepack pnpm test:public-read`: 13/13 guard cases, network blocked.
- `node --experimental-vm-modules --test backend/scripts/test-local-spans.mjs`: 14/14 current-app cases with fake DB/RPC; 2 are public-mode integration cases.
- Backend typecheck and build pass. Docker production image build and network-disabled blocked-path smoke pass.
- `npm --prefix frontend run test:deployment`: 8/8 proxy guards.

Deployment-specific endpoint, rule ID and observed smoke results belong in `frontend/docs/vercel-deployment.md`; this checklist is not itself evidence that ingress or UI verification succeeded.
