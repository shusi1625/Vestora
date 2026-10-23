# Vestora

Fully funded token-payment streams and a receivable NFT marketplace on Sepolia.
Smart contracts settle transactions; the backend indexes events and serves projection data.
Transaction-critical ownership, allowances and amounts must be rechecked on-chain.

## Current Checkpoint

As of 2026-10-23, both frontend folders have been promoted to the layout below. Production deployment evidence is tracked separately from the folder move.

- `frontend/`: primary Vite/React interface, promoted from `frontend-sample/`, with live API reads, claim and fully funded payment creation. Buy/list/unlist/payment-cancel actions remain disabled in its live mode.
- `frontend-legacy/`: preserved Next.js dashboard, shared components, transaction guards, recovery and the legacy `/design-system` gallery. It is maintained separately from the primary Vite UI.
- `backend/`: Fastify API, PostgreSQL projections and indexer. New local request spans are opt-in and have not been deployed.
- `contracts/` and `test/`: settlement contracts and local boundary/invariant tests.

Folder promotion is complete. See the [Vercel deployment record](frontend/docs/vercel-deployment.md) for the actual deployment status and URL. A new Vercel project is linked; deployment completion still requires a Ready deployment and live smoke checks.

Start with [development progress](docs/report/development-progress-2026-10-23.md), [performance status](docs/report/performance-status-2026-10-23.md), and [handoff](docs/codex-system/handoff.md).
Local tests, measured AWS reads, user-signed transactions and deployed product behavior are different evidence levels. G1/G2/G3 and wallet E2E are not collectively complete.

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
- Preserve hashless/unknown transactions and their duplicate-submission blocks; do not clear records just to make a test proceed. B-account #3's hashless claim remains blocked; a new deployment origin is not authorization to clear or retry it.
- Cloud changes, migrations, wallet signatures, deployments and pushes require explicit authorization.
- Git ignores dependency/build output and local credentials. Large raw experiment logs remain local; dated reports retain conclusions, counts, limitations and evidence hashes.
