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
