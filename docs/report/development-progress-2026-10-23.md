# 개발 진행 정리 (2026-10-23)

이 문서는 배포 보류 후 미문서화 변경을 정리한 체크포인트다. 구현 코드, 과거 로컬 검증, 실제 환경 관측, 미완료 항목을 구분한다. 아래 역사적 관측을 이번 작업의 새 실환경 실행으로 바꾸지 않았다. 커밋 직전 로컬 재검증과 포함/제외 범위는 [검증 기록](checkpoint-verification-2026-10-23.md)에 별도로 남긴다.

## 현재 판정

- 기존 `frontend/`는 Next.js 앱이고 `frontend-sample/`은 별도 Vite 앱이다. 두 앱이 공존하며 새 앱의 기존 경로 이동, 운영 프런트엔드 교체, 배포, 새 Vercel 프로젝트 생성은 실행하지 않았다.
- 새 UI의 조회, 청구, 정확한 수량의 토큰 승인과 지급 생성, 복구 보호 및 마켓 렌더링 최적화는 코드에 반영돼 있다. 아래 구현 완료는 해당 코드 범위의 완료이며 전체 기능 또는 배포 완료를 뜻하지 않는다.
- 실제 지급 #4 생성은 확인됐지만 B 계정 #3의 해시 없는 청구 요청은 차단 상태다. `functionalP0Passed=false`, `wholeGoalComplete=false`를 유지한다.
- 성능은 G2 고정 부하 미달, G3 부분 실행 후 중단이다. [성능 상태 정리](performance-status-2026-10-23.md)를 함께 읽는다.

## Git 작업 범위

읽기 전용 조사 시점의 `git status --short --branch`는 `main...origin/main [ahead 1]`이었다. 로컬 HEAD는 `373a939`(2026-10-16, Phase 9.6 AWS 롤아웃 기록)이며, 원격을 새로 조회한 결과는 아니다. 이미 존재하는 로컬 커밋과 아래 미커밋 파일을 구별해야 한다. 당시 staged diff는 비어 있었다.

아래 목록은 정리 이전 상태다. 이후 프론트 코드는 `923c2fd`, backend 계측·경계 테스트는 `0cd3ed8`로 로컬 커밋했다. 이번 문서와 최종 검사 범위는 [체크포인트 검증](checkpoint-verification-2026-10-23.md)을 따른다. push와 배포는 하지 않았다.

| 구분 | 조사 시점의 대상 | 의미 |
| --- | --- | --- |
| 추적 파일 변경 | `backend/README.md`, API 4개 routes, `sync-context.ts`, `app.ts` | 기본 비활성 로컬 span 계측 및 설명 |
| 추적 파일 변경 | `frontend/app/layout.tsx`, `app/page.tsx`, `lib/contracts.ts`, `lib/transaction-policy.ts`, 관련 정책 테스트 | 기존 Next 앱의 컴포넌트 진입, 한국어 설정, ABI 및 지갑 오류 분류 |
| 추적 파일 변경 | `test/ReceivableStream.ts` | 자기 수취, 최소 단위, 시간 경계와 취소 후 자금 보존 시험 |
| 미추적 | `backend/src/api/local-spans.ts`, `backend/scripts/test-local-spans.mjs` | 계측 구현과 격리 회귀 |
| 미추적 | `docs/design-system/`, `frontend/app/design-system/`, `frontend/components/`, `hooks/`, `styles/`, 신규 금액·pending 모듈과 테스트 | 기존 Next 앱의 디자인 시스템 및 컨트롤러 분리 |
| 미추적 | `frontend-sample/` 전체 | 별도 Vite 앱, 원본 수집 자료, 문서, 제품 코드, 수동 QA·성능 하네스 |

