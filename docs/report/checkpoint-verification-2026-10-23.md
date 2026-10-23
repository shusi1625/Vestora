# 커밋 전 검증 기록 (2026-10-23)

## 범위

사용자 요청에 따라 `Vestora` 소스 저장소의 기존 미커밋 코드와 문서를 정리했다. [개발 진행](development-progress-2026-10-23.md)과 [성능 상태](performance-status-2026-10-23.md)는 과거 결과를 구분해 요약하며, 아래 표는 이번 체크포인트에서 실제로 다시 실행한 로컬 검사다.

프론트엔드 이동·새 Vercel 프로젝트·배포·push는 실행하지 않았다. AWS/운영 DB 조회·변경, 실제 API 부하, 지갑 서명·체인 거래, 미확정 기록 초기화도 없다. 컨트랙트 회귀는 명시적으로 로컬 `hardhatMainnet` EDR 시뮬레이션만 사용했다.

## 새 로컬 실행 결과

| 작업 위치 | 실행 명령 | 결과 |
| --- | --- | --- |
| 루트 | `npm run contracts:test -- --network hardhatMainnet` | 56/56 통과. 자기 수취·raw 최소 단위·시간 경계·선청구 후 취소 보존 포함 |
| `backend` | `npm run typecheck` / `npm run build` | 모두 성공 |
| 루트 | `node --experimental-vm-modules --test backend/scripts/test-local-spans.mjs` | 12/12 통과. 실제 Fastify.inject와 fake DB/RPC의 격리 회귀 |
| 루트 | `node --test frontend/tests/*.test.mjs` | 31/31 통과. 테스트 lint 정리 후 다시 실행 |
| `frontend` | `npm run lint` | 테스트 한정 수정 후 성공 |
| `frontend` | `npm run build` | Next production 빌드·TypeScript 성공. `/`, `/_not-found`, `/design-system` 생성 |
| `frontend-sample` | `npm run check` | lint·앱/Vite 타입·145/145 모델 회귀·소스 import 감사 성공 |
| `frontend-sample` | `npm run test:load-safety` | loader 호환 수정 후 32/32 통과. 실제 upstream 부하 없음 |
| `frontend-sample` | `npm run test:ui-performance` | 180/180 통과. 실제 사용자·지갑 성능 합격의 뜻은 아님 |
| `frontend-sample` | `npm run qa:ui-typecheck` | 성공 |
| `frontend-sample` | `npm run build:prod -- --emptyOutDir false` | 일반 production 빌드 성공. 과거 로컬 출력 파일을 지우지 않음 |

테스트 수는 서로 다른 계층의 실행 수다. 수동 시나리오 통과 수나 실환경 거래 수로 환산하지 않는다. G3 계획/분석 147개 및 과거 실환경 결과는 이 표에 새 실행으로 합산하지 않았다.

## 검사 중 발견해 정리한 항목

1. 부하 안전성 테스트의 독립 검증기가 `@/lib/ui-measurement` import를 알지 못해 최초 실행에서 모듈 로딩에 실패했다. [검증기](../../frontend-sample/tests/performance/api-contract.mjs)에 해당 정확한 별칭 하나만 허용하고 실제 비활성 제품 모듈을 로드하도록 수정했다. 다른 예상 밖 의존성 거부, schema/계정/chain/금액 검사는 유지했다. 최초 실패 로그도 로컬에 보존했다.
2. 기존 Next 전체 lint는 CommonJS 브라우저 테스트와 VM 테스트의 로컬 변수명 때문에 실패했다. [ESLint 설정](../../frontend/eslint.config.mjs)은 `tests/*.cjs`에서만 `no-require-imports`를 해제했다. [VM 테스트](../../frontend/tests/live-controller.test.mjs)는 `module` 변수명을 바꾸고 미사용 import를 제거했다. 제품 규칙이나 거래 동작은 완화하지 않았다.
3. `frontend-sample/.gitignore`에 QA build 출력과 `.vercel`을 추가했다. 출력 파일은 삭제하지 않고 커밋 후보에서 제외했다.
4. 루트/Vite README 및 handoff를 현재 두 프론트엔드 공존 상태, 실데이터 실행 경계, 미완료 성능, 배포 보류에 맞게 갱신했다.
5. 최초 staged 공백 검사에서 발견한 수집 문서의 줄 끝 공백과 UI 파일의 마지막 빈 줄만 정리했다. 원본 ZIP은 바꾸지 않았고 source audit를 다시 생성해 101개 수집 파일·131개 소스·누락 import 0을 확인했다.

