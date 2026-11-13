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
- Commit: Pending
- Open issues: Formula and external-link policy is intentionally strict per approved v1 contract. The route layer currently returns safe rule codes/messages but has no upload UI in this authorization scope.
- Next: Implement historical-statistics pure functions and hand-verifiable fixtures

## Stage 4 — Historical statistics

- Status: Not started
- Main changes: Pending
- Tests: Pending
- Commit: Pending
- Open issues: None
- Next: Pending