당시 추적 파일 diff는 13개, 197줄 추가/1,638줄 삭제였다. 미추적 파일은 이 통계에 포함되지 않는다. 특히 `frontend/app/page.tsx`의 큰 삭제는 [LiveApp 진입점](../../frontend-legacy/app/page.tsx)과 [분리된 컨트롤러](../../frontend-legacy/hooks/use-vestora.ts)를 함께 검토해야 한다. 변경량만으로 서비스 삭제나 전체 검증 완료를 판단하지 않는다. 이 목록은 커밋 허용 목록이 아니며, 생성 산출물이나 원본 아카이브를 전부 커밋하라는 뜻도 아니다.

## 구현 완료 범위

| 영역 | 반영된 동작 | 저장소 근거 | 검증 경계 |
| --- | --- | --- | --- |
| 기존 Next 앱 | 공통 토큰·UI, 마켓/자산/판매/지급/내역, 금액 계산 분리, 확인창과 pending 복구, 중첩 `4001` 거절 분류 | [디자인 시스템](../design-system/README.md), [완료 감사](../design-system/completion-audit.md), [금액 계산](../../frontend-legacy/lib/receivable-value.ts), [pending 저장](../../frontend-legacy/lib/pending-transaction.ts) | 대표 공개 화면·로컬 회귀 근거가 있으며 전체 연결 지갑·키보드·상태 행렬은 미완료 |
| 새 Vite UI | 마켓, 내 자산, 내 판매, 발행 지급, 개인 이력의 workspace 화면과 토큰별 회계 | [UI 통합 이력](../../frontend/docs/ui-integration.md), [workspace 모델](../../frontend/src/lib/workspace-model.ts) | 초기 샘플 검증과 이후 live 연동을 구분 |
| 실제 데이터 조회 | API projection 기준 금액·적용 시점, 계정별 이력·캐시 분리, 읽기 전용 주소 조회, 오류/지연/확인 불가 구분 | [조회 경계](../../frontend/docs/live-data.md), [snapshot hook](../../frontend/src/hooks/use-live-snapshot.ts), [API 매핑](../../frontend/src/lib/live-mapping.ts) | 조회 성공이 지갑 소유 증명이나 거래 성공은 아님 |
| 청구 | 원장 조건 재확인, simulation, 명시적 지갑 승인, 직접/래퍼 영수증 검증, 정확한 이벤트와 API 적용 후 완료 | [청구 실행](../../frontend/docs/claim-execution.md), [엔진](../../frontend/src/lib/claim-engine.ts), [체인 어댑터](../../frontend/src/lib/claim-chain.ts) | 과거 특정 청구의 확인 증거와 현재 B #3 실패를 구분 |
| 지급 생성 | exact-amount 토큰 승인과 전액 예치 생성을 별도 단계로 검토, 영수증 ID·지급 조건·API 적용 대조 | [지급 생성](../../frontend/docs/payment-creation.md), [엔진](../../frontend/src/lib/create-payment-engine.ts), [체인 어댑터](../../frontend/src/lib/create-payment-chain.ts) | 토큰 승인만으로 지급 생성 완료를 판정하지 않음 |
| 복구·중복 방지 | 계정/배포별 예약, Web Lock, 세션 변경 무효화, 저장 실패 시 미전송, 해시 복구, 모호한 전송 결과의 재전송 차단 | [예약 저장](../../frontend/src/lib/claim-storage.ts), [지갑 세션](../../frontend/src/lib/wallet-session.ts), [거래 안전성](../../frontend/src/lib/transaction-safety.ts) | 모의 지갑·로컬 상태 복구가 실제 확장 프로그램 전체 복구를 증명하지 않음 |
| 가스 안내 | 직접 RPC의 EIP-1559 최대 비용 추정과 잔액 대조, 지갑 단계 실패 진단 보존, 공통 검토 표시 | [가스 검토 UI](../../frontend/src/components/workspace/GasReview.tsx), [추정 범위](../../frontend/src/lib/transaction-safety.ts) | 지갑 래퍼 실행의 최종 최대 비용은 별도이며 자동 검증 미완료 |
| 금액·UI 보완 | 최소 raw 단위와 정밀 금액, 계정별 이름, 성공 알림 닫기 정책, 필터/정렬/보기 URL, Back/Forward·포커스, 빈 상태 구분 | [공통 UI](../../frontend/src/components/workspace/WorkspaceUI.tsx), [알림 정책](../../frontend/src/lib/notice-policy.ts), [마켓](../../frontend/src/pages/market/WorkspaceMarket.tsx) | pending/unknown 보호와 데이터 최신성 안내는 별도로 유지 |
| 마켓 최적화 | claims Map, 파생 행 memo, totals 재사용, 중복 포맷 제거, 전체 필터·정렬 후 40개씩 렌더링 | [마켓](../../frontend/src/pages/market/WorkspaceMarket.tsx), [금액 함수](../../frontend/src/lib/claim-math.ts) | 클라이언트 표시량만 제한하며 초기 API 요청량 감소는 미구현 |
| 백엔드 진단 | `LOCAL_API_SPANS=true`에서 요청 ID·RPC·snapshot·query·metrics cache 분기 계측, 기본 비활성 | [백엔드 설명](../../backend/README.md), [span 구현](../../backend/src/api/local-spans.ts), [회귀](../../backend/scripts/test-local-spans.mjs) | 로컬 계측이며 실DB/RPC 병목·운영 개선은 미확인 |
| 계약 경계 시험 | 자기 수취 원금 중복 방지, 1 raw/불균등 분배, 실제 블록 시각의 시작·종료 경계, 선청구 후 취소 보존 | [계약 테스트 diff 대상](../../test/ReceivableStream.ts) | 테스트 추가이며 컨트랙트 수정·재배포가 아님 |

