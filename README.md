# Vestora

Fully funded token-payment streams and a receivable NFT marketplace on Sepolia.
Smart contracts settle transactions; the backend indexes events and serves projection data.
Transaction-critical ownership, allowances and amounts must be rechecked on-chain.

## Current Checkpoint

As of 2026-10-24, both frontend folders have been promoted to the layout below. Production deployment evidence is tracked separately from the folder move.

- `frontend/`: primary Vite/React interface, promoted from `frontend-sample/`, with live API reads, claims, fully funded payment creation, marketplace buy/list/unlist, payment cancellation and test-token minting. Each live action requires fresh on-chain checks and explicit wallet approval; implemented actions are not proof that every deployed E2E case passed.
- `frontend-legacy/`: preserved Next.js dashboard, shared components, transaction guards, recovery and the legacy `/design-system` gallery. It is maintained separately from the primary Vite UI.
- `backend/`: Fastify API, PostgreSQL projections and indexer. Opt-in local request spans remain disabled in production; the API has bounded public-read protection.
- `contracts/` and `test/`: settlement contracts and local boundary/invariant tests.

Folder promotion and the approved limited public-read connection are complete. The [Vercel frontend](https://vestora-alpha.vercel.app/market) reads actual AWS projections through its existing same-origin proxy. On 2026-10-23 health/list/detail/history returned 200 and desktop/mobile read screens were checked. See the [deployment record](frontend/docs/vercel-deployment.md) and [public-read rollout/rollback guide](infra/public-read-demo.md). The origin hop remains HTTP; this is not wallet E2E, a DDoS/cost guarantee or completion of the outstanding functional/performance tests.

Start with [development progress](docs/report/development-progress-2026-10-23.md), [performance status](docs/report/performance-status-2026-10-23.md), and [handoff](docs/codex-system/handoff.md).
Local tests, measured AWS reads, user-signed transactions and deployed product behavior are different evidence levels. G1/G2/G3 and wallet E2E are not collectively complete.
The [2026-10-24 Git publish checkpoint](docs/report/git-publish-checkpoint-2026-10-24.md) records the latest local validation and unresolved demo requests.

## Local Verification

Use the installed package-manager versions and consult each workspace's setup notes.

```powershell
# Simulated local chain only; never add --network sepolia to a regression command.
npm run contracts:test

# Backend compile and isolated request-span regression.
corepack pnpm --dir backend typecheck
corepack pnpm --dir backend build
node --experimental-vm-modules --test backend/scripts/test-local-spans.mjs

# Preserved Next.js frontend model tests.
node --test frontend-legacy/tests/*.test.mjs

# Primary Vite frontend.
npm --prefix frontend run check
npm --prefix frontend run test:load-safety
npm --prefix frontend run test:ui-performance
npm --prefix frontend run build:prod
```

Run these commands from the repository root after the folder move. They are reference commands, not evidence that validation has been rerun for this promotion. The primary Vite development command is `npm --prefix frontend run dev`; its normal production output is `frontend/dist/`. QA outputs must not be deployed. The legacy Next.js development command is `npm --prefix frontend-legacy run dev`.

See [primary frontend](frontend/README.md), [legacy Next.js frontend](frontend-legacy/README.md), [backend](backend/README.md), and [legacy design-system status](docs/design-system/README.md) for scope and caveats. Dated reports retain their original paths and observations; they do not confirm the current folder layout or this deployment's result.

## Operational Boundaries

- Only public browser configuration belongs in `VITE_*` or `NEXT_PUBLIC_*` values. Never commit keys, seed phrases, RPC credentials or real `.env` files.
- API projection state is not final settlement authority. Missing values are unavailable, not zero.
- Preserve hashless/unknown transactions and their duplicate-submission blocks; do not clear records just to make a test proceed. The user lifted B's static address-level deployment hold on 2026-10-24, not its unresolved reservations. The old #3 claim history is not proved settled, and the new #9 hashless listing failure remains unresolved. A new origin, gas top-up or missing hash is not proof that resending is safe.
- Cloud changes, migrations, wallet signatures, deployments and pushes require explicit authorization.
- Git ignores dependency/build output and local credentials. Large raw experiment logs remain local; dated reports retain conclusions, counts, limitations and evidence hashes.
