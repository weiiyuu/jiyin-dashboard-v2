# Build Log

> Stage 3 implementation record. No enterprise API calls or remote pushes are permitted in this run.

## Stage 0 — Safe initialization

- Status: Complete
- Main changes: Added private-data ignore rules; added reviewed API meta, refresh, and monthly coverage corrections; initialized local dev branch and configured the provided origin
- Tests: Git root verified as jiyin-dashboard-v2; ignore probes passed for enterprise JSON/XLSX, .env, SQLite, logs, build output, and OS files; planned tracked-file list contains no reference inputs
- Commit: e4521aa
- Open issues: None
- Next: Initialize the application skeleton and early Compose smoke setup

## Stage 1 — Project skeleton and base environment

- Status: Complete
- Main changes: Next.js 16/React 19/TypeScript strict skeleton; shared API response/status/time contracts; 30-second local refresh hook; server-only collector idle entrypoint; pinned Node 24.22.3 Docker development image; localhost-only web port and shared named volume
- Tests: `npm run typecheck` passed; `npm test` passed (7 tests); `npm run lint` passed; `npm run build` passed with webpack; production dependency audit reported 0 vulnerabilities; Compose config passed; web and collector became healthy on Node v24.22.3 and cross-read/wrote temporary volume markers
- Commit: 55e47a2
- Open issues: Turbopack production build cannot bind its internal helper port in the managed sandbox, so the reproducible build script uses webpack. Development dependencies report low/moderate audit findings in the ESLint toolchain; production dependency audit is clean.
- Next: Implement versioned SQLite schema, repositories, and concurrency/integrity tests

## Stage 2 — SQLite, migrations, and repositories

- Status: Complete
- Main changes: Versioned initial migration with all 16 approved STRICT tables, indexes and seeds; per-connection foreign keys/WAL/busy timeout; transaction helper; settings, poll, active-history and backup repositories; compare-before-write mode protection
- Tests: `npm run typecheck`, `npm run lint`, and `npm run build` passed; `npm test` passed 16 tests covering empty/idempotent migration, checksum/failure rollback, STRICT, foreign keys, partial unique active date, application rollback, WAL reader/writer behavior, competing immediate writers, backup/reopen, query plan, mode revision discard, and MANUAL_TEST separation
- Commit: b64b5fa
- Open issues: None
- Next: Implement the Excel preview/confirm/version transaction backend with synthetic fixtures

## Stage 3 — Excel import backend

- Status: Complete
- Main changes: XLSX ZIP preflight limits and unsafe-content rejection; six-sheet/header parser; typed numeric/exception preservation; quality eligibility and issue codes; preview/confirm/list/detail/activate routes; file/canonical fingerprints; duplicate/conflict/replacement/rollback and Alarm regression transaction rules
- Tests: Full suite passed 24 tests; synthetic tests cover empty quality_issues, NULL vs 0/Await, 24:00, duplicate business keys, missing vs provided-empty Alarm, formula/external-link/cell-count rejection, duplicate zero writes, explicit replacement, rollback, and injected failure rollback. Local-only private workbook contract and real temp-DB confirm passed at 3840/3840/11/0 rows; no private data was copied or tracked. Typecheck, lint, and production build passed.
- Commit: a82a27f
- Open issues: Formula and external-link policy is intentionally strict per approved v1 contract. The route layer currently returns safe rule codes/messages but has no upload UI in this authorization scope.
- Next: Implement historical-statistics pure functions and hand-verifiable fixtures

## Stage 4 — Historical statistics

- Status: Complete
- Main changes: Pure Green/state-hour aggregation, six-state sum-then-divide shares, 30/60-minute and daily buckets, independent period alignment/availability, selected-machine coverage, monthly expected intervals, continuous Red/Yellow runs, and pure-Green to pure-Yellow/mixed completion candidates
- Tests: Final suite passed 35 tests across 7 files. Hand-verifiable cases cover NULL vs 0, zero denominator, 180/90-second Green totals, six-state 90/45/45 shares, quality-rule mismatch, 30/60/day buckets, February/March 26,880/29,760 expected intervals for two machines, missing vs not-applicable positions, cross-midnight Red runs, adjacency gaps, and completion candidates. Typecheck, lint, build, and production dependency audit all passed.
- Commit: ab51351
- Open issues: No full historical HTTP query routes or visualization pages were added; those belong to the next authorized UI/API slice.
- Next: Review Stage 3 results, then authorize historical route handlers and the Stage 5 UI vertical slice if desired

## Stage 3.1 — Corrective implementation and formal acceptance

