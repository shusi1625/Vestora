# Isolated Manual QA

This fixture uses the real app and transaction adapters, but no real wallet,
upstream API, RPC or signing key. It binds loopback ports 4212 and 4391 only.
It is not a production route or part of the regular production build.

From `C:/GitHub/Vestora/frontend`, start two terminals:

```powershell
node tests/manual-qa/server.mjs
node node_modules/vite/bin/vite.js --config tests/manual-qa/vite.config.ts
```

Open `http://127.0.0.1:4212/assets`. The visible orange control band identifies
fixture observations. Applying a case clears only dedicated disposable fixture
pending keys on this separate origin. It never reads MetaMask or the live
4190 origin's storage.

Known limitations:

- E12-wallet-gas throws a typed wallet fee error without a hash; the application
  must retain an unresolved reservation and its redacted hint after reload.
  The fixture's zero sends are not proof that all real wallet errors are unsent.
- E14-legacy seeds a fake v1 hashless reservation with no diagnostic. It remains
  blocked, unchanged, across reload. Never seed or clear the actual 4190 origin.
- B24-maxfee keeps gasPrice affordability but increases EIP-1559 max fees;
  preflight must fail before any wallet send. B24 equal +/-1 still use 2 gwei
  maxFeePerGas (1 gwei base * 1.2 + 0.8 gwei priority).

- Approval, creation and claim receipts are simulated; no chain execution occurs.
- E18 provides a pending original and same-nonce repriced replacement for the real
  viem receipt watcher. E19 provides a same-nonce cancellation with no claim log.
- E23 RPC faults activate only after the visible checkpoint control is clicked;
  first observe receipt-confirmed indexing, then activate and inspect rpcFailures.
  A case label alone is not proof that its full scenario ran.
- E16 owner/withdrawn and creation balance/allowance drift begins only after the
  visible post-review change control is clicked.
- E22 includes wrapper receipts with wrong ID/recipient, zero amount, another
  emitting contract, missing events and duplicate events. These deliberately
  impossible logs test validation, not the deployed contract's event behavior.
- E14 version/contract/account/chain variants seed only fake B's disposable key.
- E25 ID/sender/pending variants lose the original hash response and expose an
  unrelated recovery candidate in the visible status. It is never submitted;
  failed recovery must preserve the original, recoverable claim reservation.
- E04/E07 include wrong sync/token and inconsistent/missing projection clocks.
- B25-zero-assets has no streams and zero ERC20 balance; B26-tied has two equal
  price/end-time listings. Neither is a performance or real-dataset test.
- B22-one uses a one-raw deposit consistently in the RPC stream, receipt and API
  accounting; test both displayed precision and the post-claim zero guard.
- B25-one/two include one/two owned rights with one prior 0.05 MockUSDC claim
  each. Wallet balances include those receipts, and distinct hashes avoid
  history deduplication. They are read-only cardinality fixtures, not chain replay.
- E17 leaves receipts pending for the actual adapter's 120-second timeout.
- Clock, partial response and fee data are deterministic test values. Fixture
  success does not prove AWS, Sepolia, or MetaMask success.
- Earlier captured fixture balance totals used an incorrect post-claim balance.
  Do not use those observations as portfolio-conservation evidence; re-run on
  this corrected server before making that claim.
