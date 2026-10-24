# Frontend Parity Release, 2026-10-24

## Release Result

The user requested: skip the remaining local matrix and redeploy the frontend first. The matrix remains **INCOMPLETE**, not passed. This separately authorized release is complete; the broader QA Goal is still active.

| Item | Observed result |
| --- | --- |
| Existing project | `shusi1625s-projects/vestora` |
| Production | https://vestora-alpha.vercel.app/market |
| Deployment | `dpl_3maxBhcQspcZUaTSrpuQgbei2YyL` |
| Immutable URL | https://vestora-7o7vy0z8h-shusi1625s-projects.vercel.app |
| READY observation | 2026-10-23T20:10:18.977Z, 2026-10-24 05:10:18 KST |
| Previous release | `dpl_45AszhS4a5i3Vx8hSBhTkcjVHQHB`; retained, no rollback performed |
| Build | Vite, `npm ci`, `npm run build:prod`, Node22.x configuration; Sydney `api/read` function |
| Product JS | `index-BiUzrgH2.js`; anonymous downloaded bytes exactly match the local build |
| Source | Current local working copy; not a new Git commit or push |

Included: MockUSDC self-mint; separate individual-NFT approval/list/unlist; exact payment-token approval and protected buy; issuer cancellation with listed-payment risk disclosure; direct ID/detail routes; shared pending guards; bounded browser-local transaction diagnostics; personal-history reliability and journal/accounting provenance fixes. Absolute-time `createStream` and immediate pre-wallet time rechecks remain. See the [implementation report](./feature-parity-2026-10-24.md).

No Vercel environment variables, AWS resources/services, database, indexer or contracts were changed. No new wallet-permission prompt, signature or transaction, live load run, pending cleanup, B#3 hold release, commit or push occurred. Existing API-proxy configuration was reused; ordinary connected-account reads continued in the app.

## Preflight And Hosting Evidence

- Fresh local `npm.cmd run check` passed lint/types,473 UI/model tests,8 deployment tests and source audit. Load-safety32/32, UI-performance regression180/180, QA typecheck and production build passed. These are local Node24.19.0 results, not new live load measurements or a Node22 full test run.
- SHA256s of167 selected product/build files were captured and rechecked before uploading. Anonymous production JS bytes matched the local output. Vercel's Node22-configured build also succeeded with the same asset name.
- First local PowerShell wrapper treated a native stderr annotation warning as a terminating error. Its partial log was retained; the logging wrapper was corrected, then the complete command sequence was rerun successfully. No product-source workaround was made.
- Existing Zod annotation warnings and the1310.32kB/gzip391.13kB main-chunk warning remain. No dependency upgrade or warning suppression was applied.
- Two serial pre-release API GETs returned200 with5 real streams. The observed projection was applied, indexed=projected11978946 and lag1; this is a dated observation, not continuous freshness proof.

## Anonymous Post-Release Smoke

Exactly16 serial GETs, at most1/s, no retry,10s/request,6MiB total cap; actual body total1415648bytes. No direct RPC or wallet access in this script.

- Seven SPA deep links returned200 with the expected bundle: market, assets, sales, issued, create, transactions and `/claims/5`.
- API health, streams and #5 detail returned200 JSON with no-store. List:5 streams, synced/applied, indexed=projected11978969, lag0 at that observation.
- Three QA/archive paths returned404. Public `/vestora-api/metrics` returned404 JSON.
- Product JS returned200 and exact local SHA256 equality. The Korean locale returned200 with1128 keys and exact parsed-content equality.

## Actual Chrome Observations

The existing C account was retained. The old app was showing a pre-wallet #5 review; reload discarded only that read-only view, not a pending transaction. No account-permission change, condition-check or transaction command was invoked.

- New bundle and updated live-action banner were visible. C assets: wallet0, remaining1, claimable1 MockUSDC; #5 direct acquisition and personal claimed0.
- #5 detail exposes claim-condition review and the new sale-registration form. No quote/wallet button was pressed.
- Market card/list switching rendered. The only current listing is #2, price4, remaining0; disabled purchase is the correct data-dependent result, not an unconnected-feature gate.
- C sales, issued and history rendered their empty states. This does not validate populated issuer/seller/history variants.
- Desktop2560x1257 and temporary mobile390x844 observations showed no whole-page horizontal overflow or nested buttons. Mobile detail stayed at x16..374 and was vertically scrollable. The viewport override was reset; this is not physical-device or real200% zoom proof.
- Captured console has no error entries in the observed release interval, but retains MetaMask content-script listener/orphan-stream warnings and one React Router empty-leaf warning at `/manage/issued`. The parent page visibly rendered; the warning was not suppressed or called a successful populated-page test.
- Existing stale/lagging notices remained visible when appropriate; a later synced refresh removed the transient warning without manual dismissal.

## Evidence And Remaining Work

Planning artifacts: `work/parity-release-2026-10-24/` contains the source manifest, local logs, previous-release record, deployment/build logs, inspect JSON, release summary and pre/post smoke JSON.

Browser artifacts: `C:/Users/AAAAA/.codex/visualizations/2026/08/26/01a03f12-2ef4-76b2-a500-d626b17f045e/goal-qa-2026-10-23/parity-release-2026-10-24/` contains11 DOM/screenshot observations and `browser-smoke.json`. Earlier partial native-form observations were preserved as `feature-parity-2026-10-24/boundary-client-partial-before-release.json` with INCOMPLETE status.

The [40-case ledger](./deployed-qa-ledger-2026-10-23.json) and [dated100-case crosswalk](./deployed-qa-completion-audit-2026-10-24.md) are not promoted by release success. They retain their historical statuses and input hashes. Remaining: skipped boundary combinations, actual wallet account/network/revoke/restart tests, real zoom/devices, positive signed market/cancel/mint lifecycles, C final claim/accounting and separately authorized replacement timing cohort. B#3 remains held. Original G1/G2/G3 performance completion is unchanged.