- Status: Complete
- Main changes: Strengthened standardized Excel date/time/identity/dictionary/formula/quality validation while preserving source values; added preview duplicate/conflict/active-batch decisions and confirm/activate compare-and-swap checks; expanded replacement fault injection across every write/activation stage; enforced LIVE-only reading persistence and failed empty collections; made unavailable statistics nullable; added active-batch processing/event services and canonical history/import routes; added localhost same-origin checks, upload limits, fingerprint revalidation, and safe import error mapping.
- Tests: Added regression tests before fixes, then passed `npm test` (55 tests across 9 files), including synthetic content mapping, 24:00, NULL/0/Await/negative values, semantic dictionary checks, all replacement transaction stages, active-version changes, LIVE/DEMO protection, active-only ranking/trend/state share/coverage, day/week/month comparison, Alarm source coverage and replaced-row exclusion. The optional local private workbook test also passed at 3840/3840/11/0 and now verifies a persisted source row plus an independently calculated active A1 Green total, not row counts alone. `npm run typecheck`, `npm run lint`, and `npm run build` passed.
- Commit: 49cd0a7
- Open issues: Enterprise Collector transport/schema behavior, complete Live Sensor integration, and production Docker deployment/operational validation remain intentionally assigned to Stages 6–8. They do not block Stage 5 historical/import UI work.
- Next: Begin Stage 5 UI only after the user reviews `docs/STAGE3_1_ACCEPTANCE.md`.

## Stage 5 — Historical analysis and Excel import UI

- Status: Complete
- Main changes: Added the operational Excel import, historical processing, and event-analysis pages on the existing import/history APIs; added shared responsive navigation, filters, cards, charts, tables, and loading/error/empty states; added explicit Stage 6/7 deferred pages with no fake data. Fixed the localhost mutation boundary discovered by browser testing so Next.js internal `0.0.0.0` URLs validate the actual loopback Host while still requiring an exact same-origin Origin.
- Legacy UI migration: Directly reused the legacy Brand structure and SVG Icon pattern. Selectively adapted the shell/sidebar/topbar/breadcrumb/footer and mobile-toggle structure. Reimplemented navigation, cards, charts, page states, and all business/data UI against v2 contracts. Used the burgundy/glass treatment only as a visual reference. No legacy API, SQLite, Excel, fake-data, or 3D code was copied.
- Tests: `npm run typecheck`, `npm run lint`, `npm test` (61 tests across 11 files), and `npm run build` with Webpack passed. Browser validation with public synthetic XLSX passed two-file selection, removal, Preview, Confirm, Active Batch display, and post-import local history queries. Route tests passed Preview zero-write, replacement, rollback activation, active-history refresh, and Alarm missing-versus-empty semantics. Native date-field automation did not reliably trigger React events, so full chart click-through remains a documented manual smoke check rather than a claimed browser pass.
- Commit: 4e2bfd9
- Open issues: No blocking Stage 5 data or contract issue. A short human check of range/day/week/month chart presentation, conflict copy, rollback prompt, and Alarm-source messages is recommended on the target laptop. Stage 6 Collector, Stage 7 live pages, and later production deployment remain intentionally deferred.
- Next: Stop for final Stage 5 review; do not begin Stage 6 without authorization.

## Stage 5.1 — Concentrated corrections and formal acceptance

- Status: Complete for repository/synthetic scope; original private 2025-06-03 workbook remains an explicit human recheck because it was not present locally.
- Main changes: Converted missing required Excel values from uncaught exceptions into blocking per-file validation issues; isolated mixed multi-file Preview failures; documented/enforced 8-file, 25 MiB/file, 50 MiB/request, 100 MiB expanded, and 250,000-cell limits; added grouped import warnings, version overview/filter/pagination, formal per-machine SVG charts, per-machine/aggregate six-state views, comparison deltas, Chinese event modes/table/detail, unified lamp runs, legacy-style no-Sidebar home, and 20–24 px responsive spacing.
- API compatibility: `/api/history/processing` retains aggregate `trend`/`stateShare` and adds `seriesByMachine`/`stateShareByMachine`. Alarm rows add source event/row identifiers for expandable detail. No statistical formula, denominator, quality meaning, schema, or write transaction was changed.
- Tests: `npm run typecheck`, `npm run lint`, `npm test -- --reporter=dot` (69 tests across 11 files), and `npm run build` with Webpack passed. Added failing-first HTTP 500 regression, mixed valid/invalid Preview, 1/2/4/8 Preview+Confirm, per-machine/all-zero history, formal-axis/Tooltip component checks, and Alarm detail fields. Existing migration, rollback, version consistency, 24:00, NULL/0, quality, and statistics tests remain green.
- Browser: Real localhost production-build checks used only `/private/tmp` synthetic XLSX/SQLite. Passed 8/2/1-machine, valid zero, 30-minute/cross-day, day/week/month comparison, per-machine/aggregate six-state, alert source distinctions, zero-result pagination, lamp filters, 4-select/remove/3-preview/confirm, duplicate/invalid/conflict, replacement/rollback, 0/1/4/8 file-list layout, and 1280/1366/1440 no-overflow checks. Browser console showed no final warnings/errors.
- Legacy UI migration: Continued selective use of Brand/Icon structure and burgundy/glass visual language. Home lobby composition was adapted from the read-only legacy landing page. No legacy API, SQLite, Excel, fake-data, or 3D code was copied.
- Commit: `9c63234` (implementation); acceptance documentation follows in the local history.
- Open issues: Re-run the unavailable original private 2025-06-03 workbook on the target laptop; optional typography taste check. Stage 6 Collector, Stage 7 live pages, enterprise API, deployment, and push remain out of scope.
- Next: Stop after Stage 5.1 review. Do not begin Stage 6/7 without explicit authorization.

