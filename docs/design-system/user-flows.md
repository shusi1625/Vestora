# Vestora frontend flows and migration inventory

## Current implementation (2026-10-18)

The root frontend/app/page.tsx mounts components/app/live-app.tsx.
The service shell and lists are shared components; hooks/use-vestora.ts owns queries,
on-chain reads and transaction handlers. React Query and wagmi remain the data layer.
All six flows have live handlers, including sender cancellation through the existing ABI.
API roles are filtered by current owner for assets and by sender for sent payments.
No contract or backend schema changes are part of this UI goal.
Existing backend user-trades API is not a complete transaction history of every action.
Combine available claims/stream creation/listing events and current-session transactions truthfully;
do not label partial coverage as complete history.

## Target screens

Market (public), assets (wallet), receivable detail (public read), my sales (wallet),
sent payments (wallet), create (wallet), activity (wallet).
Navigation should preserve filters when returning from detail, and account changes must not retain
the previous account's totals as current holdings.
Market/detail remain readable disconnected; writes require correct chain and current owner/conditions.

## Flow contracts

| Flow | Start → confirmation → execution → result | Error/recovery |
| --- | --- | --- |
| Claim | assets → detail → amount/recipient/remaining → ownership + chain recheck → wallet → receipt → projection → refreshed assets | no claimable/owner mismatch disables; rejection is not chain failure; refresh failure is not transaction failure |
| Sell | holdings → price → current rights/conditions → NFT approval if needed → register → my sales | invalid price; ownership/remaining changed; approval succeeded but listing failed is explicit |
| Buy | market → detail → price/rights/cancellation/gas/protection → fresh protected preflight → token approval if needed → buy → assets | self-buy, token balance, gas, stale price/rights, sold/canceled/invalid listing; changed terms require reconsideration |
| Unlist | my sales → confirm listing removal only → seller check → cancel listing → retain owned receivable | no longer seller/listed; user reject; chain failure; backend pending |
| Create | recipient/token/amount/start/duration/cancelability → full funding summary → token approval → create → detail | bad address, zero/precision/balance, invalid dates, approval vs action state |
| Cancel payment | sent payments → sender refund + vested remainder → sender/cancelability check → cancel → updated payment | not sender, noncancelable/already canceled; clearly distinct from unlist |

Shared execution phases: preparing, approval, wallet confirmation, submitted/confirming,
chain success with stale reads/projection pending, completed, rejected, reverted, unknown outcome.
Never encourage duplicate transaction submission when an outcome is still unknown.
Gas token is separate from mUSDC; do not invent conversion rates.
No wallet signatures are performed by the agent as part of design review.

## Confirmation review gate

User chose actual frontend implementation.
Review artifact /design-system contains assets, detail, purchase confirmation and component states.
User reviewed the representative route and requested preserving service navigation. The live root now includes marketplace, assets, sales, payment management and activity; the component gallery stays separate.
Current HTML remains an earlier reference, not the source of live balances.

## Goal requirement → evidence needed

- Understand amounts/conditions: representative screen review + later flow checklist (not a user study).
- Six journeys: actual page interactions and targeted integration checks.
- Design consistency: shared component usage, token stylesheet, no one-off duplicate status formats.
- Component catalogue: /design-system with native input/error/modal/data/transaction examples.
- Keyboard: recorded traversal, focus visibility, modal return focus; entire flow still pending.
- Contrast: named pairs measured >=4.5:1 for normal text, and rendered applicable styles checked.
- 360/768/1440: actual screenshots and overflow checks for each required screen/state.
- Large values/addresses/errors: rendered stress examples and exact-amount unit tests.
- Contract authority: live handler preflight/ownership/read verification and existing policy tests.
- Production build/typecheck: explicit command pass.
- Live API and live signed transaction: report separately; never treat mock review as evidence.
- Completion: audit all rows; keep unresolved items open, no deploy/commit/push without request.

## Submitted transaction recovery

After a hash is returned, save its account, Sepolia chain ID, action label and selected
stream ID in localStorage, keyed by account and receivable contract. No private keys or
signatures are saved. Wallet hydration restores the record as an unknown result and
prevents transaction actions until the user selects 거래 결과 다시 확인.
Recovery only reads the receipt and refreshes data; it never signs or continues an
approval into a business transaction. A missing receipt stays unknown, a reverted receipt
permits a fresh review, and success waits for projection where required.
Completed records are removed only if their hash matches, so an old response cannot
remove a newer record. Storage failure is visible with instructions to keep the hash.

Limits: this is browser-local recovery, not a cross-device transaction history. Clearing
browser data removes it. Replacement/dropped transactions need explorer investigation;
no automatic conclusion of failure is made from a missing receipt. Recovery is explicitly
user-triggered. Real wallet reload and replacement scenarios remain unverified.
