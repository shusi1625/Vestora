# Live Payment Creation

Scope: `frontend-sample` only. Creation and claim are enabled on Sepolia; buy/list/unlist/cancel stay disabled. No backend, contracts, deployed frontend or cloud configuration is changed.

## Explicit Flow

1. The human connects the issuer wallet. Watch-only addresses cannot sign. Choose recipient, MockUSDC amount, future start/end, cancelability and an optional local-only name.
2. A read-only preflight validates exact integers and reads balance, allowance and gas at one verified chain block. The next required step is simulated and gas affordability estimated. Past start times are refused rather than silently shifted.
3. When allowance is insufficient, the issuer separately chooses an exact-amount `approve(streamContract, amount)`. There is no infinite approval. Approval is not a deposit and never automatically starts a create transaction. Stopping here leaves the token allowance in place.
4. The user checks conditions again. With sufficient allowance the app simulates `createStream(recipient, token, amount, start, end, cancelable)`, then requires another explicit wallet approval. All token funds are deposited at once and the recipient receives the NFT, without a marketplace purchase.
5. The app verifies two confirmations and exactly one matching event from the deployed token/stream contract. Sender, zero ETH value, chain and all payment terms are checked. Direct calls also require exact calldata; wrapped wallet executions require the authoritative contract event. IDs come from the receipt, not a prediction of `nextStreamId`.
6. A created payment is complete only when the API applied checkpoint includes the receipt block and its stream matches the ID, creation hash, issuer, original recipient, token, amount, period and cancelability. Token approval completion does not require the indexer. UI refresh errors preserve verified chain success.

## Safety And Recovery

- Captured wallet sessions are invalidated by account/network changes. Every send re-reads the session and preflights again; changed step/terms requires a fresh review.
- Claim and creation use the same per-account Web Lock and refuse one another's unresolved local reservations. Locks/storage are origin/profile scoped and cannot coordinate separate browser profiles. Unsupported locks or storage failures block sends.
- A deployment/account-scoped reservation is stored before the wallet request. Double clicks are serialized. Explicit 4001 rejection or a proven local-before-wallet guard can release it; an ambiguous send failure cannot. Transaction transport retries are disabled.
- Known hashes resume read-only receipt monitoring after navigation/reload. An ambiguous request without a hash requires checking wallet activity and supplying the exact step's hash. Recovery verifies receipt events before attaching it. Stored fields are not success evidence.
- Public RPCs/two confirmations do not establish finality or fix backend reorg limitations. Approval might remain after rejection/revert of creation; revocation is not implemented here. This UI does not claim to decode or validate every extra operation a wallet may bundle.
- Local names are saved only after a verified creation ID and synchronized across views. They are not sent to the contract or recipient. A local metadata failure never turns a successful escrow transaction into failure.

## Human Test

- Issuer A needs MockUSDC and Sepolia ETH. Recipient B only needs Sepolia ETH when signing a later claim; receiving requires no wallet purchase or signature.
- Selected recipient: `0xBf9BF852225899b667aA4c73bB082E830AbB9DE1`. Proposed test: 1 MockUSDC, start approximately five minutes after final review, duration ten minutes, cancellable. Recalculate explicit timestamps at final review; never silently change a reviewed transaction.
- The human must approve the token and creation requests separately. Inspect chain 11155111, exact amount, spender/contract and recipient each time. The agent must not sign, approve or submit either financial action.
- After creation, confirm A sees it under payment management and B under assets; check current on-chain owner, deposited amount, vesting and later claim separately.

Automated tests use mocked clients and do not sign. Actual two-account creation and receiving remain unverified until the human executes the transactions.

## Verification On 2026-10-20

- `npm.cmd run check`: ESLint, both TypeScript projects, all 70 tests and source audit passed (`missingImports: []`). New tests cover exact approval vs escrow steps, no automatic second send, session drift, storage/send ambiguity, replacement/recovery, shared claim lock, event matching and applied API proof.
- `npm.cmd run build:prod`: passed; main bundle 1,187.78 kB minified / 361.65 kB gzip. Existing Zod annotation and large-chunk warnings remain; dependency vulnerability remediation is separate work.
- Chrome: initial live preflight at Sepolia block 11953804 passed and correctly required an exact-amount token approval first. The agent did not press a wallet button. During testing, the human submitted approval hash `0xd373c0c2fd54ff348d2951aeeb55b9ad0bc490a3acad6a15f07e71659ac75a18`; the app verified it and stopped at approved, without automatically creating a stream.
- The final draft was explicitly re-reviewed as 1 MockUSDC to the supplied B account for 16:37-16:47 Asia/Seoul, cancellable, leaving time for the separate creation approval. If the start time has passed, the form must be reviewed with new future timestamps.
- Desktop and mobile 390x844 were checked in one pass. No document horizontal overflow; amount, spender, period and separate approval notice remained readable. Temporary viewport override was reset.
- The agent performed no wallet request, signature, transaction submission, deployment, commit or push. The observed approval was a human action. Actual A/B escrow creation and NFT receiving remain the next human-approved verification boundary.
