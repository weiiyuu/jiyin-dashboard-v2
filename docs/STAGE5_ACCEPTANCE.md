# Stage 5 Acceptance — Historical Analysis and Excel Import UI

Date: 2026-11-14

Branch: `dev`

Implementation commit: `4e2bfd9`

Scope: Stage 5 only; Stage 6 Collector and Stage 7 live monitoring remain deferred.

## Decision

Stage 5 is accepted for the authorized scope. The three pages are connected to the existing local APIs and SQLite transactions, the full automated suite passes, and a real browser flow with public synthetic `.xlsx` data completed multi-file selection, removal, Preview, Confirm, Active version display, and post-import history API verification.

No enterprise API, private workbook, remote deployment, or Git push was used.

## Delivered pages and evidence

### Excel import

- Page: `src/app/imports/page.tsx`
- APIs: `/api/imports`, `/api/imports/preview`, `/api/imports/confirm`, `/api/imports/[batchId]/activate`
- Supports multiple `.xlsx` selection, pre-preview removal, per-file decision/count/issues, invalid-file blocking, duplicate skip, explicit conflict approval, Active Batch compare-and-swap, batch history, and rollback activation.
- `ACTIVE_VERSION_CHANGED` clears stale Preview state or reloads the version list and instructs the user to preview again.
- All writes remain in the existing backend transactions; the UI contains no direct database logic.

### Historical processing analysis

- Page: `src/app/history/processing/page.tsx`
- API: `/api/history/processing`
- Supports A1–B4 filters, date range, 30/60-minute same-day buckets, daily cross-date buckets, and day/week/month comparison.
- Renders backend ranking, trend, six-state shares, comparison, and coverage. The client does not recalculate Green hours, coverage, or state percentages.
- Missing positions break trend lines; valid zero, `MISSING_DATA`, and `NOT_APPLICABLE` remain distinct.

### Event analysis

- Page: `src/app/history/events/page.tsx`
- API: `/api/history/events`
- Supports date, area, machine, Alarm sensor/rule, view, and pagination controls.
- Displays Red/Yellow hours and continuous state groups without calling them confirmed failures.
- Displays Alarm source coverage and keeps `MISSING`, `PROVIDED_EMPTY`, and `PROVIDED_NONEMPTY` semantics distinct.

### Shared navigation and states

- `src/components/app-shell.tsx`, `page-header.tsx`, `ui-states.tsx`, `history-widgets.tsx`
- Seven-page navigation shell is present. Stage 6/7 placeholder pages explicitly state that the feature is not enabled and render no fake data.
- Loading, error, empty, coverage, card, table, and chart states share one visual language and responsive layout.

## Legacy UI selective migration

The legacy `../jiyin-dashboard` project was inspected read-only before the shared shell was finalized.

- Directly reused with local import/path adjustment: the SVG `Icon` component pattern and the `Brand` markup/structure.
- Selectively adapted: Dashboard shell composition, skip link, Sidebar/Topbar/breadcrumb/footer structure, and mobile navigation toggle.
- Reimplemented against v2 contracts: navigation definitions, status wording, panels/cards, all charts, Excel UI, historical pages, loading/error/empty behavior, and every data interaction.
- Visual reference only: the burgundy/glass color language, borders, spacing rhythm, and dashboard card treatment.
- Not copied: legacy APIs, SQLite access, Excel logic, fake values, quality-page behavior, or 3D scene code.

This approach preserves the legacy brand while avoiding coupling v2 to old data semantics.

## Acceptance flows

| Flow | Result | Evidence |
|---|---|---|
| Select two Excel files, remove one, process only the remainder | Passed in browser | Browser showed two selected files, then only `stage5-browser-b.xlsx`; `tests/ui-view-models.test.tsx` covers deterministic removal |
| Preview performs no write | Passed | Browser version list remained empty after Preview; `tests/stage5-route-flow.test.ts` asserts zero `import_batches` before Confirm |
| Confirm then read imported processing data | Passed | Browser Confirm created Active Batch #1; localhost processing API returned A1 `greenHours: 0.05` |
| Same-day replacement updates Active processing data | Passed | `tests/stage5-route-flow.test.ts` verifies 0.05 → 0.025 through real routes; `tests/history-service.test.ts` verifies active-only ranking/trend/share/coverage |
| Alarm query ignores replaced rows | Passed | `tests/history-service.test.ts` verifies only the active replacement Alarm row and coverage remain |
| Roll back to old version | Passed at route/integration level | `tests/stage5-route-flow.test.ts` activates the old batch and verifies Green returns to 0.05 |
| Duplicate/conflict/version-change handling | Passed at model/API level | `tests/ui-view-models.test.tsx`, `tests/import.test.ts`, and the import routes cover skip, explicit replace, and compare-and-swap rejection |
| Missing values are not rendered as valid zero | Passed | `tests/ui-view-models.test.tsx` covers labels and trend gaps; history service tests cover nullable statistics |
| Alarm missing source differs from confirmed empty source | Passed | Route flow verifies `MISSING/null` versus `PROVIDED_EMPTY/0`; browser-confirmed synthetic import displayed `PROVIDED_EMPTY` |

## Integration issue found and corrected

Browser Preview initially returned `LOCALHOST_REQUIRED` because Next.js can expose the internal `0.0.0.0` listener in `request.url` while the browser reaches `localhost`. `src/server/http/local-mutation.ts` now validates the actual HTTP `Host` as loopback and requires `Origin` to match that Host exactly. Cross-site and non-loopback requests remain rejected. `tests/http-security.test.ts` includes the internal-listener/localhost-host regression case, and an actual localhost multipart Preview changed from HTTP 403 to HTTP 200.

## Test results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 61 tests in 11 files.
- `npm run build`: passed with the approved `next build --webpack` command; all three Stage 5 pages and their API routes were emitted.
- Browser/local HTTP validation: passed for page rendering, responsive navigation state, two-file selection, removal, Preview, Confirm, Active batch display, processing API data, event API data, and Stage 6/7 no-fake-data placeholders.

Important automated coverage:

- `tests/stage5-route-flow.test.ts`: synthetic OOXML Preview/Confirm/replace/activate/history flow and Alarm source semantics.
- `tests/ui-view-models.test.tsx`: removal/replace decisions, valid zero versus missing/not-applicable, trend gaps, and direct backend percentage rendering.
- `tests/history-service.test.ts`: active-only ranking/trend/state share/coverage, comparison, Alarm coverage, pagination data, and replaced Alarm exclusion.
- Existing import/database/statistics suites continue to cover transaction rollback, version consistency, formula/quality validation, 24:00, NULL/0, and SQLite integrity.

## Manual verification still recommended

The browser automation successfully completed the import mutation flow. Its native date-input driver did not reliably dispatch React change events, so click-through chart rendering for every range/day/week/month combination was not claimed as browser-automated. These paths passed route/service/component tests and should receive a short human smoke check on the target laptop:

1. Query one imported day on the processing page and inspect ranking/trend/share layout.
2. Switch to day/week/month comparisons and verify labels at the intended laptop resolution.
3. Use two same-date workbook versions to inspect the conflict confirmation copy and rollback prompt.
4. Query an Alarm-missing day beside a provided-empty day and inspect both messages.

This is a UI-operation check, not an unresolved data-contract or backend correctness defect.

## Known deferred scope

- Enterprise Collector transport and production Live Sensor queries: Stage 6.
- Live machine/environment pages and their 30-second local refresh behavior: Stage 7.
- Production Docker deployment/operational validation: later approved stage.

Stage 5 completion does not claim any of the above.
