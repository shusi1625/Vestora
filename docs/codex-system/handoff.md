# Vestora Handoff

Snapshot: 2026-10-23 documentation/commit checkpoint. Re-read Git state and dated evidence before continuing.
Repository: `C:/GitHub/Vestora`, not the older OneDrive planning workspace.

## Implementation

- Contracts remain settlement authority; backend/indexer/PostgreSQL serve projections.
- Existing Next.js `frontend` has a component-based live dashboard, design-system gallery, valuation helpers and transaction persistence/guards. See [design-system status](../design-system/README.md).
- `frontend-sample` is the newer Vite UI with market/assets/sales/issued/create/history screens, live reads, wallet disconnection, claim and fully funded payment creation. Its live buy/list/unlist/payment-cancel actions remain disabled.
- New backend request spans are local-only, off by default, and covered by isolated Fastify tests. They are not deployed server timings.
- New local settlement tests cover self-recipients, one-raw/uneven amount/time boundaries and cancellation/refund conservation.

## Evidence And Open Work

- [Development checkpoint](../report/development-progress-2026-10-23.md) separates implemented, locally verified, actually observed and incomplete work.
- [Performance checkpoint](../report/performance-status-2026-10-23.md): G1 did not reproduce the old pending cause; G2 sent 982/1049 requests with 67 unissued; G3 stopped after 230 HTTP-200 reads and 33 API/UI batches. Do not call the whole performance effort complete.
- G3 stopped because the CPU-credit metric sample was older than its guard, not because credit exhaustion or overload was established. Actual main G3 is not authorized to repeat under the spent approval.
- B-account #3 hashless claim remains blocked. Do not clear/retry it, infer a missing hash, or treat a new browser origin as a clean authorization to submit.
- `frontend-sample` promotion into `frontend` and a new Vercel deployment were requested, then paused for this checkpoint. No move, new hosting project or deployment has occurred. Preserve both implementations until the promotion is explicitly resumed.
- New-origin transaction recovery, HTTPS/server-side API routing, SPA deep-link handling and production-vs-QA build isolation must be addressed before public deployment.

## AWS Context

- Phase 9.6's 2026-10-16 rollout is a historical snapshot: [deployment evidence](../report/phase-09-6-aws-deployment.md).
- API revision 3 / worker revision 4 and the plain-HTTP API IP are dated observations, not guaranteed current state. Confirm the actual task/endpoint before any approved live operation.
- Preserve operating events/cursors and the retained RDS backup. Follow the [writer transition order](../roadmap/phases/phase-09-6-recovery-consistency.md) for any later approved migration/rollout.
- Future AWS/DB changes, deployments, wallet signatures, commits and pushes require explicit authorization. No automatic Obsidian commit.

Fresh-chat prompt:

> Work in C:/GitHub/Vestora. Read applicable AGENTS.md and docs/codex-system/handoff.md. Confirm Git status and the 2026-10-23 progress/performance reports. Do not deploy, retry transactions, alter AWS/DB or push without the requested scope and authorization.
