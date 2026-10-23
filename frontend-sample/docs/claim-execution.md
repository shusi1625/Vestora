# Claim Execution Integration

Scope: `frontend-sample` only. No deployed frontend, backend, contract, cloud resource or database is changed. Only claim is enabled; buy/list/unlist/create/cancel remain disabled.

## Explicit User Flow

1. Connect a browser's injected wallet and select Sepolia. Watch-only address lookup is not signing authority.
2. Open a receivable detail and choose the claim-condition check. The app reads owner, stream token, withdrawn amount, claimable amount and ETH at one chain block, then simulates the claim and checks estimated gas affordability.
3. Review the exact token amount, receiving account and block basis. Choose the explicit wallet-approval button. There is no automatic submission during connection, page load, polling, review, receipt recovery or account switching.
4. The app checks the session, on-chain conditions and simulation again. A decreased amount or changed withdrawals requires new review; normal accrual may increase the amount because `claim` withdraws all claimable rights.
5. The wallet shows the actual Sepolia transaction. The human user must inspect and approve it. The app sends only the configured stream contract's `claim(streamId)` call, from the reviewed account, through viem with wallet transport retries disabled.
6. Two block confirmations, a zero-value Sepolia transaction from the reviewed account and exactly one matching `StreamClaimed` event from the configured stream contract establish chain success. Direct calls must also contain the exact `claim(streamId)` input. Wallet-wrapped calls may target a different contract: their successful receipt must prove the exact stream ID, recipient and positive amount. The deployed stream emits this event only after its owner check and token transfer. No router address is implicitly trusted. The actual received amount comes from that event, not the earlier quote.
7. Completion requires the backend's applied projection checkpoint to include the receipt block AND the exact hash/recipient/stream/amount/log-index event. Receipt success plus API/RPC refresh failure remains success with a warning, not a failed claim or an instruction to resend.

## Safety And Recovery

- EIP-1193 account/chain events synchronously increment a session revision, invalidating reviews before the next React render. Account and chain are re-read before submission even if no event arrived. Late connection results cannot reconnect after local disconnect. A late injected provider attaches listeners when explicitly connected.
- A provider-lifetime engine survives navigation and dialog closure. Current-account UI is isolated; transactions for another account are not shown as the new account's action.
- One in-process operation, a Web Lock across same-origin tabs and deployment/account-scoped persistent reservations prevent overlapping claims. Unsupported Web Locks or unavailable storage block execution. Wallet permissions are not revoked by local disconnect.
- A reservation is persisted BEFORE asking the wallet. Explicit 4001 rejection clears it; a final local guard that proves no wallet request occurred can also clear it. Ambiguous non-rejection send failures keep it unresolved and prevent new sends.
- A known hash resumes receipt reads after reload. Replacement hashes are followed, but a cancellation/different payload is never called a successful claim. A reverted receipt is terminal failure, with possible gas cost.
- No-hash ambiguity requires checking wallet activity and explicitly supplying a hash. Recovery validates the Sepolia sender, zero value, direct-call input where applicable and mined receipt event before attaching it. Stored receipt metadata is reverified; local storage is not chain proof.
- A legacy misclassification whose reservation was already cleared can be repaired through "existing claim result" in the detail dialog. This read-only hash reconciliation uses the same account lock, never overwrites another pending record and never quotes, signs or sends a transaction. It still waits for confirmations and exact API projection proof. Open detail amounts follow the latest live snapshot instead of retaining the original row object.
- There is no automatic retry of a transaction send and no automatic deletion of an ambiguous reservation. Clearing browser data loses this protection, so inspect wallet history first. Multiple browser profiles/origins cannot share a Web Lock or local storage; avoiding concurrent sends there remains a user responsibility.
- Public RPCs and block confirmations are not an audit or a reorg/finality guarantee. Existing backend reorg limitations remain. Contract ownership always controls settlement.

## Local Verification

`npm run check` includes the pure/mocked wallet, engine and viem adapter suite, with no real wallet signature or transaction. `npm run build:prod` validates the bundle. Browser checks cover actual read-only data, watch-only gating, errors and responsive layout; simulated chain tests are not live signed-transaction proof.

### Verified On 2026-10-20

- `npm.cmd run check`: passed ESLint, both TypeScript projects, all 43 tests and source-import audit (`missingImports: []`). Wallet/receipt adapters in this suite are mocked; no transaction was signed or broadcast.
- `npm.cmd run build:prod`: passed. Existing Zod annotation warnings and a large main chunk remain (1,162.74 kB minified; 355.95 kB gzip). Dependency vulnerability remediation remains separate work.
- Local dev server: `http://127.0.0.1:4190/assets`, loopback only. Live API projection data and owned receivables loaded successfully for a public test address.
- Desktop 1280x720 and mobile 390x844: detail dialog and watch-only claim gating verified. Mobile document has no horizontal overflow; the scrollable footer displays the connect-wallet action, not a claim-submit action. Temporary viewport overrides were reset.
- At that initial checkpoint, real wallet permission/switch dialogs and a human-approved transaction were not verified. The subsequent wrapped-claim evidence below supersedes the transaction-result limitation for that specific hash only.

### Wrapped-Claim Regression Verification (2026-10-20)

- Root cause: the user's wallet submitted a zero-value transaction to an execution wrapper, so the old direct-target/input-only check returned `replaced` before examining the valid stream receipt event.
- `npm.cmd run check`: all 51 tests passed, including wrapped receipts, wrong sender/chain/value/deployment, wrong or missing/duplicate events, direct calldata rejection and read-only hash reconciliation with duplicate/cross-tab guards. Both TypeScript checks, ESLint and source audit passed.
- `npm.cmd run build:prod`: passed; main chunk 1,164.70 kB minified / 356.44 kB gzip. Existing dependency/bundle warnings are not resolved by this fix.
- Chrome: reconciled existing hash `0x3c18ee3b146de89c85df17d16eb08eed4043634fd7ab685c25f66ad1f32b7e70` through the visible read-only form. UI reached completed with exact received amount `3.066667 MockUSDC`. The API applied checkpoint included the receipt block and exact claim event. Detail totals show withdrawn `5.000000`, remaining/claimable `0.000000`; wallet token balance shows `11.400000`.
- The transaction was previously approved by the human user. This regression verification only read that transaction/receipt and updated local progress; no new signature, transaction submission, contract/backend mutation or deployment was performed. Wallet permission and network-switch UI paths remain separate human checks.

## Human-Signed Test Checklist

Use a browser with the intended wallet extension at `http://127.0.0.1:4190/assets`:

- Verify connected account and Sepolia. Reject one connection/switch request and check the UI recovery.
- Open a currently owned, positive-claim receivable. Review exact amount, account and stream ID. Try changing account/network before approving; new review must be required.
- For the intended actual test only, inspect the wallet request: chain 11155111, target `0x2b6beCf31c41c25f3A4eF73F6dAEEff85dB8eD1a`, function `claim`, expected stream ID, no ERC20 allowance approval. The agent must not approve this transaction.
- After user approval, preserve the hash. Confirm chain receipt and received amount, then API application. Do not sign a second claim merely because the API lags.
- If result is unclear, use receipt/hash recovery; do not clear pending records to force a retry.

Existing dependency vulnerabilities and large-bundle warnings remain separate remediation work. No commit, push or deployment is part of this task.
