# Vestora design system - legacy Next.js integration

Frontend promotion is in progress. This document describes the preserved Next.js implementation in [frontend-legacy](../../frontend-legacy/README.md); the primary Vite application is in [frontend](../../frontend/README.md), promoted from `frontend-sample`. These are target paths after the move, not confirmation that the move or deployment is complete.

Status of the legacy integration: IN PROGRESS. User reviewed the representative page and requested preserving the service navigation; that feedback is applied.
Source of truth for this legacy design system: [frontend-legacy/styles/design-system.css](../../frontend-legacy/styles/design-system.css) and [frontend-legacy/components/](../../frontend-legacy/components/).
Review route on the legacy Next.js server: `/design-system` (sample-only, no wallet signing). Its `/` route runs the component-based live service. The primary Vite app does not inherit this Next.js gallery route merely through the folder promotion.

From the repository root after the move, start the legacy server with `npm --prefix frontend-legacy run dev`, then open `http://localhost:3000/design-system` if it uses the default port. Primary Vite development uses `npm --prefix frontend run dev`. These commands have not been rerun by this documentation task. 전환 진행, Vercel 배포 결과는 배포 기록 확인.

## Product intent and tone

Help holders and buyers compare amount, timing, cancellation conditions, and rights.
Calm, explicit, factual. Do not frame implied gains as guaranteed returns.
A seller converts future/unclaimed rights to present proceeds; a buyer acquires claim rights.
Funding already exists in the contract; this is not invoice debtor underwriting.

Information hierarchy: money → conditions → action → evidence.
Use green for primary actions and success, neutral for ordinary states, amber for conditional risk,
red for errors. Noncancelable does not mean risk-free. Always accompany color with text.

## Tokens

CSS variables are scoped to .vestora and shared by the live service and sample gallery.
- foreground #192f2c; secondary #52645c; paper #f5f6f1; surface #ffffff.
- primary #175b48; hover #104333.
- neutral #eef1ed / #52645c; warning #fbf1e0 / #805019.
- success #e7f1e7 / #2b613b; danger #fff0ec / #99382f.
- focus #306cbb; control border #768477.
- space 4 / 8 / 12 / 16 / 24 / 32 / 48px.
- control radius 6px; panel radius 12px.
- text 13 / 14 / 15 / 20 / 30px; primary amount 28–44px.
- responsive 1000px shell/detail transition; 700px mobile list transformation.

Numerals use tabular figures. Amounts retain all token decimals and avoid Number conversion.
Units are always present for known values. Null reads "확인 불가", never zero.
Amounts above safe integer range are supported using bigint.
Long addresses wrap; the full address remains available without pointer-only hover.

## Components and contracts

| Component | Inputs and purpose | States / accessibility |
| --- | --- | --- |
| Button | native button props; primary/secondary/text | native disabled, visible focus, min 44px |
| Badge | tone, text | neutral/success/warning/danger; text carries meaning |
| Notice | title, body, tone | danger uses alert; other dynamic status wrapped in live region |
| Amount | bigint or null, symbol, decimals, emphasis | unknown distinct from zero; no loss of precision |
| Address | full address or null | wraps full text; unknown explicitly labeled |
| Field | native input props, label, hint, error | generated ID, associated label/help, aria-invalid |
| Select | native select props and label | keyboard-native select and associated label |
| Checkbox | native input props, label and hint | label target, associated help |
| Explanation | summary and content | native disclosure, keyboard accessible; no critical risk hidden here |
| Dialog | open, title, onClose, busy, footer | native showModal, focus containment, Escape, return focus |
| DataState | loading/empty/error, text, optional retry | busy/status/alert; no invented zero |
| PageHeading | title, description, optional action | h1, clear page purpose |
| MetricRow | label and value in dl | structured term/definition, right-aligned value |
| FilterGroup | label, value, options, callback | pressed buttons; not fake ARIA tabs |
| PortfolioSummary | total, wallet, claimable, future, cancelableFuture | no addition of listing price or double-counted claimable |
| ReceivableList | view items and selection callback | semantic table; all fields/actions become vertical at mobile |
| ReceivableAmounts | view item | separate payment, claim and sale concepts; canceled future handling |
| PurchaseSummary | item, price, actions | cost assumption; premium warning; no historical yield |
| TransactionStatus | wallet/confirming/indexing/completed/rejected/failed | confirmed-but-indexing distinct from failure; polite live region |

Legacy examples: /design-system → 컴포넌트; representative Next.js screens reuse these exact React components.
Legacy amounts/cancellation math belongs to [frontend-legacy/lib/receivable-value.ts](../../frontend-legacy/lib/receivable-value.ts), not JSX.

## Vocabulary

보유 합계 (명목 기준), 지갑 잔액, 청구 가능액, 지급 예정액, 총 미청구 수취액,
판매 가격, 예상 차익, 판매 취소 (listing only), 지급 취소 (future payment interruption).
Use concrete error + recovery. Never assert "assets unaffected" from a failed read alone.

## State and money rules

- Total = wallet + remaining rights currently owned, per token.
- Claimable is part of remaining; future = remaining - claimable.
- Listings are a subset of holdings, not an extra asset.
- Sender role alone does not make locked funds owned receivables.
- Unresolved ownership/valuation prevents an authoritative portfolio total.
- Cancellation retains only unclaimed vested rights; future becomes zero.
- Stale data remains marked with its time; failed fetch is not a zero balance.
- Expected difference = remaining - price, excluding cost and conditional on payment terms.
- Inactive or zero-remaining listings do not show an active purchase yield.

## Scope still owed

In the preserved Next.js implementation, initial live app migration, data adapters, hash navigation, confirmations and sender cancellation UI are implemented. Still owed: full keyboard/connected-wallet UI verification, browser verification of transaction recovery, remaining component-state matrix, complete regression and final audit. History is deliberately labeled partial.
Full goal completion is NOT established by the isolated preview route.

The primary Vite app has live claim and fully funded payment creation, but live buy/list/unlist/payment-cancel remain disabled. Legacy cancellation UI does not establish Vite payment-cancel support. B-account #3's hashless claim remains blocked; do not clear or retry it because the application path or deployment origin changes.

## Usage examples

- Button: primary only for the next consequential action; pass disabled while busy.
- Field: use label and error props together; error text gives a recovery action.
- Amount: pass raw token bigint and explicit decimals; pass null until known.
- Notice: keep cancellation and changed-price risks adjacent to the decision button.
- Dialog: pass busy during signing/submission, preventing accidental closure.
- DataState: loading/error/empty are separate from a successful zero-valued amount.
- PortfolioSummary: feed portfolioFromStreams output, never sum role-matched API rows.
- ReceivableList: feed streamView adapters and navigate using stable stream IDs.
- TransactionStatus: derive from receipt/projection state, never wallet dismissal alone.

Concrete legacy usage: [frontend-legacy/components/app/live-app.tsx](../../frontend-legacy/components/app/live-app.tsx); sample variants: [frontend-legacy/app/design-system/page.tsx](../../frontend-legacy/app/design-system/page.tsx).
Legacy transaction persistence/recovery: [frontend-legacy/lib/pending-transaction.ts](../../frontend-legacy/lib/pending-transaction.ts) and [frontend-legacy/hooks/use-vestora.ts](../../frontend-legacy/hooks/use-vestora.ts).
