# Post-Release Local Fixes

후속 실제 준비: C의 사람이 승인한 새5,000mint hash `0xadadbf5a1b18fc2808d8010960f167bd1b6b4ea094811ff9bcaf38417ed9011a`는11979481에서 성공·동일 블록 잔액5,000으로 검증됐습니다. 아래 첫 실패는 이전 시도로 보존하며 B 첫100민트는 별도 실패11979505/receipt0x0로 관측했습니다. 코드 전달·개별 mint 성공·전체 거래/촬영 완성은 다른 판정입니다. [데모 계획](./demo-recording-plan-2026-10-24.md)의 최신 결과를 따릅니다.

상태: **후속 명시 승인으로 배포 완료, READY 및 읽기 전용 smoke PASS**. 최신 기록은 `dpl_Dka5S4d6fW9QiMUEK262BfqVVttp`, READY 확인 `2026-10-23T21:20:04.6821896Z`입니다. 운영 주소는 [Vestora](https://vestora-alpha.vercel.app), 고정 배포 주소는 [해당 릴리스](https://vestora-k5w8lmxwr-shusi1625s-projects.vercel.app)입니다. 이전 `dpl_3maxBhcQspcZUaTSrpuQgbei2YyL` / `index-BiUzrgH2.js`는 과거 parity 릴리스입니다.

배포된 `index-Bg3LFlH_.js`의 SHA256은 `8dc6158edc66e9f07950b92d93a1c76a41da8bf7fe540763b5d54bd4a6298625`로 검증된 로컬 빌드와 정확히 일치합니다. `ko.json` 1,130키와 직렬 16 GET smoke가 통과했습니다. 관측 projection은 `lagging`, lag 1, indexed/projected `11979319`, `projectionStatus=applied`이며 synced 판정이 아닙니다. 코드 전달 확인은 실제 지갑 동작이나 전체 QA 완료를 뜻하지 않습니다.

## 날짜 수정 후 이전 오류 표시

- 재현: 과거 날짜로 조건 확인 실패 → 이전으로 → 미래 날짜로 수정 → 검토. 수정 전에는 이전 `create.startPassed` 오류가 새 입력에도 표시됐습니다.
- 수정: 읽기 전용 preflight 실패 당시 `reviewDraft`를 복사해 보관합니다. 새 입력이 다르면 새 조건 확인을 안내하고, 원래 입력이면 기존 실패를 표시합니다. 목록의 기록은 마지막 조건 확인 결과로 구분합니다.
- 안전 범위: `pending` 또는 `evidence`가 있거나 저장소/다른 작업의 미확정 가드에 걸린 경우에는 이 표시 분리를 적용하지 않습니다. 기록 삭제, 자동 재요청, 서명 또는 전송 로직 변경은 없습니다.
- 회귀: 6건 중 수정 전3건 실패, 수정 후6/6통과. 실제 컴포넌트/엔진을 메모리에서 실행하며 모듈을 흉내 낸 별도 정책으로 통과시킨 것이 아닙니다.
- 브라우저: 격리 IAB의1280x720 및390x844에서 재현 경로 재검증, 문서/모달 가로 넘침 및 중첩 버튼0. 수정 후 재조회는 새 조건으로 검토됐고 sendCount0, 거래/영수증 조회 없음. 실제 Chrome·MetaMask·Sepolia 성공으로 간주하지 않습니다.

## B 계정 재사용

- 사용자 최신 지시: **B 그냥 다시 써**. 설명 후 받은 이 지시는 예전의 B 주소 전체 임시 차단 유지 결정보다 최신입니다.
- `claim-policy.ts`에서 B의 정적 계정 차단을 해제했고 위 승인된 배포에 포함됐습니다. 기존 호출 인터페이스는 유지하고, 앱의 일반 계정/작업별 잠금·미확정 기록·복구 검증은 그대로입니다.
- 집중 회귀8건은 변경 전8실패, 변경 후8통과. B에서 읽기 전용 검토가 가드까지 도달하며, 기존 자기 청구 미확정 기록 및 다른 작업의 미확정 바이트는 여전히 차단됩니다. 저장소 읽기 실패도 닫힌 상태를 유지합니다. 테스트가 실제 B 지갑으로 거래한 것은 아닙니다.
- 이 정책 변경은 예전 #3 요청의 성공·실패·폐기를 증명하지 않습니다. 이 수정에서 실제 브라우저 기록을 삭제하거나 #3을 재시도하지 않았습니다. 이전의 정적 차단 유지 지시는 후속 명시 지시로 대체됐지만 저장된 미확정 reservation은 해소된 것으로 간주하지 않습니다.

## 검증

| 명령 | 결과 |
|---|---|
| `npm.cmd run check` | lint·타입, UI/model479/479, deployment8/8, missingImports0 |
| `npm.cmd run test:load-safety` |32/32, 새 부하 실행 아님|
| `npm.cmd run test:ui-performance` |180/180회귀, 새 화면 성능 측정 아님|
| `npm.cmd run qa:ui-typecheck` |통과|
| `npm.cmd run build:prod` |통과, `index-Bg3LFlH_.js`|
| 두 manual-qa 통합 테스트 |11/11, 임시 loopback539/550·53/96, 외부 요청 시도0|

위 로컬 검사는 Node24.19.0입니다. 후속 Node22.x 설정 Vercel 호스팅 빌드도 통과했으나, Node22에서 전체 테스트를 실행했다는 증거는 아닙니다. JS1310.78kB/gzip391.25kB와 기존 Zod annotation/청크 경고는 남아 있습니다. 이 문서 갱신에서 제품 테스트를 다시 실행하지 않았습니다.

## 증거와 한계

- 계획 작업공간 `work/draft-review-context-2026-10-24/`: 수정 전후6건 로그 및 최초 검증. `work/demo-b-reuse-2026-10-24/`: 정책 전후8건, 최종 전체 검사,11건 통합 결과와167개 제품 파일 SHA256.
- 시각 증거는 기존 follow-up root의 `draft-review-context-2026-10-24/`에 있습니다. 최초 문제 증거인 `boundary-followup-2026-10-24/`는 수정 전 역사로 보존했습니다.
- canonical JSON 감사표는 현재 파일·로그를 다시 지문 처리하며, 원본100건과DEP40건의 개별 판정은 바꾸지 않았습니다. 예전 release 동일성 검증기는 당시 스냅샷용입니다.
- 과거 승인 전 기록: 재배포 질문에 대한 설명 요청만으로는 실행하지 않았습니다. 이후 별도의 명시 승인으로 위 프론트 재배포를 완료했습니다. 이 승인 전의 미배포 문구는 현재 상태가 아닙니다. 해당 배포 승인은 소진됐으며 반복 배포 권한이 아닙니다.
- 데모는 사용자가 축소를 거절하고 원안 7지급 합계6,400MockUSDC 한 세트와 민트 목표 A10,000/B100/C5,000을 선택했습니다. 사람이 A→B/A→C 각각0.002ETH 입금을 완료했다고 알렸고 블록11979338의 잔액을 독립 관측했습니다. 당시 송금 hash/영수증은 별도 검증하지 않았습니다.
- 후속 PREP 녹화는 저장됐지만 본편은 없습니다. C5,000 민트 시도는 블록11979373의 receipt `0x0`/logs0으로 실패했습니다. EIP-7702 type4 외부 거래 관측만으로 원인을 단정하지 않습니다. 재시도 요청은 메인 작업의 안전한 재연결·점검 대상이며 이 문서 작업은 재시도나 저장소 삭제를 수행하지 않습니다. 세부 금액·녹화 한계·영수증은 [데모 계획](./demo-recording-plan-2026-10-24.md)에 기록합니다.
- 원본100/DEP40 판정과 Goal **INCOMPLETE**는 유지합니다. 이 문서 작업은 stage Markdown만 수정하며 AWS/DB/계약/환경변수 변경, 제품 수정, 서명·전송, 커밋·푸시를 수행하지 않습니다.
- 메인의 동시 후속 기록은 사람의 C 재연결 후 동일 실패 hash 복원·새5,000 read-only 검토까지입니다. 추가 지갑 요청이나 전송 재시도·수동 저장소 삭제는 없으며 상세 증거는 위 데모 계획에서 연결합니다.

## 배포 원문 증거

- [READY 기록](<C:/Users/AAAAA/OneDrive - 한양대학교/문서/ChatGPT/2026 졸업프로젝트/work/demo-b-reuse-2026-10-24/release.json>)과 [16 GET·자산 해시·locale·projection 관측](<C:/Users/AAAAA/OneDrive - 한양대학교/문서/ChatGPT/2026 졸업프로젝트/work/demo-b-reuse-2026-10-24/post-smoke.json>). `release.json`의 `smokePending=true`는 smoke 전 스냅샷이며 후속 `post-smoke.json`의 PASS로 시점상 대체됩니다.
- [로컬 전체 검사 기록](<C:/Users/AAAAA/OneDrive - 한양대학교/문서/ChatGPT/2026 졸업프로젝트/work/demo-b-reuse-2026-10-24/local-results.json>)과 [호스팅 빌드 로그](<C:/Users/AAAAA/OneDrive - 한양대학교/문서/ChatGPT/2026 졸업프로젝트/work/demo-b-reuse-2026-10-24/vercel-build.log>). CLI의 Node24 표시는 원격 호스팅 전체 테스트의 Node 버전 증거가 아닙니다.
