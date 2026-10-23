# Live Read Integration

Update 2026-10-19: claim is now connected behind explicit on-chain review and wallet approval. The read-only/no-signing notes below describe the preceding integration stage; [claim-execution.md](claim-execution.md) is the current execution boundary. Other transaction types remain disabled.

2026-10-19, frontend-sample only. Production frontend, backend, AWS and contracts are unchanged.

## Sources And Authority

- Default mode is live. `VITE_DATA_MODE=sample` restores the isolated prototype after a server restart. Live mode never falls back to fixtures or prototype balances.
- `/streams` supplies the stream list, embedded current listing and projection metadata in one backend snapshot. Only the configured Sepolia-v4 sync ID and MockUSDC contract address are accepted. Unsupported tokens are excluded with an explicit count, not relabeled.
- Amounts use the API's verified `vestedAmount` and projection timestamp. Missing or inconsistent valuations are unavailable, not zero. Browser wall time is used only to mark freshness, never to increase receivable amounts.
- MockUSDC and ETH wallet balances are read through viem at that same projection block. RPC chain and token decimals are checked. A failed balance read hides the aggregate/chart rather than introducing a fictitious zero wallet balance.
- Ownership is projected, not on-chain verified. Every transaction will still require a current `ownerOf`/listing/allowance/remaining-value recheck before enabling execution.

## Accounts And History

- An injected EIP-1193 wallet can grant account access. Account, chain and disconnect events update the view. No signing, approval, mint or send method exists in this integration.
- Address lookup is an explicit watch-only view, not proof of account ownership. Session disconnection only clears this app's session; it does not revoke wallet permissions.
- Query cache keys include API and account; account changes remount personal dialogs. A slow response for account A cannot populate account B's screen. Foreground reads refresh every 15 seconds, pause while hidden and refresh on focus.
- History combines account trades with account-recipient claim events, bounded to four detail requests in parallel. Events later than the projection basis are excluded. Missing details make personal history unavailable; no partial sum is displayed as zero.
- A seller's proceeds are not treated as a purchase price. The existing user/trade APIs do not expose the full create/approve/list/unlist/failed-request history, so the UI explicitly limits its scope to buy/sell/claim events.
- Live private names use a separate storage namespace from sample names and are scoped to address and configured deployment.

## Configuration

See `.env.example`. The development/preview proxy target is the existing public read API, not a new deployment. `VITE_*` values are public: never insert private keys or secret RPC credentials. A production host must provide the `/vestora-api` reverse proxy or configure a CORS-enabled HTTPS API URL. The recorded plain-HTTP IP is ephemeral and is not a production hosting recommendation.

The public Sepolia RPC is a configurable fallback and may throttle. Failed reads remain explicit. Only MockUSDC is currently mapped; mWETH demo options are hidden in live mode. No actual transfer controls have been enabled.

## References

- Repository API serializers, projection-snapshot routes and frontend contract addresses were read before mapping.
- EIP-1193: https://eips.ethereum.org/EIPS/eip-1193
- TanStack Query foreground polling/options: https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery

## Verification Boundary

Run `npm run check` and `npm run build:prod`. Unit tests cover token identity, timestamp availability, exact valuation, canceled rights, listing states, account-scoped event history and malformed/unavailable APIs. Browser verification and live read evidence must be recorded separately from mocked tests. Wallet permission prompts and all financial signatures remain user actions; no signed-transaction end-to-end claim is made here.

### Evidence From This Run

- Public API `/metrics` and `/streams` responded on 2026-10-19 KST: two indexed streams, two listings, one active market listing. Projection applied metadata was present; snapshots sometimes reported a one-block lag, which the UI exposed rather than hiding.
- The browser read the active listing (#2, 4.000000 MockUSDC), two streams and three buy/claim events for an already-public test address. Its RPC wallet balance was 8.333333 MockUSDC and remaining receivable was 3.066667 MockUSDC, producing a nominal total of 11.400000 at the displayed projection block. These are point-in-time read observations, not guaranteed future balances.
- Address switching cleared the prior account immediately, then showed a different address's verified empty holdings and zero balance; no sample values appeared. Desktop and 390px mobile screens had no observed horizontal overflow.
- `npm run check`: lint, TypeScript, 17 tests and source-import audit passed. `npm run build:prod` passed. The bundle-size warning remains, along with harmless dependency annotation warnings from Zod.
- Installing viem surfaced ten audit findings in the pre-existing Tailwind/pnpm/i18next dependency tree (six high, three moderate, one low). No viem advisory was reported. Fixes include major-version changes, so no automatic `audit fix --force` was run; dependency remediation is separate work.
- A real wallet authorization dialog, user signatures, chain writes and deployed frontend behavior were not exercised. Existing production files were not edited.