새 Vite 앱의 live 구매·판매 등록·판매 취소·지급 취소는 계속 비활성이다. 기존 Next 앱의 연결 코드나 샘플 거래 시뮬레이션을 새 앱의 실거래 지원으로 합산하지 않는다.

## 과거 로컬 검증

아래는 해당 날짜와 범위의 기존 실행 기록을 옮긴 것이다. 현재 작업 트리나 실제 커밋 시점에 새로 통과한 결과가 아니다. 서로 다른 단계의 테스트 수를 누적 합산하지 않는다.

| 날짜·범위 | 기존 명령 또는 관측 | 당시 결과와 한계 |
| --- | --- | --- |
| 2026-10-18 기존 Next 앱 | 정책·금액·컨트롤러·pending 회귀, TypeScript, 대상 ESLint, production build | [기존 검증 문서](../design-system/verification.md)에 최종 31개 회귀 및 빌드 통과 기록. 연결 지갑·브라우저 전체 행렬 미완료 |
| 2026-10-19 초기 Vite UI | typecheck/lint/source audit/build, 11개 브라우저 확인 | [초기 검증](../../frontend/docs/verification.md). 당시 샘플/UI 범위이며 현재 코드 전체에 대한 결과가 아님 |
| 2026-10-20 래퍼 청구 복구 | `npm.cmd run check`, `npm.cmd run build:prod` | [청구 문서](../../frontend/docs/claim-execution.md)의 51개 회귀 및 빌드 통과. 과거 특정 해시를 읽어 복구했으며 새 전송 없음 |
| 2026-10-20 승인·지급 생성 연결 | `npm.cmd run check`, `npm.cmd run build:prod` | [생성 문서](../../frontend/docs/payment-creation.md)의 70개 회귀 및 빌드 통과. 당시 실제 생성 미완료는 이후 #4 관측과 구분 |
| 2026-10-23 로컬 최적화 단계 | `npm.cmd run check`, `npm.cmd run test:ui-performance`, `npm.cmd run qa:ui-typecheck` | 제품 회귀 145/145, QA 179/179, lint/typecheck/source audit 통과로 기존 로컬 보고서에 기록 |
| 2026-10-23 같은 로컬 최적화 단계 | `npm.cmd run qa:ui-build -- --emptyOutDir false`, `npm.cmd run build -- --emptyOutDir false` | QA·제품 빌드 성공 기록. 기존 산출물 보존, chunk 크기 및 의존성 주석 경고 잔존 |
| 2026-10-23 백엔드 span 단계 | `node --experimental-vm-modules --test backend/scripts/test-local-spans.mjs`, `corepack pnpm --dir backend typecheck`, `corepack pnpm --dir backend build` | 실제 Fastify.inject와 fake DB/RPC 12/12, 타입·빌드 성공 기록. listen/connect/fetch 차단 환경이며 실DB/RPC 검증 아님 |
| 2026-10-23 실제 G3 전후 QA 단계 | G3 정책·분석 회귀, `npm.cmd run test:ui-performance`, `npm.cmd run qa:ui-typecheck`, 전용 production build | G3 계획·분석 147/147, QA 180/180 및 타입·빌드 성공 기록. 앞선 QA 179개와 별도 단계이며 G3 성공 판정이 아님 |

