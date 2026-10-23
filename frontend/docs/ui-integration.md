# UI Integration: Phase 1

Historical UI-only stage. Live reads are now implemented by default; [live-data.md](live-data.md) supersedes the sample-only source and wallet notes below. Execution remains disabled in both modes.

Scope: `frontend-sample` only. Production `frontend`, backend, contracts and deployments are unchanged.

## Implemented Views

- Market: fixed-height decision slots, token-aware price sorting, card/table modes, detail and purchase review.
- Assets: current NFT owner, per-token nominal total and composition, personal purchase/claim history distinct from global stream withdrawals.
- Sales: seller-scoped listing states; removing a listing is not canceling a payment.
- Issued payments: payer-scoped deposit accounting, scheduled/streaming/ended/canceled states, private names, cancellation review, prefunded creation dialog.
- History: account-scoped recorded activity; requested amounts on failed/non-final records are not actual receipts.

All final transaction buttons are disabled. Connecting a wallet in this project selects a sample account; it does not connect an extension. Refresh updates the sample calculation time, not a backend request. Names are local, account-scoped metadata and may be lost if browser storage is cleared. Closing the creation dialog preserves draft fields until navigation to another page; switching accounts resets them.

## Accounting Rules

Let D be deposited, C globally claimed, V vested, U=max(V-C,0), F unvested, R refunded.

- Active: remaining deposit=U+F; D=C+U+F.
- Canceled: F=0; R=D-V at cancellation; D=C+U+R. U remains with the current NFT owner.
- Ended: F=0 but U may remain until claimed. An ended payment is not necessarily settled in full.
- Potential cancellation refund is a subset of F, never an additional asset.
- Assets count current ownership, not original recipient or payer. Different tokens are never added together.
- Vested rights are not wallet cash: tokens move upon withdrawal.

## Live Integration Boundary

Replace `use-workspace-snapshot.ts` and map verified server/on-chain DTOs to the view model. Preserve BigInt quantities and verified chain timestamps; a local wall clock is only for this explicit prototype. Keep ingestion status separate from projection-applied status. Include paginated-history coverage, ownership verification and per-field freshness before treating totals as complete.

The prototype uses the same token for receivable and listing price. Map the real marketplace payment token explicitly; do not assume that this sample interface proves multi-token settlement. Read actual contract cancellation/listing policies at integration time. Final writes must re-check current owner, remaining claim, listing validity, approval, allowance, network and balance. Connect existing application transaction controllers only after that mapping and tests; do not reuse the prototype transaction simulation as a live sender.

Old captured detail/sell routes remain for comparison and can simulate prototype-only changes. Primary workspace views use review dialogs and no real send methods. The source archive and capture manifest are retained unchanged; source audit records deliberate deviations.

## Validation

Run `npm run check` and `npm run build:prod`. Browser checks should cover desktop/mobile layout, gray disabled actions, stable card slots, token filters, account isolation, canceled/ended accounting, local name editing, creation validation and account-scoped history. Local verification is not proof of deployed or on-chain behavior.

### Verified 2026-10-19

- ESLint, both TypeScript projects, eight isolated model/translation tests and source import audit passed. No unresolved source imports.
- Production build succeeded; the existing single application bundle still exceeds Vite's 500 kB warning threshold. Route splitting is a later optimization, not suppressed here.
- Browser desktop 1280 px and mobile 390/320 px: no observed horizontal page overflow. Mobile cards share the same height and action offset, with disabled backgrounds `rgb(233, 237, 234)`.
- Checked market token filtering, portfolio composition selection, issuer summary, cancellation review and local name save/restore.
- Valid creation input reached review (100 MockUSDC, dummy recipient, November/December dates); final execution stayed disabled. Invalid/incomplete dates were rejected. Native date-field automation required the accessibility set-value action rather than the generic fill helper.
- Account A history displayed only its three records, including one failed request explicitly labeled as requested, not received.

Pending: real API reads, real wallet integration, exact contract policy mapping, end-to-end transaction proof, and a full accessibility audit.
