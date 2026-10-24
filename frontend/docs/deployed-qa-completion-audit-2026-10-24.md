# Deployed QA Completion Audit

Snapshot: 2026-10-24 KST. Result: **INCOMPLETE**. This is evidence reconciliation, not a new test run or authorization.

최신 별도 준비 결과: C의 사람이 승인한 새 민트 hash `0xadadbf5a1b18fc2808d8010960f167bd1b6b4ea094811ff9bcaf38417ed9011a`는11979481에서 성공했으며 정확한5,000mint·동일 블록 지갑 잔액5,000을 독립 확인했습니다. 아래 첫 실패는 이 성공 이전 시도로 보존합니다. B 첫100민트는11979505/receipt0x0/logs0으로 별도 실패했고 새 조건 검토 상태입니다. 두 PREP와8초 커서 시안은 저장됐지만 본편·실제 조작 커서 기록은 아닙니다. 원본100/DEP40 판정은 승격하지 않습니다.

현재 후속 기록: 명시 승인 릴리스 `dpl_Dka5S4d6fW9QiMUEK262BfqVVttp`가 `2026-10-23T21:20:04.6821896Z`에 READY로 확인됐습니다. [운영 Vestora](https://vestora-alpha.vercel.app)의 `index-Bg3LFlH_.js` SHA256 `8dc6158edc66e9f07950b92d93a1c76a41da8bf7fe540763b5d54bd4a6298625` 정확 일치, locale1,130키·16 GET smoke PASS입니다. projection은 lag1/`applied`/`lagging`으로 synced가 아닙니다. [수정·배포 원문](./post-release-local-fixes-2026-10-24.md)을 따르며 [이전 parity 릴리스](./frontend-parity-release-2026-10-24.md)의 미배포/차단 유지 문구는 당시 이력입니다.

B 정적 주소 차단 해제와 edited-draft 오류 표시 수정은 배포됐으나 저장된 pending 가드는 유지되며 예전 #3 해소는 미증명입니다. 사용자는 축소를 거절하고 원안7지급 합계6,400MockUSDC 한 세트와 민트 목표 A10,000/B100/C5,000을 확정했습니다. PREP MP4+JSON은 SAVED이나 탭 공유(`displaySurface=browser`)여서 MetaMask 팝업 촬영이나 본편 완성을 뜻하지 않습니다. C5,000 민트는 receipt0x0으로 실패했습니다. [데모 계획과 증거](./demo-recording-plan-2026-10-24.md)에 별도 준비 집단으로 기록하며 과거 T05를 소급 변경하지 않습니다. 원본100/DEP40 판정과 **INCOMPLETE**는 유지합니다. 이전 복사본은 planning `work/post-release-reconcile-2026-10-24/before/`, `work/released-qa-reconcile-2026-10-24/before/`에 있습니다.

## Inputs And Counts

- [Canonical 40-case ledger](./deployed-qa-ledger-2026-10-23.json) retains environment-specific results: deployed UI8PASS/13PARTIAL/3NOT_RUN. Actual T01/T02/T03 passed; all remaining T cases are incomplete. Older failures remain historical evidence.
- [Full machine-readable crosswalk](./deployed-qa-completion-audit-2026-10-24.json) preserves all100 original procedures, expected results, dated observations/statuses and semantic links to all40 DEP cases. It records SHA256s for its input snapshot; PREP/C-mint follow-up below is later Markdown evidence, not a claim that this sidecar refreshed JSON fingerprints.
- Original planning sources are `work/vestora-test-plan-2026-10-22.md` and `work/vestora-manual-results-2026-10-22.md` in the retained planning workspace. The latter's exact100-row ID table, not its earlier summary paragraphs, yields UI63/UI+UNIT3/UNIT12/PARTIAL7/FAIL1/PERFORMANCE8/HOLD6. No original result was changed or promoted.
- Do not add100+40 as successful tests. Their identifiers, environment/account requirements and scopes differ. A semantic crosswalk is not a substitution of an original B-specific claim with C's new workflow.

## Requirement Audit

| Goal stage | Evidence reviewed | Completion boundary |
|---|---|---|
| 1: reconcile source, old100 and DEP40 | Dated AGENTS/handoff/Git observations, exact original plan/result rows, canonical ledger and this crosswalk | Reconciliation established; latest delivered asset exactly matches verified build, while older observations retain their own cohorts. This sidecar did not reverify current Git |
| 2: history/acquisition/open receipt | Fail-before/pass-after regressions, serial API reader, unknown-history behavior, retained-modal browser fault/recovery and later journal accounting correction | Corrections now deployed with healthy actual A/C data. Original live HTTP cause and live fault/recovery remain unproven |
| 3: isolated errors/boundaries/persistence | Canonical E-case pointers, new independent balance faults, core/adapter regressions, browser controls and selected real-React observations | Subcase evidence exists, but declared remaining boundary/combination variants are not all complete; no synthetic live pass |
| 4: checks and browser | Local Node24:479UI/model+8deployment+32safety+180regression, QA types/build,11loopback; focused draft6/policy8 PASS | Same asset is deployed; Node22 evidence is hosting build only, not full tests. Existing chunk/annotation warnings and broader keyboard/real zoom/device gaps remain. This docs task reran no product tests |
| 5: deployed UI | Latest approved READY release, exact asset/locale1,130keys/16 GET PASS; older C/A/C and picker-cancel evidence scoped to that earlier release | Latest read gate done, lag1/applied is not synced. Older picker cancel-disconnect expectation stays NOT_MET. Original A/B, revoke/restart, real200% and latest production error transitions remain incomplete |
| 6: actual Sepolia | Original approval/create receipts; human-reported A→B/C0.002ETH each and block11979338 balances; failed C5,000 mint receipt and block11979399 read | Original T01..T03 only. Funding hashes/receipts not separately verified then; #5 claim/time windows unfulfilled. B static hold lifted/deployed, old#3 unproven. New mint failure is not claim success or old T05 evidence; T0 unset |

## Expectation Changes

- Legacy F28 tested disabled buy/list/unlist/cancel actions and old sell-route redirection. That was valid for its historical build. The user later explicitly requested local feature restoration; its old PASS does not verify current enabled actions. Repeat safe guards and actual lifecycle testing against the new cohort after the appropriate approvals.
- Legacy D01..D06 remain historical disconnected holds. The current local implementation now restores their surface and selected isolated behaviors, including protected buy and listed cancellation. This does not establish whole-case or actual signed success.
- Listed cancellation policy was explicitly selected by the user to match the contract/legacy: permit issuer cancellation, retain vested owner rights and the listing, return only unvested funds. Do not retain the earlier unsupported assumption that listing itself prevents cancellation.
- Original F17/F18/F19 are B-specific. C's approval/create evidence does not prove B's old #3 outcome or pass those original cases. The user later explicitly requested B reuse and approved the release, so only the static address hold was lifted and deployed. Stored pending guards remain and historical outcomes are not rewritten.
- Actual picker cancellation did not meet the initially stated C-retention expectation: app intentionally cleared its connection rather than falling back to a cached account. Source catch path and actual UI agree. Preserve this NOT_MET expectation and separate it from safe no-fallback behavior; do not silently turn it into a retention PASS or permission-revocation proof.
- The user reconfirmed that the requested actual network switch could not be performed with the available MetaMask UI. DEP-D20 remains NOT_RUN in production and PASS only in isolation. Do not repeat the same menu instructions without new verified UI evidence.
- Legacy B29/E27 already contain historical human-assisted zoom/restart subcases, but broader combinations remain partial. They are not latest-source/deployed-origin evidence and do not eliminate the current human gates.
- P01..P08 and later G1/G2/G3 remain a separate incomplete performance record. See [performance checkpoint](../../docs/report/performance-status-2026-10-23.md); no new load test follows from this audit.

## Next Execution Groups

| Group | Next action | Authority needed |
|---|---|---|
| LOCAL-MATRIX | Remaining native matrix was skipped by the user for release first; partial observations retained, not passed | Still incomplete; no actual wallet/zoom/restart substitution |
| RELEASE | Latest approved B/draft release READY, exact asset/locale and bounded16 GET PASS | Approval consumed; no repeat release authority |
| WALLET-LIFECYCLE | C/A/C and picker-cancel observations recorded; retention expectation NOT_MET. Original A/B, revoke and restart remain | Human actions at the actual step; do not re-request the unavailable network switch without new UI evidence |
| VISUAL-HUMAN | Populated pages, long amounts and pending/error dialogs at actual200% plus broader device checks | Human foreground/zoom/device actions; viewport overrides are not real zoom |
| C-FINAL-CLAIM | Fresh #5 conditions, wallet maximum/funds review, exact final claim receipt and A/C accounting | Before-wallet clarification is historical, not a live prompt read. No confirmed #5 claim; individual human action remains |
| MISSED-TIME-WINDOW | Preserve missed#5 windows; record any future observation under its exact cohort/receipt time | Original7-payment demo approval does not retrospectively pass T04/T05 or add a separate scaled QA cohort |
| DEMO-PREPARATION | Original6,400MockUSDC one set; PREP saved; inspect failed C5,000 mint and connection, T0 unset | User requested retry; main handles safe reconnect/inspection. Final financial action human-only; no stored deletion/automatic resend |
| LIVE-POSITIVE-DATA | Positive actual cancelled/unlisted/invalidated/future variants | Separate explicit controlled data/transaction scope after deployment; no fabricated data or automatic sends |

후속 준비 증거: PREP는401868ms/10161118bytes/2560x1440·30fps/영상만이며 본편·팝업 촬영 확인은 없습니다. 블록11979338 잔액은 A0.013251893889375750ETH, B/C각0.003ETH입니다. C 민트 hash `0x0c2d9775bb49903c6c3f126b8368b5788a554b1057a5fb7f9b3f20dcc8bc7ed4`는 블록11979373(`2026-10-23T21:31:12Z`), receipt0x0/logs0, 실제 가스0.000377019003770190ETH입니다. 외부 EIP-7702 type4 경로 관측만으로 원인은 확정되지 않습니다. 블록11979399의 C토큰0/ETH0.002622980996229810/confirmedNonce2·pending2도 성공이나 재전송 안전성의 증거가 아닙니다.

Goal은 **INCOMPLETE**입니다. 이전 감사 시점의 “서명·전송 없음”은 당시 범위이며 후속 사람의 입금 보고와 실패한 민트까지 부정하지 않습니다. 메인 후속 증거는 사람의 C 재연결 후 동일 실패 hash 복원·새5,000 read-only 검토까지이며 추가 지갑 요청·전송 재시도·수동 저장소 삭제는 없습니다. 이번 stage 문서 작업은 기존 증거만 읽었고 제품·JSON·스크립트·영상 수정, 네트워크·브라우저·지갑 실행, 부하·배포·AWS/DB/계약 변경, Goal 상태 변경, 커밋·푸시를 하지 않았습니다. 청구 성공이나 최종 데모 영상은 없습니다.
