# Vestora Handoff

Snapshot: 2026-10-23 frontend folders promoted; Vercel deployment preparation. Re-read Git state and the deployment record before continuing.
Repository: `C:/GitHub/Vestora`, not the older OneDrive planning workspace.

## Implementation

- Contracts remain settlement authority; backend/indexer/PostgreSQL serve projections.
- [Primary `frontend`](../../frontend/README.md) is the Vite UI promoted from `frontend-sample`, with market/assets/sales/issued/create/history screens, live reads, wallet disconnection, claim and fully funded payment creation. Its live buy/list/unlist/payment-cancel actions remain disabled.
- [Preserved Next.js `frontend-legacy`](../../frontend-legacy/README.md) has a component-based live dashboard, design-system gallery, valuation helpers and transaction persistence/guards. The `/design-system` route belongs to this legacy app. See [legacy design-system status](../design-system/README.md).
- New backend request spans are local-only, off by default, and covered by isolated Fastify tests. They are not deployed server timings.
- New local settlement tests cover self-recipients, one-raw/uneven amount/time boundaries and cancellation/refund conservation.

## Evidence And Open Work

- [Development checkpoint](../report/development-progress-2026-10-23.md) separates implemented, locally verified, actually observed and incomplete work.
- [Performance checkpoint](../report/performance-status-2026-10-23.md): G1 did not reproduce the old pending cause; G2 sent 982/1049 requests with 67 unissued; G3 stopped after 230 HTTP-200 reads and 33 API/UI batches. Do not call the whole performance effort complete.
- G3 stopped because the CPU-credit metric sample was older than its guard, not because credit exhaustion or overload was established. Actual main G3 is not authorized to repeat under the spent approval.
- B-account #3 hashless claim remains blocked. Do not clear/retry it, infer a missing hash, or treat a new browser origin as a clean authorization to submit.
- The user authorized moving the Next.js `frontend` to `frontend-legacy`, promoting Vite `frontend-sample` to `frontend`, and Vercel deployment. The main task owns folder moves, Git push, deployment settings, safety and validation. Preserve both implementations.
- Both folders have moved with the original 262 tracked-file hashes verified before production edits. A new `shusi1625s-projects/vestora` project is linked. Read the [deployment record](../../frontend/docs/vercel-deployment.md) for its actual status; a linked project is not a successful deployment.
- The fixed GET-only Vercel API adapter, explicit SPA routes, QA-upload exclusion and known B #3 account hold are implemented with local regression tests. Actual deployment/API/browser behavior remains a separate validation step. The Vercel-to-existing-backend hop remains HTTP.
- Main-owned deployment validation must cover the GET-only API proxy (fixed upstream, path allowlist, cookie-free handling, no-cache, rejected redirects, timeout and response-byte caps), SPA fallback, QA-output exclusion and the B-account #3 guard across origins. This documentation handoff does not establish implementation or deployment completion for those items.
- After the move, run primary UI checks from the repository root with `npm --prefix frontend run check` and `npm --prefix frontend run build:prod`. Legacy model tests use `node --test frontend-legacy/tests/*.test.mjs`. These are reference commands; promotion-specific results belong in the validation/deployment record.
- Dated reports preserve their original paths and observations. Interpret historical `frontend` as the Next.js app now retained in `frontend-legacy`, and historical `frontend-sample` as the Vite app now promoted to `frontend`.

## AWS Context

- Phase 9.6's 2026-10-16 rollout is a historical snapshot: [deployment evidence](../report/phase-09-6-aws-deployment.md).
- API revision 3 / worker revision 4 and the plain-HTTP API IP are dated observations, not guaranteed current state. Confirm the actual task/endpoint before any approved live operation.
- Preserve operating events/cursors and the retained RDS backup. Follow the [writer transition order](../roadmap/phases/phase-09-6-recovery-consistency.md) for any later approved migration/rollout.
- The current promotion/Vercel/push authorization belongs to the main task; it does not authorize this documentation task to perform those operations. Further AWS/DB changes, wallet signatures or actions outside the approved scope require explicit authorization. No automatic Obsidian commit.

Fresh-chat prompt:

> Work in C:/GitHub/Vestora. Read applicable AGENTS.md and docs/codex-system/handoff.md. Confirm Git status, the frontend promotion/deployment record and the 2026-10-23 progress/performance reports. Target layout: frontend is Vite; frontend-legacy is Next.js. Keep B-account #3's hashless claim blocked and live buy/list/unlist/payment-cancel disabled. Stay within the active task's scope and authorization; deployment success must come from the deployment record.
