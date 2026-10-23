# Design system verification — checkpoint 1

Status: partial, representative-screen stage; NOT goal completion.

## Source state

Starting HEAD: 373a939. Git clean before additions.
Added scoped tokens, primitives, receivable components, exact-money functions, sample review route.
Original live page/providers/global styles and transaction-policy remain unchanged.

## Local checks performed

- node --test tests/receivable-value.test.mjs tests/transaction-policy.test.mjs: 10/10 passed.
- node_modules/.bin/tsc --noEmit --incremental false: passed.
- eslint on review page, primitives, summary and valuation functions: passed.
- next build: passed, / and /design-system generated.
- Existing dev PID 44252, directory C:/GitHub/Vestora/frontend; GET /design-system returns 200.
  Attempted second server exited after reporting existing server; existing process was reused.

## Browser evidence this checkpoint

Actual Next.js route opened in Codex browser, not a synthetic DOM.
- Assets rendered at 1440; headings, amount composition and table visible.
- 360 initial check exposed overflow from absolutely positioned screen-reader labels.
  Fixed label positioning and changed mobile table rows into vertically labeled records.
- After correction: document scrollWidth 345 at viewport 360; 753 at 768.
- 360 long-number stress state: scrollWidth 345 (no document-wide overflow).
- 360 detail state: scrollWidth 345.
- Purchase dialog: 1380 paid / 1500 acquired; indexing and completed previews distinct.
- Escape closed native dialog; focus restored to purchase trigger.
- Claim dialog: 300 claim / 900 remaining correctly rendered.
- Browser captured error logs: none during checked interactions.
- Screenshots inspected in tool output; durable screenshot artifacts not yet saved.
- Full keyboard audit, full state/view matrix and tablet visual inspection remain outstanding.

## Text contrast (sRGB formula, token pairs)

Body/paper 13.03:1; muted/white 6.29:1; white/brand 8.00:1;
brand-secondary/brand 6.57:1; warning 6.09:1; success 6.31:1; danger 6.39:1.
These are named token-pair results, not an exhaustive rendered accessibility audit.

## Remaining gates

1. User representative-screen review.
2. Full live frontend migration and all six user journeys.
3. Whole-app input validation, safety preflights, polling and account-switch checks.
4. Full responsive/keyboard/error-state checks; component and route coverage.
5. Real API validation separately from mock preview; wallet signing remains user-operated.
6. Final requirement-by-requirement audit and evidence update.

## Data adapter checkpoint
- API role filtering, canceled-right valuation and listing projection mapping added.
- 14 domain/policy tests and TypeScript check passed before integration.
- Live controller extraction was not executed: automatic approval review failed on usage limits.
- Recovery check: ordinary usage now allowed; this documentation write uses normal approval review.
- Full service integration remains outstanding; goal is not complete.


## Live UI checkpoint (2026-10-17)

- Automatic approval writes recovered through the normal approval path.
- User feedback: preserve full service navigation; gallery is development-only.
- Root / now uses LiveApp + ServiceShell + service lists, with useVestora controller.
- Public market/detail and gated assets/sales/payments/create/activity use actual API/wagmi data.
- ABI additions describe existing cancel function and StreamCreated event; no contract deployment/change.
- Created ID is derived from receipt logs instead of predicting nextStreamId.
- Explicit Sepolia writes, fresh ownership/seller checks, post-approval purchase condition checks,
  exact amount parsing and bounded schedule inputs added.
- next build passed; targeted eslint passed; original 14 tests passed.
- New mocked live-controller tests: 9 passed (owner/claimable, approval/list state,
  account/network changes, buy protection, withdrawal changes after approval, self buy/balance,
  cancellation, invalid creation input, unknown receipt outcome). No real signatures.
- Browser at /: all five service menu entries present; private assets requires wallet.
- Actual API active stream #2: price 4, remaining/claimable 3.066667, premium warning.
- Actual detail showed current owner/sender and on-chain remaining/claimed values.
- Detail overflow checks: 345px document at 360 viewport; 753px at 768 viewport.
- Captured browser error logs empty in tested public flows.
- API projection lag notice appeared; no AWS/DB changes attempted.
- Server restarted hidden on loopback port 3000, PID 26392 at start.
- Build and public reads do NOT prove connected-wallet UI or live signed flows.
- Outstanding: refresh-persistent pending transactions, full connected flow/keyboard/state
  matrix, stronger quote snapshot checks, documentation finalization and complete requirement audit.

## Reviewed purchase terms checkpoint (2026-10-17)

- Purchase confirmation now passes its account, stream ID, seller, price, remaining
  receivable, withdrawn amount and cancellation state to the live purchase handler.
- The first on-chain preflight compares against those reviewed terms before token
  approval. A decreased right or changed seller/price/cancellation requires review.
- Post-approval preflight also checks cancellation state; buyWithProtection remains
  the final contract-side price/remaining/withdrawal/seller protection.
- Regression test varies seven reviewed fields and verifies zero writes on mismatch.
- All 24 domain/policy/controller tests passed; TypeScript and targeted ESLint passed.
- Production build passed (sandbox trace write denied first, normal approval retry
  succeeded). Root development URL still returned HTTP 200 after the build.
- These are mocked-controller tests plus local build evidence, not signed transactions.
- Remaining: pending transaction persistence/recovery, connected UI/keyboard and
  full responsive/state coverage, component documentation and final objective audit.

## Transaction recovery checkpoint (2026-10-18)

- Added account/chain/receivable-contract scoped pending records in localStorage;
  only hash, public account, action label and stream ID are persisted.
- Wallet hydration restores unknown outcome and selected stream. Manual recovery reads
  receipts and refreshes projections without signing or continuing approval workflows.
- Failed/missing receipts remain distinct; old hashes cannot clear newer records.
- Saved records are decoded defensively; unavailable storage emits a visible warning.
- Recovery handles created stream IDs from receipt events; delayed old-account state
  updates are guarded. Full browser account-switch/replacement tests are still pending.
- 29 tests passed, including storage validation, reload effect, account separation,
  success/revert/missing receipt and approval-without-follow-up. Targeted ESLint passed.
- Independent TypeScript no-emit check passed. Production build passed on October 18
  after the automatic approval service recovered from a usage-limit failure.
- Development listener was absent and restarted as hidden PID 17736 on port 3000.
- Browser QA could not resume: selecting the existing error-page tab was blocked by
  browser URL/protocol policy. No alternate browser mechanism was used to bypass it.
- Remaining completion evidence: connected UI and keyboard/responsive state matrix,
  final requirement audit, live wallet scenarios performed by the user separately.

## Goal audit and state distinctions (2026-10-18)

- Added completion-audit.md mapping all seven phases, six journeys and success
  conditions to inspected implementation, test evidence and missing browser evidence.
- Provider code 4001 through nested causes now maps to rejected, separately from
  on-chain failure; unknown submitted outcomes remain unknown. Added two tests.
- ReceivableAmounts now displays payment, claim and sale states separately and shows
  the estimate timestamp. Live chain fallback distinguishes scheduled/active/ended.
- All 31 tests passed; targeted ESLint and production build/typecheck passed.
- User reported opening a normal page; browser inventory still exposed only the
  prior data-URL error tab, so browser surface clarification is pending. No screenshot
  or keyboard/responsive result is claimed for this checkpoint.
