# Vestora

Fully funded token-payment streams and a receivable NFT marketplace on Sepolia.
Smart contracts settle transactions; the backend indexes events and serves projection data.
Transaction-critical ownership, allowances and amounts must be rechecked on-chain.

## Current Checkpoint

As of 2026-10-23, two frontend implementations coexist:

- `frontend/`: Next.js dashboard, shared components, transaction guards and recovery.
- `frontend-sample/`: Vite/React interface collected from Enter, subsequently integrated with live API reads, claim and fully funded payment creation. Buy/list/unlist/payment-cancel actions remain disabled in its live mode.
- `backend/`: Fastify API, PostgreSQL projections and indexer. New local request spans are opt-in and have not been deployed.
- `contracts/` and `test/`: settlement contracts and local boundary/invariant tests.

Promoting `frontend-sample` into `frontend` and a new Vercel deployment were requested, but are paused until this documentation/commit checkpoint is complete. No frontend move or Vercel deployment has occurred at this checkpoint.

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

# Current Next.js frontend model tests.
node --test frontend/tests/*.test.mjs

# Integrated Vite frontend.
npm --prefix frontend-sample run check
npm --prefix frontend-sample run test:load-safety
npm --prefix frontend-sample run test:ui-performance
npm --prefix frontend-sample run build:prod
```

See [frontend-sample](frontend-sample/README.md), [backend](backend/README.md), and [design-system status](docs/design-system/README.md) for scope and caveats. The latest checkpoint verification report records which commands were actually rerun.

## Operational Boundaries

- Only public browser configuration belongs in `VITE_*` or `NEXT_PUBLIC_*` values. Never commit keys, seed phrases, RPC credentials or real `.env` files.
- API projection state is not final settlement authority. Missing values are unavailable, not zero.
- Preserve hashless/unknown transactions and their duplicate-submission blocks; do not clear records just to make a test proceed.
- Cloud changes, migrations, wallet signatures, deployments and pushes require explicit authorization.
- Git ignores dependency/build output and local credentials. Large raw experiment logs remain local; dated reports retain conclusions, counts, limitations and evidence hashes.