## Stage 5.2 — Excel data quality, migration, import UX, and performance

- Status: Complete for repository, public synthetic-data, migration, transaction, performance, and browser scopes. The unavailable complete private 2025-06-01–06-05 workbook set remains an explicit local human recheck.
- Main changes: Added K/M/O field handling, nullable source preservation, metric-specific eligibility, `jiyin-quality-v2`, INFO/WARNING/SEVERE/blocking issue levels, grouped quality summaries, arrival-versus-valid counts, source-confirmed severe three-minute exclusion, and nullable Alarm descriptions. Added transactional schema migration v2 while preserving batch/version relationships and rollback behavior.
- Import UI: Replaced large Preview cards with batch summary, compact expandable per-file results, Chinese grouped explanations, bounded scrolling, quality eligibility details, 24px section spacing, natural-height top cards, client limit messages, and whole-batch loading protection. Duplicate, conflict, replacement, active-version-change, Confirm, rollback, and Preview zero-write semantics remain unchanged.
- Tests: `npm run typecheck`, `npm run lint`, `npm test -- --reporter=dot` (77 passed; opt-in performance suite skipped), and `npm run build` with Webpack passed. `npm run measure:stage5.2` passed 1/2/4/8 full-day synthetic workbooks at 905.5/1,732.5/3,520.4/9,475.2 ms with HTTP 200 and zero Preview database writes.
- Browser: Production localhost checks with disposable `/private/tmp` synthetic data passed no-file, nullable warning, Confirm, duplicate, mixed new/duplicate/invalid, and eight-file Preview flows. The eight-result list used a 460px internal viewport; 1280/1366/1440px had no page-level horizontal overflow and the final console contained no warnings/errors.
- Data safety: No NULL was converted to zero, no abnormal seconds were rewritten, no AI/interpolation was used, no private workbook or enterprise endpoint was accessed, and no database/volume was deleted. Sensitive-file/credential-pattern and ignore-rule checks passed.
- Commit: `dca36b7` (implementation); acceptance documentation follows in local history.
- Open issues: Exact original private five-day workbook verification remains unclaimed; row-level quarantine is intentionally unsupported and critical unidentifiable rows block their file; RSS samples are cumulative-process observations rather than isolated-process deltas; team-owned history/event visual design remains outside this stage.
- Next: Stop after Stage 5.2 review. Do not start Stage 6/7 or push without explicit authorization.

## Stage 5.2 — Excel import UI final correction

- Status: Complete for repository, production build, public synthetic-data, and real-browser scopes.
- Main changes: Replaced the two-column selection/rules cards with one full-width operation card and collapsed rules disclosure; converted Preview into a fixed batch summary plus one-row-per-file expandable list; bounded selected/Preview/detail scrolling; preserved all existing import, quality, replacement, and transaction semantics.
- Version history: Added backward-compatible SQLite-side source-date/import-time sorting, date/filename filters, 10/20/50 pagination, total/page metadata, deterministic same-day version labels, and active-batch IDs for rollback. Removed global Batch ID from the primary table and retained it in expanded details.
- Tests: `npm run typecheck`, `npm run lint`, `npm test -- --reporter=dot` (79 passed, 1 opt-in performance test skipped), and `npm run build` with Webpack passed. New tests cover 21-row complete-result sorting/filtering/pagination and the paginated HTTP contract.
- Browser: Production localhost QA used a disposable 21-version SQLite database and synthetic Excel only. 1366px no-Preview, five-file Preview, and post-Confirm screenshots were captured. All required adjacent section gaps measured exactly 24px. Eight-file mixed Preview used 360px selected-list and 460px result-list internal scrolling. Source-date/import-time sorting, date/filename queries, page 2, and 10/20/50 page sizes were operated successfully. 1280/1366/1440 had no page-level horizontal overflow.
- Commit: `8bf40f5` (implementation); acceptance documentation follows in local history.
- Safety: No enterprise file, database, credential, API call, push, deployment, Stage 6/7 work, or destructive operation occurred. User-reported real 2025-06-01–06-05 import success was not reproduced with private binaries in this run.
- Next: Stop for final Excel UI review. Do not start another stage without explicit authorization.

## Stage 5.3 — Machine Operation Analysis V1.1

