# Stage 5.2 Final Acceptance — Excel Import UI

Date: 2026-11-15

Branch: `dev`

Implementation commit: `8bf40f5`

Scope: Excel import page, version-history query integration, and directly related tests only. No Parser, NULL policy, quality eligibility, statistics formula, history/event chart, enterprise API, deployment, push, Stage 6, or Stage 7 change was made.

## Decision

The final Excel import UI correction is accepted for the repository, public synthetic-data, production-build, and real-browser scopes. The page now uses one full-width operation card, a genuine batch-summary/compact-file Preview, and server-side version sorting/filtering/pagination. Every visible pair of major sections measured exactly 24 CSS px in all required states.

The user separately confirmed successful batch import of the real 2025-06-01–06-05 workbooks. This automated run did not copy or commit those private files; browser evidence below used only generated synthetic workbooks and a disposable SQLite database.

## Implemented changes

### Import operation area

- Replaced the two-card selection/rules layout with one full-width `Excel 匯入操作` card.
- Moved the three approved rules into a keyboard-operable, collapsed-by-default `details` disclosure.
- Kept actual limits visible: 8 files, 25 MiB per file, and 50 MiB per request.
- Limited the selected-file list to 360px with internal scrolling; filenames use ellipsis plus a full-name tooltip.
- Preserved remove-one, clear-all, loading lockout, upload validation, and Preview zero-write behavior.

### Preview information architecture

- The fixed batch summary shows file total, insert, duplicate, replacement/conflict, quality-warning, and invalid/review counts.
- Each file occupies one compact row with source date, filename, explicit text status, error/warning count, row counts, and an expand control.
- Expanded detail retains arrival and per-metric eligibility, grouped Chinese issue explanations, examples, raw codes, Alarm-source state, replacement approval, and Confirm consequences.
- The result list is limited to 460px. Expanded detail is limited to 520px. Both scroll internally when necessary.
- `DUPLICATE`, `CONFLICT`, `INVALID`, replacement confirmation, per-file transaction, and `ACTIVE_VERSION_CHANGED` semantics are unchanged.

### Version history

- Added backward-compatible paginated query support to `/api/imports`; the no-query response remains the existing array contract for other pages.
- Sorting/filtering occurs in SQLite before `LIMIT/OFFSET`, not on the current browser page.
- Default order is source date descending with deterministic imported-time and Batch-ID tie-breakers.
- Source date and imported time headers are clickable, keyboard accessible, show direction, and expose `aria-sort`.
- Added exact source-date query, partial filename query, 10/20/50 page sizes, total count, current page, previous/next controls, and safe page clamping.
- The primary table now shows a deterministic same-day version (`v1`, `v2`, …) and imported time. Global Batch ID appears only inside expanded version details.
- Active Batch ID is still returned for safe rollback compare-and-swap; no schema or migration change was needed.

Primary files:

- `src/app/imports/page.tsx`
- `src/app/globals.css`
- `src/app/api/import/batches/route.ts`
- `src/server/import/import-repository.ts`
- `tests/import.test.ts`
- `tests/stage5-route-flow.test.ts`
- `scripts/create-stage52-ui-browser-state.ts`

## Automated tests

| Command | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test -- --reporter=dot` | Passed: 79 tests; one opt-in performance test skipped in the normal gate |
| `npm run build` | Passed with `next build --webpack`; 18 routes emitted |
| `git diff --check` | Passed |

New regressions prove that 21 records are filtered/sorted before pagination, page 3 returns the final record, imported-time ascending works, date plus filename filters are combined, and the HTTP route returns the requested page with a deterministic same-day version. Existing Preview, Confirm, duplicate, conflict, replacement, rollback, active-version consistency, migration, NULL, and quality tests remain green.

## Browser environment and evidence

Environment: Next.js production build on `localhost:3002`, Chromium-based Codex in-app browser, disposable SQLite under `/private/tmp`, and generated public synthetic `.xlsx` files. The service was stopped after QA. Screenshot captures were emitted in the Codex browser run for each row below; they were intentionally not committed to Git as product assets.

### 1366px required states

| State | DOM measurement | Visual evidence |
|---|---|---|
| No selection / no Preview | Selection→History: `24px`; page width `1366/1366`; one operation card; rules collapsed | Captured in browser run: `1366 S1 — no Preview` |
| Five selected / no Preview | Selection→History: `24px`; five-file list `356px`; no right-side rules card | DOM result recorded before Preview |
| Five-file Preview | Selection→Preview: `24px`; Preview→History: `24px`; five compact rows; summary `5 total / 3 insert / 2 duplicate` | Captured in browser run: `1366 S3 — five-file Preview` |
| Confirm complete | Selection→History: `24px`; Preview removed; three new files written; version count `21→24` | Captured in browser run: `1366 S4 — after Confirm` |
| Eight-file mixed Preview | Both gaps `24px`; selected list `360/575px`; Preview list `460/1094px`; eight rows; one invalid remained isolated; version count stayed `24` | Captured in browser run: `1366 U-04 — eight-file mixed Preview` |

The five-file flow used two exact duplicates and three new files, one containing nullable Alarm descriptions. Confirm wrote only the three allowed files. The eight-file flow contained three same-date conflicts, four new files, and one intentionally invalid workbook; Preview preserved all eight outcomes and did not change the database version count.

### Responsive measurements

| Viewport | Page overflow | Major gap | Table behavior | Result |
|---:|---|---:|---|---|
| 1280×720 | none (`scrollWidth=1280`, viewport `1280`) | `24px` | table uses its own horizontal wrapper (`982/1080px`); controls remain visible | Passed; screenshot captured |
| 1366×768 | none (`1366/1366`) | `24px` in every state | default 10 rows, all controls reachable | Passed; three required state captures plus mixed Preview capture |
| 1440×900 | none (`1440/1440`) | `24px` | table fits wrapper (`1142/1142px`) | Passed; screenshot captured |

### Sorting, filtering, and pagination interaction

- Source date ascending returned `2025-08-01` versions first and set `aria-sort=ascending`.
- Imported time descending and ascending both changed the complete result order and updated `aria-sort`.
- Default 10-row page navigated to page 2 successfully.
- Page size 20 returned 20 rows and `1/2`; page size 50 returned all 24 rows and disabled Next.
- Source-date query `2025-08-01` returned exactly two rows, `v2` and `v1`.
- Filename query `browser` returned exactly the three confirmed browser fixtures.
- The version detail retained Batch ID, complete filename, imported time, Alarm source state, and rollback action.

## Safety and known limits

- No private Excel/JSON, credential, environment file, database, log, or screenshot was added to Git.
- The private five-day workbooks were not rewritten or copied; their successful real import is user-reported and separate from this synthetic browser run.
- The version endpoint still supports the legacy unpaginated response for existing internal consumers. The Excel page uses the new paginated response.
- At 1280px the wide version table intentionally scrolls inside its table wrapper; the page itself never scrolls horizontally.
- No browser video was created. Still screenshots plus DOM measurements and interactive browser results were recorded instead.

Work stops at this final Stage 5.2 Excel UI correction. Push, deployment, Stage 6, and Stage 7 remain unauthorized.