위 단계별 실행 기록과 원문은 별도 로컬 보관 자료에 있다. 저장소에 없는 실행 로그를 상대 링크로 연결하지 않았다. 이번 커밋 대상에 대한 새 실행 결과는 [커밋 전 검증](checkpoint-verification-2026-10-23.md)과 구별한다.

## 실환경 확인과 미확인

| 시점 | 실제 확인 범위 | 완료로 확대할 수 없는 범위 |
| --- | --- | --- |
| 2026-10-20 | 사용자가 이전에 승인한 특정 래퍼 청구의 영수증·정확한 이벤트·API 적용을 읽어 UI 완료 복구. 수취액 3.066667 MockUSDC | 모든 지갑·모든 계정의 청구 성공, 현재 B #3 성공 |
| 2026-10-22 22:22 KST | 사용자 승인·생성으로 Sepolia 지급 #4 발행. A→B 1 MockUSDC, 10분, 취소 불가 조건의 StreamCreated·예치·NFT owner B·API 적용·A 지급 관리/B 주소 조회 대조 | 실제 B 지갑 연결 후 수취·청구 완료, 자동 생성 |
| 2026-10-22 23:04 KST 이후 | #4의 종료 후 청구 가능 1/미발생 0/owner B 관측 | 모든 과거 시점의 historical eth_call 또는 연속 실시간 관측 |
| 2026-10-23 | 승인된 G1 진단, G2 API 부하, G3 실제 API→로컬 화면 일부 측정 | 배포된 새 UI 검증, 전체 성능 목표 통과, 신규 지갑 거래 |

**B #3 hashless 차단을 유지한다.** 실제 지갑 단계의 가스 비용 오류 이후 해시 없는 요청이 남았고, 이를 미전송 확정으로 바꾸거나 예약을 삭제하지 않았다. 다른 지급의 생성 성공, 읽기 전용 원장 조회, 과거 특정 청구 성공, nonce 관측만으로 이 요청의 부재나 안전한 재전송을 증명할 수 없다.

## 100개 수동 시나리오의 현재 경계

파일명 집중 검색으로 찾은 별도 로컬 수동 결과 원장의 최신 ID별 표 100행을 대조했다. 문서명은 2026-10-22 기준이지만 10월 23일 후속 관측이 포함돼 있다. 아래는 기존 원장 집계이며 이번 정리에서 재시험하거나 판정을 올리지 않았다.