- Status: Complete for implementation, public synthetic-data statistics, automated regression, and real desktop-browser scopes. Enterprise/private-data validation was intentionally not performed.
- Main changes: Renamed the page to 機台運轉分析; made machine selection explicit and empty by default; added range and day/week/month comparison modes; implemented full-width ranking, per-machine/period trend, and Green/Yellow/Red share charts in the approved order; added local highlight, legend, aggregate/single-machine, and per-machine/aggregate controls without mutating global filters.
- Statistics/API: Added independent three-state eligibility and denominator rules, point-level COMPLETE/PARTIAL/MISSING coverage, fixed 24-hour day comparison, arbitrary seven-day weeks, 31-position month alignment, full-calendar-day monthly averages, partial-month metadata, backend differences/relative rates, and percentage-point deltas. Legacy six-state fields and Active Batch queries remain available and unchanged.
- Tests: `npm run typecheck`, `npm run lint`, `npm test -- --run` (91 passed; one opt-in private-workbook suite skipped), and `npm run build` with Webpack passed. H01–H20 evidence covers empty selection, 30/60 invariance, missing dates, local interactions, mode reset, day/week/month alignment, partial months, valid zero, NULL/severe quality exclusion, partial machine coverage, zero baseline, and Active Batch replacement/rollback.
- Browser: Chrome production-build acceptance used a disposable 16-date/61,440-row public synthetic SQLite database. 1366px screenshots capture empty, eight-machine range, and eight-machine comparison states. DOM measurements at 1280/1366/1440 found viewport width equal to scroll width and no chart overflow. Eight-machine comparison rendered 16 A/B share bars. Evidence is under `docs/evidence/stage5_3/`.
- Commit: `e759409` (implementation); acceptance documentation follows in local history.
- Safety: `_reference_inputs/` remained ignored/read-only; no enterprise API/file, environment file, database, credential, push, deployment, Stage 6/7 work, destructive Git operation, or data/volume deletion occurred.
- Open issues: Real enterprise-data validation remains unclaimed by design. The existing standalone-output warning belongs to later production deployment validation, not this UI/statistics acceptance.
- Next: Stop for Stage 5.3 review. Do not begin Stage 6/7 or push without explicit authorization.

## Stage 5.3 — UAT Round 1 Visual Final V2.0

- Status: Program implementation, automated regression, and public-synthetic real-browser validation complete; user visual UAT remains pending and is not claimed as passed.
- Main changes: Rebuilt all six chart structures to the approved V2.0 names and visual hierarchy. Range ranking now uses solid shared-scale hour bars and human duration labels; range trend uses adaptive time/date axes, mouse/keyboard shared Tooltip, and legend focus/hide without jitter; range share is one full-width multi-row/aggregate chart. Comparison uses paired A/B bars, adaptive day/week/month two-line trends, full-width A/B three-state rows, and compact coverage details.
- Visual baseline: Opened and inspected all nine ignored/read-only `stage5_3` reference images. Recorded the old-to-final gaps in `STAGE5_3_UAT_ROUND1_VISUAL_GAP_CHECK.md`; V2.0 titles, axes, labels, units, and interactions take precedence over the superseded visual spec.
- Tests: `npm run typecheck`, `npm run lint`, `npm test` (97 passed, 1 private-workbook opt-in skipped), and `npm run build` with Webpack passed. Added unit/component coverage for dynamic zero-based nice scales, time/date ticks, time-minute labels, solid ranking bars, one-chart multi-row shares, and operable overlap readout. Existing H01–H20 statistics/quality/Active-Batch regressions remained green.
- Browser: Production localhost Chrome used a disposable 16-date public synthetic SQLite database. VF-01–VF-12 covered empty, 30/60-minute invariance, full-green/full-yellow/valid-zero/missing-machine, multi-day, overall/per-machine, day/week/month comparison, local highlight/toggles, exact-value overlap, and 1280/1366/1440px. All measured desktop states had `scrollWidth === clientWidth` and no chart overflow. Evidence is under `docs/evidence/stage5_3_uat_v2/`.
- Commit: `ce603c8` (primary implementation); acceptance/log evidence follows in the next local documentation commit.
- Safety: No statistics formula, data-quality eligibility, SQLite schema, Excel/event page, enterprise API/file, real database, deployment, push, Stage 6/7, or destructive operation was used or changed.
- Open issues: Human visual confirmation against the user's private 2025/06/01 values and subjective typography/color density remains required. `next start` continues to print the pre-existing standalone-output warning; formal production container validation remains later scope.
- Next: Stop for user review of `STAGE5_3_UAT_ROUND1_VISUAL_ACCEPTANCE.md`; do not begin another stage.

## Stage 5.3 — Human UAT final UI/UX corrections

- Status: Implementation, automated regression, public-synthetic browser operation, and 1280/1366/1440px visual/DOM acceptance complete; subjective user sign-off remains pending.
- Main changes: Made all range/comparison trend lines solid while retaining Tooltip and legend focus/hide; enlarged light-state percentages to high-contrast 16px/900 labels; restricted 30/60-minute grain to single-day ranges and exposed a disabled daily control for multi-day ranges; clarified day/week/month comparison copy and showed calculated seven-day/full-month ranges; completed a purpose-based typography and layout pass across the shared shell, home, Excel import, operation analysis, event analysis, deferred live pages, and API settings.
- Typography evidence: At 1366px, visible direct-text nodes below 14px changed from 31/228/49/52/25/25/25 across home/import/operation/event/machine/environment/settings to zero on every route. The same zero-below-14 result held at 1280 and 1440px. All measured pages had zero page overflow and zero unhandled clipped nodes. Primary navigation, body, tables, forms, and actions are now generally 16px or larger; secondary metadata/chart text is 14–15px by purpose.
- Tests: `npm run typecheck`, `npm run lint`, `npm test -- --run` (98 passed, 1 opt-in private-workbook test skipped), and `npm run build` with Webpack passed. Component regressions verify solid SVG lines and comparison-period helpers.
- Browser: Chrome production-build flows passed 30/60-minute range, missing/valid-zero data, multi-day daily lock, day/week/month comparisons, Tooltip, legend focus/hide, per-machine/aggregate shares, percentage style assertions, and complete week-range preview. At 1280/1366/1440px the page and charts had no horizontal overflow. Before/after and functional evidence is under `docs/evidence/stage5_3_uat_ux/`.
- Commit: `0f329bf` (implementation and browser evidence); acceptance documentation follows in the next local commit.
- Safety: No enterprise API/file, private database, credential, Excel/statistics/quality contract, schema, deployment, push, Stage 6/7, destructive Git operation, or data/volume deletion was used or changed.
- Next: Stop for user review of `STAGE5_3_UAT_FINAL_UI_UX_ACCEPTANCE.md`; do not begin another stage.

