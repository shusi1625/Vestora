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

- The follow-up adds `E03-503` for HTTP-capacity failure and recovery UI checks.
- `E05-balance` keeps the historical combined `eth_getBalance`/`eth_call` fault.
  `E05-eth-balance` fails only native ETH balance reads; `E05-token-balance`
  fails only MockUSDC `balanceOf`, not decimals, ownership or claim simulation.
  The current portfolio adapter intentionally rejects its combined balance
  snapshot if either read fails; unknown holdings must not appear as zero.
  A claim needs native gas funds but not the recipient's current ERC20 balance:
  token-only failure may still reach a fresh incoming-claim review. Do not click
  its wallet-confirm button for this read-only subcase. The normal recovery
  control restores reads without clearing any pending data.
- `B31-cancelled` is read-only: #3 has deposit1, claimed0.10, vested0.45,
  remaining claimable0.35 and refunded0.55 MockUSDC; no future entitlement remains.
  Its active listing stays visible for payment-phase filtering. #4 is a separate
  non-cancellable streaming payment. API/RPC values and mock account balances
  include the claim/refund, and `/qa/send` rejects all submissions in this mode.
  This proves only isolated UI/accounting behavior, not a real cancellation.
- `개인 이력 조회 실패` (local `POST /qa/history-failure`) changes only the
  history fault mode. Unlike case application, it does not reset mock receipts,
  account state or pending records. This allows an already-open receipt to be
  inspected during a failed background history refresh. The existing recovery
  control restores normal history without clearing those records. These local
  fault controls are not backend API routes or evidence of a live HTTP cause.

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

## Market, Cancellation And Mint Parity Modes

The existing modes above remain on their original path. The explicit
`parity-market`, `parity-cancel` and `parity-mint` modes use a separate in-memory
ledger with mined-block snapshots, canonical mock transaction identities,
receipts and independently applied API snapshots. They do not emulate an EVM.
The real app's adapters still validate their exact calldata and event evidence.
Marketplace address is fixed at
`0x6184F4C3718447aBbe8B5Eb2bb73163C9Cfc49d7`.

Initial state for these three modes:

- Mock wallet starts as A. A/B/C controls select only disposable fixture accounts.
- #3: sender A, original recipient/current owner B, 1 MockUSDC deposited,
  zero withdrawn, 25% vested initially; listed by B for 0.8 MockUSDC and approved
  for the marketplace. A needs an exact ERC20 approval before a purchase.
- #4: sender A, owner B, 2 MockUSDC deposited, 0.1 already claimed, 50% vested
  initially; unlisted and not NFT-approved. B can explicitly approve the NFT,
  review/list, and later cancel its listing in separate transactions.
- Both streams are cancelable, including while listed. Cancellation keeps
  ownership and the listing, sends only the unvested refund to A, and leaves
  vested unclaimed funds in escrow for the current owner. B can claim afterward.
- ERC20 balances: A=10, B=2.1, C=3, stream escrow=2.9 MockUSDC; total supply=18.
  Token transfers conserve this sum; mint increases supply and recipient balance.
  ERC20 allowance consumption and NFT approval clearing follow their own targets.

The visible parity controls support:

1. `채굴 보류` leaves a known hash pending without mutating balances or ownership.
   `보류 거래 채굴` mines the queue once; `자동 채굴 재개` also mines future sends.
   Mined transactions get one additional confirmation block for the real receipt
   watcher. Nonces are scoped per mock sender; pending/latest nonce reads differ.
2. API projection is held by default after sends. `API 스냅샷 최신 블록 반영`
   applies the actual current ledger and checkpoint; `API 자동 반영 재개` enables
   subsequent automatic application. It does not fabricate receipt success.
3. `모의 블록 시간 +60초` advances the mock chain without rewriting past blocks.
   Quote and receipt estimates can differ; cancellation uses the receipt timestamp.
4. `다음 전송의 해시 응답 유실` submits once and loses only the mock response.
   Status shows `lastHash` for read-only recovery. Keep the app's unknown pending
   reservation; do not resend it. The hash-loss control does not touch real wallets.

Status exposes head/applied block, mining mode, queue hashes, sender nonces,
latest balances and projection-block balances. A mint receipt's balance is read
at its receipt block and stays frozen there even after later mints; the app's
projection-based portfolio can still show the older balance until API application.
Mint itself has no API event projection and completes from verified receipt proof.

Runtime and safety:

- Fixed normal ports remain 4391 (API/RPC) and 4212/4213 (UI). Do not stop or
  restart a parent-managed existing runtime. Parent verifies process identity
  before replacing its own test server after integration.
- The server binds IPv4 loopback, rejects foreign Host/Origin, has no upstream
  client, and only accepts the fixture contracts and mock senders for parity sends.
  Invalid ownership, balance, allowance, seller, price and protected limits fail.
- Existing RPC cap=1500 and API caps from `scaled-data.mjs` are unchanged. Parity
  additionally caps submissions at 40, queued transactions at 4 and head at 240.
  Clock steps are bounded to 1-3600 seconds; body limit remains 32768 bytes.
- The UI refuses to access storage outside the exact fixture UI origins.
  Case reset clears only fake A/B/C claim/create/market/cancel/mint pending keys
  on that disposable origin. It never reads or clears any actual production E14
  key, production wallet account, live origin storage, journal or signing key.
- Existing E/B/scale modes are not silently upgraded into parity ledgers.
  `B31-cancelled` and scale/harness read-only send restrictions are preserved.
  Account/ID lookup can use these fake addresses and IDs 3/4 in parity modes;
  unknown parity IDs return 404 rather than synthesized streams.

## Bounded Staging Smoke

From this staged `frontend` directory:

```powershell
node --test tests/manual-qa/parity-smoke.test.mjs
node tests/manual-qa/parity-smoke.test.mjs --typecheck
node --test tests/manual-qa/balance-fault.test.mjs
```

The smoke imports this server in memory, binds an OS-assigned temporary loopback
port, and closes only that server. It never contacts 4391/4212 or a parent-managed
runtime. A 550-request cap and 5-second request deadlines fail closed; all other
origins are denied. Source discovery honors `VESTORA_FRONTEND_SOURCE` first,
then the helper's relative frontend root when package.json/tsconfig.app.json
exist, and finally `C:/GitHub/Vestora/frontend` for isolated staging use.
Integrated market/cancel/mint modules in that source root take priority; sibling
staging cores are used only when a module has not yet been integrated. The final
smoke summary records the exact loaded core paths.

The smoke exercises actual market/cancel/mint engines and viem adapters against
the isolated mock transport, existing E/B/10/100/1000-scale paths, bad sends,
receipt identity, exact approvals, ownership, conservation, API lag, pending
mining, mock wallet account selection and deliberate hash loss. It is not a
React/browser or deployed verification. Parent owns final UI/browser validation.

The separate balance-fault check uses an ephemeral loopback port and the actual
`readBalances`/`readClaimQuote` adapters. Its own 96-request cap, 5-second fetch
deadline and outside-origin trap are independent of the parity smoke's unchanged
550-request cap. It never sends a transaction or changes an existing QA server.
The `--typecheck` command checks the existing QA project plus staged main/wallet,
without emitting files; unrelated concurrent source errors remain visible.