| 원장 판정 | ID 수 | 해석 |
| --- | ---: | --- |
| UI 통과 | 63 | 모의/격리 UI와 실제 조회·거래 관측이 섞여 있으므로 행별 범위 확인 필요 |
| UI+UNIT 통과 | 3 | UI와 모델 경계 시험을 함께 확인한 ID |
| UNIT 전용 통과 | 12 | 모델 또는 로컬 EVM 시험. 수동 UI 완료 수에 더하지 않음 |
| 부분 | 7 | F16/F18/F19/F23/B24/B29/E27의 잔여 실제 지갑·조합·복구 범위 |
| 실패 | 1 | F17, 실제 B #3 지갑 단계 가스 오류 및 hashless 차단 |
| 후속 성능 | 8 | P01~P08, 일부 예비 실행과 미실행이 섞임. 이후 G2/G3도 전체 통과 아님 |
| 기능 미연결 보류 | 6 | D01~D06, 실제 기능 연결·계약 정책 대조 후 시험 필요 |

합계 100개이며 UI 관측이 있는 ID는 74개다. **100개 수동 테스트 완료 또는 74개 실환경 통과가 아니다.** 같은 원장의 초기 집계, 초기 '실환경 부하 미실행' 문구, 이후 G2/G3 실행 기록을 한 시점의 상태로 섞지 않는다.

- 실환경: F13~F15는 실제 승인·#4 생성 근거가 있다. F16은 B 주소 조회까지여서 부분이고 F17~F19의 실제 B 청구 성공은 미완료다.
- 모의/격리: 영수증 변조, 두 탭 경합, provider 거절, 계정 전환, 저장 실패, 최소 단위, timeout·RPC 장애 주입을 포함한다. 격리 sendCount는 실제 Sepolia 거래 수가 아니다.
- B29는 사용자 실제 200% 확대 확인을 포함하지만 모든 경고·큰 금액·내역 조합은 미검증이다. E27도 전체 Chrome 재시작 후 격리 hashless 유지 관측을 포함하며 OS 전원 중단·실제 확장 복구는 미검증이다.

## 남은 작업과 문서 정합성

1. B #3의 지갑 활동·실제 해시 및 지갑 최종 최대 비용을 확인하고 사용자 결정에 따라 복구를 진행해야 한다. 기존 예약 삭제·자동 재전송은 허용하지 않는다.
2. 새 앱의 미연결 거래 기능, 실제 B 연결·청구 완료, 남은 수동 시나리오와 전체 접근성·반응형 조합을 검증해야 한다.
3. G1 과거 pending 원인, G2 미달 원인 분해, G3 신선도/표본/브라우저 frame 문제는 [성능 문서](performance-status-2026-10-23.md)의 미완료로 유지한다.
4. 이번 체크포인트에서 루트와 Vite 앱 README 및 handoff를 현재 상태로 갱신했다. UI/조회/청구/생성의 날짜별 문서에는 각 단계의 '샘플 전용', '서명 없음', '청구만 지원', '실제 생성 미완료'가 남아 있으므로 이력으로 읽는다. 초기 문서 전체가 최신 상태라고 간주하지 않는다.
5. 과거 대형 chunk 경고와 의존성 취약점 보고의 현재 상태는 새로 검사하지 않았다. 과거 경고가 해결됐다고 쓰지 않는다.
6. 커밋 전 포함 파일, 빌드 출력 제외, 비밀정보 패턴·원본 아카이브·링크·diff 검사와 관련 테스트를 [검증 기록](checkpoint-verification-2026-10-23.md)에 남긴다. 커밋 ID는 실제 Git 기록을 기준으로 확인한다. 이 체크포인트는 push·프런트엔드 이동·배포 또는 새 Vercel 프로젝트 생성의 증거가 아니다.

## 근거 보관 원칙

이 문서의 링크는 저장소의 코드·문서와 함께 반영할 동반 보고서만 가리킨다. 과거 로컬 최적화 보고서, 수동 100개 원장, 성능 상태 v12, G1/G2/G3 실행 결과, 원문 JSON·자원 감사는 별도 로컬에 보존돼 있다. 외부 제공 시에는 필요한 최소 요약을 별도 검토한다. 비밀정보, API 키, 승인 값 원문, 개인 절대경로와 원시 대용량 로그는 이 문서에 포함하지 않는다.