## Stage 5.3 — Human UAT visual corrections Round 2

- Status: Six targeted UI/chart corrections, automated regression, and public-synthetic real-browser validation complete; subjective user UAT remains pending.
- Main changes: Aligned the four range-filter label/control/help rows; separated the trend Y-axis title from dynamic ticks; reduced machine-label-to-share-bar spacing to a responsive 16px; normalized partial/end trend points; rebuilt comparison trend Tooltip rows; and added viewport-aware structured overall/per-machine share Tooltips. All existing Tooltip, focus, legend hide/focus, and local chart interactions remain.
- Tests: `npm run typecheck`, `npm run lint`, `npm test -- --run` (98 passed; one opt-in private-workbook suite skipped), `npm run build` with Webpack, and `git diff --check` passed. Component regression verifies the updated SVG geometry and uniform partial-point marker.
- Browser: Production Chrome at 100% used only an isolated `/private/tmp` synthetic SQLite database. Filter top/bottom/height spreads were 0px; six trend modes had no Y-title/tick overlap and at least 23.1px separation; share labels used a 16px gap; normal/focused endpoints remained circular; day/week/month trend and overall/per-machine share Tooltips stayed inside 1280/1366/1440px viewports. Range/comparison pages had no horizontal overflow. Evidence is under `docs/evidence/stage5_3_uat_round2/`.
- Commit: `56a8782` (implementation, tests, runner, and synthetic browser evidence); acceptance/log documentation follows in the next local commit.
- Safety: No statistic, comparison, data-quality, SQLite, Excel, event-page, enterprise API/file, real database, push, deployment, Stage 6/7, destructive Git operation, or data/volume deletion was used or changed. `_reference_inputs/` remained ignored/read-only.
- Next: Stop for user review of `STAGE5_3_UAT_ROUND2_ACCEPTANCE.md`; do not begin another stage.

## Stage 5.3 — Human UAT Round 3 interface cleanup

- Status: Six user-facing cleanup items complete; Level 1 synthetic-browser smoke passed and user UAT remains pending.
- Main changes: Reduced the Excel version table to the approved six columns and moved Batch ID, full filename, import time, Alarm source, same-day version, status, and rollback action into an expandable detail row. Added consistent shared Select arrow spacing; removed raw-second duplication from duration displays; removed range/comparison coverage summary strips while retaining plain-language incomplete-data warnings; replaced result-side A/B aliases with actual dates or date ranges across comparison subtitles, legends, bars, Tooltips, share rows, and sorting copy.
- Checks: Related Vitest files passed 14 tests; `npm run typecheck`, `npm run lint`, `npm run build` with Webpack, and `git diff --check` passed. A production-build Chrome smoke at 1366px used a new `/private/tmp` public synthetic SQLite database and verified the six import columns/detail expansion, 0px toolbar control alignment delta, 48px Select right padding, range/comparison cleanup, date-based labels, readable duration Tooltips, shared event-page Select styling, and no page-level horizontal overflow.
- Safety: Statistics, coverage calculations, quality eligibility, comparison rules, SQLite schema, Excel parsing/transactions, enterprise API/data, real databases, push, deployment, and Stage 6/7 were not changed or used.
- Next: Stop for user UAT at the existing localhost pages; do not begin another stage.

## Stage 6 — Enterprise API validation and live-data backend

