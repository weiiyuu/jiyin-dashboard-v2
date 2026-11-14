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