## 포함·제외와 사전 검사

- 포함: 기존 Next 개편, 별도 Vite UI와 원본 수집 provenance, 지갑·청구·생성·복구 코드, 일반/수동/부하/UI QA 소스, backend local spans, 계약 경계 테스트, 디자인 시스템 및 체크포인트 문서.
- 원본 소스 ZIP과 샘플 화면 캡처는 수집 provenance로 포함한다. ZIP은 137,169 bytes, 103 entries이며 본문 코드 101개와 디렉터리 항목을 구별한다.
- 제외/로컬 유지: 실제 `.env`·키·의존성, `.next`·`dist`·QA build 출력, CLI 인증 파일, 실제 승인 원문과 소비 nonce, 대형 실험 원문·로그 및 planning 작업 폴더. 삭제하지 않았다.
- 변경/미추적 텍스트의 AWS key·private key·GitHub token 등 특정 패턴과 credential 파일명을 검사했다. 원본 ZIP 내부 이름/텍스트도 별도로 검사했으며 발견 사항은 없었다. 패턴 검사만으로 모든 비밀정보 부재나 보안 완료를 보장하지 않는다.
- staged diff의 공백·변경 범위, 새 문서의 로컬 링크와 포함 파일을 커밋 직전에 확인한다. 개별 커밋과 최종 작업 트리는 실제 Git 기록이 기준이다.

검증 로그와 전체 후보 파일 hash 목록은 별도 로컬에 보존한다. [근거 hash 목록](checkpoint-evidence-2026-10-23.json)은 필요한 원문과 이번 검사 로그의 파일명·SHA-256만 남긴다. 저장소 밖 개인 절대경로로 링크하지 않으며, 운영 원문을 저장소에 포함한 것처럼 표현하지 않는다.

## 로컬 커밋 구분

- `923c2fd`: 두 프론트엔드, 디자인 시스템, 실데이터·지갑 흐름과 격리 QA 소스 보존. 244개 파일.
- `0cd3ed8`: 기본 비활성 backend request span과 로컬 settlement 경계 회귀. 10개 파일.
- 이 검증/개발/성능 보고서 및 README·handoff는 후속 문서 커밋으로 구별한다. 해당 커밋 ID는 Git 기록을 기준으로 확인한다.

기존 사용자 작업을 되돌리지 않았고 위 두 소스 커밋 모두 staged 공백 검사를 통과했다. build/QA 출력과 실제 환경 파일은 포함하지 않았다. 커밋은 로컬 보관이며 push나 배포의 증거가 아니다.

## 남은 제약

- 일반 Vite bundle에 500kB 초과 chunk 경고가 남아 있다. 이번 출력의 큰 JS는 약 1.207MB, gzip 약 367.64kB다. Zod annotation 경고도 관측됐다.
- Node VM Modules/모듈 형식 관련 진단은 테스트 환경 경고이며 실제 지갑 E2E 검증을 대체하지 않는다.
- 의존성 취약점 데이터베이스를 새로 조회하거나 운영 DB/RPC를 재시험하지 않았다. 컨트랙트 루트의 전역 TypeScript 검사는 실행하지 않았고, Hardhat 로컬 테스트·각 앱의 타입/빌드를 구분한다.
- 현재 UI에 대한 새 브라우저 전체 행렬, 실제 지갑 승인, B #3 복구, G1 원인 규명, G2/G3 완료, 프론트 promotion과 Vercel 배포는 미완료다.
- 다음 단계는 커밋된 체크포인트에서 배포 전환 작업을 별도로 재개하는 것이다. 새 도메인의 pending 보호, HTTPS API 중계, SPA deep link, QA 출력 제외를 먼저 다룬다.