- Status: Complete for the authorized one-shot enterprise validation, offline implementation, synthetic tests, isolated SQLite, Collector process smoke, and Production Build. Stage 7 UI and supervised multi-round real collection remain pending.
- Real API validation: At 2026-11-15 16:07 Asia/Taipei, the approved values/configs/groups GET endpoints were each requested exactly once with no retry or raw-response persistence. All returned HTTP 200 and `responseCode="00"`; observed shapes were 48 values, 48 configs, and 5 groups／47 assignments, matching the approved structural contract. No response was written to SQLite.
- Main changes: Added an exact-allowlist HTTPS Enterprise Client with scoped TLS/auth/timeout/size/redirect controls; 09:00–17:00 three-minute Collector with startup/resume, metadata hash refresh, partial failure, retry, overlap, mode-revision guard, retention and manual-audit separation; read-only synthetic Demo; Live machine/environment/connection queries; and localhost-protected connection-test/runtime-mode routes. Reused the approved 16-table schema, so no migration was required.
- Tests: `npm run typecheck`, `npm run lint`, `npm test -- --run` (118 passed, 1 opt-in private-workbook suite skipped), `npm run build` with Webpack, `git diff --check`, and an isolated Demo Collector direct-process startup/graceful-SIGINT smoke all passed. Tests cover 48 Sensor contracts, ungrouped mapping, TLS/error boundaries, schedule/slots, retries, partial failure, snapshot dedupe, in-flight mode discard, manual/collection separation, retention isolation, Demo zero writes, unchanged-updateTime gaps, local routes and mode revision conflicts.
- Commit: `8a8e711` (implementation); acceptance documentation follows in the next local commit.
- Safety: The real validation made only the three explicitly authorized requests, stored no raw response, and exposed no origin or credentials. No product/private DB, Docker Volume, Stage 5 logic, enterprise file, push, deployment, Stage 7 UI, or destructive operation was used or changed.
- Open issues: Container-side enterprise TLS/network and custom CA, two or more supervised real Collector rounds, true Live persistence/retention, private replay, production Docker, and Stage 7 browser/UI validation remain unverified and are not claimed complete.
- Next: Stop for Stage 6 review. Begin Stage 7 only after explicit authorization.

## Stage 7 — Live monitoring front-end

- Status: Complete for implementation, Demo／isolated-SQLite regression, Production Build, and real-browser UI validation. Supervised multi-round enterprise Live collection remains unverified.
- Main changes: Replaced the three deferred pages with machine monitoring, environment monitoring, and API connection settings; added a local overview endpoint and homepage source/availability summary. Machine monitoring now has six mutually exclusive summaries, independent A/B selection, freshness-neutral cards, raw completion Detector details, and shared area environment context. Environment monitoring now has eight independent Sensor cards and two four-line charts with provider-clock X range, dynamic non-zero Y scales, provisional reference lines, NULL gaps, legend focus/hide, Tooltip, and keyboard interaction.
- Demo compatibility: Expanded the existing read-only synthetic environment fixture from three isolated observations to the full 160 three-minute slots with deterministic values and deliberate gaps. Demo still performs zero Live database writes and never represents enterprise API success.
- Tests: `npm run typecheck`, `npm run lint`, `npm test` (126 passed across 16 files; one opt-in private-workbook suite skipped), `npm run build` with Webpack, and `git diff --check` passed. New tests cover dynamic axes, valid zero, NULL/non-contiguous gaps, provisional-limit/missing distinctions, full-day Demo, chart controls, overview, and fake-KPI exclusion.
- Browser: The in-app browser used only `/private/tmp/jiyin-stage7-browser.sqlite`. Demo passed A/B independent selection, stale/unknown, eight Sensor cards, four-line charts, Tooltip, legend keyboard/hide and refresh persistence. A protected local mode switch verified the Live NO_DATA state for all eight machines, then restored Demo. 1280/1366/1440px had no page-level or desktop-chart overflow; 760px kept chart overflow internal. Console contained no warning/error. The native-confirm click sequence remains a target-laptop manual UAT because browser automation could not reliably operate that dialog; no enterprise Manual Test was triggered.
- Safety: No enterprise request, real Collector, product/private database, Docker Volume, Stage 5 logic, push, deployment, private file, or destructive Git operation was used or changed.
- Open issues: Two or more supervised real Collector rounds, true Live freshness/partial-failure behavior, container TLS/network, production Docker, and the target-laptop native mode-confirm flow remain unverified. See `docs/STAGE7_ACCEPTANCE.md`.
- Next: Stop for Stage 7 human UAT; do not begin another stage without explicit authorization.

## Stage 7 — UAT Round 1 UI／UX refinement

- Status: Nine-reference-image implementation, targeted regression, synthetic Demo browser validation, and responsive checks complete; subjective user UAT remains pending.
- Main changes: Strengthened five valid machine lamp colors while keeping stale/unknown/no-data neutral; balanced each A/B 2×2 card grid against its simplified detail panel; reduced machine detail engineering fields; simplified eight environment cards with 26°C／40%RH warning semantics and area-level times; rebuilt live charts with no persistent markers for continuous data, full-plot nearest-slot hover, transient markers and keyboard points; simplified API settings and its endpoint table to user-facing language.
- Contract compatibility: Added only the already-declared environment `fetchedAt` field to the Live latest query. Collector scheduling, sample slots, dynamic axes, NULL gaps, SQLite, Stage 5 statistics/import logic, and Live／Demo isolation remain unchanged.
- Tests: Stage 6／7 targeted suite passed 29 tests; full Vitest passed 127 tests across 16 files with one opt-in private Excel suite skipped; `npm run typecheck`, `npm run lint` (zero warnings), `npm run build` with Webpack, and `git diff --check` passed.
- Browser: In-app browser used `/private/tmp/jiyin-stage7-uat1.sqlite` with synthetic Demo only. At 1366px A/B grid/detail bottom deltas were both 0px and cards were equal height; nearest-slot mouse Tooltip returned four values, keyboard focus worked, legend hide survived refresh, and the API Manual Test was not clicked. 1280／1366／1440px had no page/main overflow; 760px stacked safely with no page overflow. Console had no warnings/errors. Browser captures covered the machine full page, environment cards/charts, and simplified API page.
- Safety: All nine ignored reference images were viewed but not modified or committed. No enterprise request, real Collector, product DB/volume, Stage 5 core, push, deployment, Stage 8, or destructive operation occurred.
- Commit: This local changeset; final hash is reported in the handoff.
- Open issues: User taste check for glow/card density, target-Mac native Live/Demo confirmation, and supervised real multi-round Live collection remain pending.
- Next: Stop for Stage 7 UAT Round 1 review; do not begin Stage 8.

