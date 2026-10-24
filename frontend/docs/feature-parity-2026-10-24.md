# Frontend Feature Parity, 2026-10-24

후속 실제 민트: 사람이 승인한 C 재시도 hash `0xadadbf5a1b18fc2808d8010960f167bd1b6b4ea094811ff9bcaf38417ed9011a`는11979481에서 정확히5,000mint/동일 블록 잔액5,000으로 검증됐습니다. 아래 C 첫 실패 한계는 당시 관측이며 전체 민트/거래 PASS로 바꾸지 않습니다. B 첫100민트는 별도 실패로 보존하고 새 검토를 준비했습니다. [시점별 데모 준비 증거](./demo-recording-plan-2026-10-24.md)를 따릅니다.

Scope: Vite implementation under `frontend/`, with retained Next.js `frontend-legacy/` as the behavioral reference. 초기 local-only 복원 결과와 후속 릴리스를 구분합니다. 아래 날짜별 검사 수·모의 거래는 해당 시점의 증거이며 실제 서명 성공으로 바꾸지 않습니다.

현재 릴리스: 사용자 명시 승인으로 B 정적 차단 해제와 edited-draft 오류 표시 수정까지 포함한 `dpl_Dka5S4d6fW9QiMUEK262BfqVVttp`가 `2026-10-23T21:20:04.6821896Z`에 READY로 확인됐습니다. 운영 [Vestora](https://vestora-alpha.vercel.app), 자산 `index-Bg3LFlH_.js`, SHA256 `8dc6158edc66e9f07950b92d93a1c76a41da8bf7fe540763b5d54bd4a6298625` 정확 일치, locale1,130키·16 GET smoke PASS입니다. lag1/`applied`/`lagging` 관측은 synced가 아닙니다. [최신 수정·배포 증거](./post-release-local-fixes-2026-10-24.md)를 따릅니다.

현재 로컬 검사는 Node24에서479UI/model+8deployment+32safety+180회귀+11loopback 및 QA types/build PASS, 집중 draft6/policy8 PASS입니다. Node22는 최신 호스팅 빌드만 통과했으며 전체 테스트 실행 증거는 없습니다. 이전 `dpl_3maxBhcQspcZUaTSrpuQgbei2YyL`/`index-BiUzrgH2.js`의 [parity 릴리스 보고서](./frontend-parity-release-2026-10-24.md)와 아래473/471검사·미배포·차단 유지 문장은 시점별 이력입니다. 정적 B차단 해제는 저장된 미확정 reservation이나 예전#3 해소를 뜻하지 않습니다.

후속 [데모 준비](./demo-recording-plan-2026-10-24.md)는 원안7지급 합계6,400MockUSDC 한 세트와 민트 목표 A10,000/B100/C5,000으로 승인됐습니다. 사람의 A→B/C각0.002ETH 입금 보고 후 잔액 확인과 PREP SAVED가 있으나, C5,000 민트는 receipt0x0으로 실패했습니다. 탭 녹화는 MetaMask 팝업 촬영이나 본편 완료가 아닙니다. 재시도 요청은 메인의 안전한 재연결·점검 대상이며 이 스냅샷에는 전송 재시도·수동 저장소 삭제·새 청구 성공이 없습니다. T0미설정, 원본100/DEP40과 Goal INCOMPLETE 유지; 과거 T05에 소급하지 않습니다.

메인의 동시 후속 증거는 사람의 C 재연결 후 같은 실패 hash 복원·새5,000 read-only 검토까지입니다. 추가 지갑 요청·전송 재시도·수동 저장소 삭제는 없고 지갑 최종 최대 비용은 미확인입니다. 위 데모 계획에서 원문을 연결합니다.

## Creation API Decision

`frontend-legacy/hooks/use-vestora.ts` calls `createStreamWithDuration`. Its delay/duration are measured from the mined block timestamp. The Vite form instead reviews an absolute start and end date/time, and `docs/payment-creation.md` explicitly says not to silently move an expired start. Accordingly Vite retains `createStream` with the exact reviewed timestamps.

This is a present-day semantic justification, not evidence of the original migration author's intention. The introducing/promoting commits do not explain a comparative decision. Silently substituting the duration API would change the user's promised schedule while a wallet approval or mining is delayed. A future duration option should use a distinct form/draft and verify dates against the receipt block.

Both approval and creation now check the chain time again immediately before opening the wallet. Expired starts fail as proven unsent errors; existing version-1 absolute reservations still recover using their original fields. A user can still wait in the wallet until after the start. Only a contract-level deadline can prohibit that mining outcome.

## Restored Surface

| Legacy behavior | Vite implementation |
| --- | --- |
| Self-mint test MockUSDC | Assets test-token dialog, exact Transfer proof, receipt-block balance |
| Approve token and create payment | Separate exact-amount approval and absolute-schedule creation; no automatic second send |
| Claim receivable | Existing verified claim engine, shared cross-operation new-send guard |
| Approve individual NFT and list | Separate NFT approval and listing with fresh on-chain review |
| Remove listing | Original seller cancellation, including stale non-custodial listing |
| Approve payment token and buy | Separate token approval and `buyWithProtection` with seller/price/remaining/withdrawn bounds |
| Cancel issued payment | Issuer preflight, actual receipt-block refund and surviving owner rights |
| Select receivable by ID | Market ID lookup and working direct `/claims/:id` and sell route |
| Observe requests and confirmations | Global action monitoring and bounded browser-local history alongside indexed trades/claims |

## Cancellation While Listed

The user explicitly selected the legacy/contract policy: permit cancellation while listed and disclose the risk. Cancellation stops future accrual and refunds only unvested funds to the issuer. Vested unclaimed rights remain with the current NFT owner. It does not cancel the listing, transfer the NFT back, or pay the owner's unclaimed balance directly. A positive remaining canceled receivable can still be traded subject to fresh protected-buy validation.

Quote amounts are estimates at the quoted block. Receipt evidence records actual refund and block-end unclaimed rights; another claim in the same block can affect the latter. Ended/zero-refund cancellation is not offered as a new UI action, but a previously submitted cancellation mined after the end can still prove a zero-refund success.

## Safety Boundaries

- Every wallet stage is an explicit human command with captured account/chain/provider checks, simulation and fee affordability. No approval automatically sends the next transaction.
- One existing per-account/stream Web Lock is shared by claim, create, market, cancellation and mint. Every foreign pending reservation, including malformed records, blocks new writes. Read-only receipt/hash recovery remains possible.
- Unknown submission, timeout, missing hash or storage failure never proves that a resend is safe. B static hold was active during the original restoration; later explicit approval lifted and deployed only that hold. Old#3 outcome and stored unresolved reservations remain unproven/guarded.
- Marketplace replacement monitoring requires the original hash plus same sender/nonce, and binds the mined transaction to its receipt block/hash. An unrelated returned hash or malformed receipt status stays unresolved; recovery to a different known hash also requires the original nonce. Five additional regressions protect these terminal-state boundaries.
- Local history is display-only, bounded and account/deployment scoped. It is not a pending reservation, authorization source or complete wallet history. API and receipt proof are not replaced by journal data.
- Historical local-restoration authority did not include wallet/signatures/public RPC/AWS/deployment/commit/push. Later specific releases and human demo preparation are recorded above; this docs sidecar performs none of those actions.

## Historical Verification, Journal Correction Cohort

This historical table is the473-test journal-correction cohort on local Node24.19.0. Node22.x hosting subsequently passed for that release and for the latest479-test source; neither is a Node22 full-suite result. Latest source/release evidence is above.

| Command | Result |
| --- | --- |
| `npm.cmd run check` | Lint without warnings, app/node typechecks, 473 UI/model regressions, 8 deployment tests and source audit passed; missingImports=[] |
| `npm.cmd run test:load-safety` | 32/32 passed; safety unit tests, not a live load run |
| `npm.cmd run test:ui-performance` | 180/180 passed; measurement regression, not new live performance evidence |
| `npm.cmd run qa:ui-typecheck` | Passed |
| `node --test tests/manual-qa/parity-smoke.test.mjs` | 9/9 passed, actual integrated cores, temporary loopback server, 539/550 requests, 0 outside-origin attempts |
| `npm.cmd run build:prod` | Passed for this historical cohort; main JS `index-BiUzrgH2.js`, 1310.32 kB / gzip391.13 kB. Existing Zod annotation and chunk-size warnings remain. |

Chrome used `http://127.0.0.1:4212` against loopback API/RPC `4391`, never MetaMask or production. Browser evidence was saved under the task visualization directory `goal-qa-2026-10-23/feature-parity-2026-10-24/`:

- Market: 0.8 MockUSDC approval stopped after exactly one fake send; explicit fresh review then protected buy produced a second send. Receipt-confirmed indexing stayed visible until a separately applied API checkpoint. Indexed purchase replaced its local diagnostic row; approval remained a separate allowance record. Both survived reload.
- Seller: individual NFT approval, 1.2 MockUSDC listing, and cancelListing completed as distinct requests. The canceled listing appeared in the proper sales filter. While listing was unresolved, a new claim review was blocked by `actions.otherPending` without another send.
- Listed issuer cancellation: quote refund 0.750000 differed from actual mined refund 0.749500. The current owner's 0.250500 right and listing remained. After projection application, owner B could claim exactly that remainder; future rights were zero and total ownership remained separate from issuer management.
- Mint: 10 MockUSDC completed from exact receipt proof with receipt-block balance 12.350500 while the portfolio still showed projection-pinned balance 2.350500. A second 1-token request deliberately lost its hash response, stayed unresolved through reload/account changes, and completed by supplied existing hash with the fake send count unchanged at 4 (cancel, claim, mint, mint).
- Layout: default desktop 2560x1257 and mobile 390x844 checked. No document horizontal overflow or nested buttons. Direct ID lookup opened `/claims/4`; the mobile detail remained within x=16..374, vertically scrollable, with the sale form's Tab reaching its condition-check button. Asset legend precision opens independently of category selection. Temporary viewport override reset.

The browser exposed a pre-existing nested-button issue in AssetComposition when Figure has hidden precision. Category selection and precision disclosure are now sibling controls, with two structural regressions in `tests/feature-layout.test.mjs`. Browser no longer reported nested buttons in the rendered document. Earlier HMR/React log entries during staged source replacement are not represented as production runtime errors or cleared proof.

## Remaining Limits

### Additional Isolated Reliability Checks

- After parity integration, a personal-history-only fault kept an already-open indexed claim receipt/hash/raw250500 visible with a historical-detail warning. The list explicitly fell back to6 browser-only rows; non-reset recovery restored7 deduped rows and removed the history-error warning. No additional fake send occurred(sendCount4). This is local D17/E06 subcase evidence, not a captured AWS cause.
- Separate ETH-only and token-balance-only faults were added to the manual fixture, not product code. Actual balance/claim adapter regressions passed2/2 with53/96 loopback requests,0outside-origin attempts and0wallet accesses. The existing parity suite remains9/9 with539/550 requests, unchanged caps.
- Real local React withholds totals on either balance-bundle failure rather than displaying0. ETH-only failure blocks claim preflight before the wallet; token-balance-only failure still allows a read-only incoming-claim review when native funds/owner/amount/simulation are known. Neither browser case clicked wallet approval; non-reset recovery restored wallet2+remaining1=holdings3 and sendCount0. These fields do not prove actual MetaMask maximum affordability.
- Browser artifacts `E05-native-only-*`, `E05-token-only-*` and `balance-fault-followup.json` share the feature evidence directory. Previous disposable browser-journal personal-claim labels survive case reset and are excluded from this follow-up's accounting assertions. An immediate stale control-counter render was followed by an authoritative fresh status, not silently counted as zero requests.
- Historical fixture-only verification passed with471UI/model and its unchanged8/32/180 suites, QA types,9parity+2balance and build. At that point the local bundle was `index-B_tVt9U6.js`, not the subsequent473-test table's `index-BiUzrgH2.js` or latest479-test release. Actual wallet proof remains separate.

### Unverified And Operational Limits

- A later local D11 correction excludes display-journal rows from projection-pinned acquisition/personal-claim summaries. The old merged-list consumer could include a completed local receipt without a matching current API event. Two actual-model regressions failed before(250 instead of0; mixed input500 instead of250) and passed after. API/prototype rows retain their existing semantics, while transaction history keeps all local display records. No pending/history cleanup occurs.
- Real React evidence shows the retained journal0.250500 no longer changes normal-case API personal0; detail agrees and the transaction page still has6 local rows. An independently seeded indexed claim0.05 is correctly included; history failure then shows unknown, not local-derived direct/zero. Recovery restores normal personal0. These artifacts and `history-provenance-followup.json` are in the feature evidence directory. Initial visual mismatch used repeated deterministic mock resets, not an observed production rollback or API HTTP cause.
- Historical full verification after this correction is the table's473 UI/model, unchanged8/32/180, QA types/build and11loopback(9parity+2balance),0outside-origin attempts. Earlier471/`index-B_tVt9U6.js` precedes it. The then-local `index-BiUzrgH2.js` was later deployed with parity approval; the latest release above supersedes it without promoting any live case.

- At the historical local-correction point, no Vercel deployment/AWS/backend/contract mutation/signature/commit/push occurred. Subsequent explicitly approved releases upgraded the deployed URL as recorded above. This Markdown reconciliation itself performs no deployment or product operation.
- Earlier live #5/C and unresolved B #3 checks retain their prior status. No missed real-time test or incomplete 100-case manual ledger is upgraded to PASS by mocked tests.
- The browser journal records only observed/restored attempts, has no cross-tab synchronization, and may lose display history in concurrent journal instances. Financial pending reservations and locks are separate and unchanged. Clearing local history cannot make a transaction safe to resend.
- The mock ledger is not an EVM/finality test and does not model native gas debits. Deterministic affordability is not MetaMask's final maximum. Latest deployment approval is already consumed; real operations still require the authorized terms, fresh checks and final human financial action. Failed actual C mint is a separate preparation result, not a positive lifecycle PASS.
- Canceled or fully claimed listings are not automatically removed by the contract. Fresh owner/approval/value/protection checks remain required even if an API card is visible.
- Existing dated deployment/QA documents retain their historical scope. See this report for current local parity rather than treating an older disabled-action scope as today's source behavior.