## Stage 7 — UAT Round 2 local UI and connection-status refinement

- Status: Seven scoped fixes complete with synthetic／Mock regression and isolated-browser smoke; human UAT remains pending.
- Main changes: Manual endpoint audits now drive the service-status table without changing Collector success; manual tests stop after the first failed endpoint and retain later endpoints as untested; machine cards/details were shortened together; chart paths and red warning lines were clarified; monitor refresh actions now read「更新畫面」and remain local-only.
- Tests: Stage 6／7 targeted suite passed 32 tests; typecheck, lint, Webpack production build and `git diff --check` passed.
- Browser: Timeout then success Mock states were verified without readings; 1280px machine cards measured 186.90px with 0px grid/detail bottom delta, compared with approximately 283px in Round 1. 1280／1366／1440／760 checks showed no obvious clipping or page overflow; chart Tooltip, gaps, transient markers and exact 26°C／40%RH labels remained operational.
- Safety: Six ignored reference screenshots were viewed but not committed. No enterprise request, real Collector, product DB／volume, push, deployment, Stage 5 core change, or Stage 8 work occurred.
- Commit: This local changeset; final hash is reported in the handoff.
- Next: Stop for Stage 7 UAT Round 2 human review.

## Stage 6／7 — Supervised enterprise Live validation

- Status: The existing enterprise Client, manual-test route, Collector, isolated SQLite, and three Live pages were validated during the 09:00–17:00 service window. No product/history database or Demo data was used.
- Real API: One manual test returned HTTP 200 and `responseCode="00"` for values/configs/groups with 48 values/configs, 5 groups, and 47 assignments. It wrote zero readings and did not change Collector success.
- Collector: Two successful slots (11:54 STARTUP and 11:57 SCHEDULED) stored 48 readings each. Both slots had the same 48-Sensor set; all 48 source update times advanced, and the Collector was stopped immediately after the second slot.
- Live UI: Eight machines and eight independent environment points displayed fresh Live data; environment charts contained both three-minute slots. API settings showed the Collector success independently from the earlier manual test.
- Focused corrections: local Collector startup now optionally loads ignored `.env.local`; endpoint health ignores routine metadata `NOT_DUE` audits; completion detector `ON/OFF` receives deterministic typed parsing while preserving source text and unknown fallback. See `STAGE6_7_LIVE_VALIDATION.md`.
- Checks: Stage 6／7 targeted suite passed 32 tests; Typecheck, Lint, Webpack Production Build, and `git diff --check` passed. Post-fix read-only checks showed configs/groups as their latest attempted success and all eight stored detector values as OFF rather than UNKNOWN.
- Safety: Only the three approved GET endpoints were used. No raw response, origin, credential, private SQLite, screenshot, push, deployment, Stage 8 work, or destructive operation was committed.

## Stage 7 — Final pre-Stage-8 fixes

- Status: Five scoped UI and threshold fixes complete; human UAT remains pending.
- Main changes: Added a shared Live-recent／Today trend switch (Live defaults to a padded window containing the latest full 60 minutes; Demo retains its full daytime default), added viewport-aware Tooltip placement, applied the approved four-series palette and line widths, documented endpoint refresh frequencies without changing scheduling, and made 26.0°C／40.0%RH inclusive warning boundaries.
- Checks: Stage 7 targeted component tests, Typecheck, Lint, Webpack Production Build, and `git diff --check` passed. An isolated synthetic-Demo browser smoke verified the shared range switch, full-day Demo default, exact line／legend／reference styles, an in-viewport right-edge Tooltip, API frequency copy, and no page-level horizontal overflow.
- Safety: The existing Collector was not stopped, restarted, replaced, or queried. No enterprise API request, Collector schedule／mapping／contract, product SQLite／Docker Volume, Stage 5 logic, push, deployment, or Stage 8 work was used or changed.
- Next: Stop for final Stage 7 human UAT before starting Stage 8.

## Stage 7 — Final three UI refinements

- Status: Three scoped UI refinements complete; final visual confirmation remains pending.
- Main changes: Simplified A／B environment headers to source-time-only updates, reorganized environment Tooltips into desktop A／B columns with a narrow single-column fallback, and replaced the machine-detail lamp line with a balanced header-row status badge without changing the machine cards or state rules.
- Checks: 15 targeted tests, Typecheck, Lint, Webpack Production Build, and isolated synthetic-Demo browser smoke passed. No enterprise API, Collector control, product database, runtime-mode switch, push, deployment, or Stage 8 implementation was performed.
- Stage 8 todo: Decouple Demo presentation mode from background Live collection so switching the UI to Demo never interrupts real data collection. This requirement is recorded only and was not implemented in Stage 7.
- Next: Stop for final human visual confirmation.

## Stage 8A — Windows／macOS native npm runtime

- Status: Native npm implementation and macOS isolated verification complete; Windows 10/11 physical-machine validation remains pending and is not claimed as passed.
- Runtime: Added cross-platform `npm run dev:all` and `npm run start:all` launchers that initialize/migrate one absolute SQLite path, start Web and Collector without shell-specific commands, propagate the same database path, reject a duplicate Collector for that database, and terminate both children from the owning terminal. Existing standalone Web/Collector commands remain available for diagnosis.
- Demo／Live separation: Browser display mode now uses a per-browser cookie. Selecting Demo no longer changes the database Collector mode or `mode_revision`; a configured Collector independently enables guarded Live collection. A missing enterprise configuration leaves Collector safely idle while Demo and local Excel/history functions remain available.
- Portability: Added Node 24.15 `.nvmrc`, native relative SQLite default, Windows PowerShell/macOS README instructions, Unicode/space-path coverage, and a native `next start` build configuration. Docker standalone output is intentionally deferred to Stage 8B.
- Checks: 40 focused Stage 6–8 tests passed; Typecheck, Lint, and Webpack Production Build passed. A macOS `start:all` smoke used an isolated SQLite path containing Chinese characters and spaces on port 3188: Web became ready, unconfigured Collector remained idle without enterprise requests, Demo/API settings rendered in a real browser, and Ctrl+C stopped both child processes, released the Web port, and removed the Collector PID lock.
- Safety: The running real Collector, `.env.local`, enterprise API, product SQLite, Docker Volume, Stage 0–7 data, push, and deployment were not touched. The smoke explicitly cleared the enterprise Origin and used `/private/tmp` only.
- Open issues: Validate clean clone/`npm ci`, PowerShell startup/shutdown, path handling, Defender/firewall prompts, and Live Mock operation on an actual Windows 10/11 machine. Stage 8B still owns optional Docker production packaging, persistence/restart checks, backup/restore instructions, delivery FAQ, and final repository secret/history review.
- Next: Stop for Stage 8A review; do not begin Stage 8B without authorization.

## Stage 8B — Optional Docker delivery and SQLite recovery

- Status: Optional production Docker Compose, SQLite backup/restore, focused regression, and isolated Docker smoke are complete. Native npm remains the primary runtime and its Stage 8 tests remain passing.
- SQLite: Added cross-platform `db:backup` and `db:restore` commands using Node's SQLite online backup API. Backups are integrity-checked and include committed WAL state; restore requires explicit stopped-process confirmation, refuses Collector locks and WAL/SHM sidecars, verifies the backup, and retains the replaced database as a recoverable `.pre-restore-...sqlite` copy. Live retention remains 3 days and continues to leave imported history untouched.
- Docker: Replaced the development Compose skeleton with production-built, non-root `migrate`, `web`, and `collector` services sharing one named volume. Migration must complete before Web/Collector start; Web and Collector have independent healthchecks, `unless-stopped` restart policies, init processes, and 20-second graceful-stop windows. Blank enterprise Origin leaves Collector idle; runtime enterprise/TLS settings are injected rather than included in the image. A maintenance profile exposes backup/restore without adding an external database.
- Verification: 35 focused Stage 6/8/DB tests, Typecheck, Lint, and the local Webpack Production Build passed. Docker 27.4.0 / Compose 2.31 used only project `jiyin-stage8b-smoke`, port 3190, empty enterprise Origin, and volume `jiyin-stage8b-smoke_app_data`. Container Production Build and schema v2 migration passed; Web/Collector were healthy; Collector stayed idle; a synthetic import marker survived container removal/recreation; Docker backup produced a 61-page snapshot; mutation then restore recovered the marker with `integrity_check=ok`; restored services became healthy. Smoke containers were stopped with `down` and the isolated volume was not deleted.
- Documentation: README now covers optional Docker setup/status/logs/stop/update, native and Docker backup/restore, named-volume persistence, safe update behavior, duplicate-Collector prevention, TLS/CA handling, and recovery troubleshooting.
- Safety: No enterprise request, real Collector control, `.env.local`, product SQLite, existing Docker volume, Stage 5–7 business logic, push, deployment, or volume deletion was performed. Docker used no private input and `_reference_inputs` remained untouched.
- Open items: Windows Docker Desktop and Windows Live remain target-machine manual checks. A future `custom_ca` deployment requires a private read-only Compose bind-mount override and has not been exercised. Moving an existing real npm database/Collector to Docker still requires separate authorization, backup, and a single-Collector cutover.
