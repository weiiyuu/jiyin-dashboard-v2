# Stage 5.1 Acceptance — Concentrated UI and Import Corrections

Date: 2026-11-14  
Branch: `dev`  
Implementation commit: `9c63234`  
Scope: Stage 5.1 only. No Stage 6/7 work, enterprise API call, deployment, or push was performed.

## Decision

Stage 5.1 is accepted for the repository and synthetic-data scope. The authorized Excel, historical-processing, event-analysis, home, spacing, and responsive corrections are implemented. The final automated gate passes, and real-browser flows were exercised against a disposable SQLite database populated only with public synthetic workbooks.

The original private 2025-06-03 workbook was not present in this workspace. Therefore the exact private file remains an explicit human recheck: the reproducible failure class and route defect are fixed, but this document does not claim that the unavailable original binary itself was executed.

## Excel Preview 500: cause and correction

### Root cause

`src/server/import/workbook-parser.ts` used a throwing `required()` helper for missing required row values. A contract-invalid value in environment, Alarm, quality, or metadata rows therefore escaped as a generic exception instead of becoming a validation issue. `src/app/api/import/preview/route.ts` also handled the whole multipart request in one outer `try`, so one such file aborted every file and was mapped to `IMPORT_INTERNAL_ERROR` HTTP 500.

A synthetic 2025-06-03-shaped workbook with a missing required Alarm sensor value reproduced HTTP 500 before the fix in `tests/stage5-route-flow.test.ts`.

### Fix

- Missing required row values now produce blocking `STRUCT_MISSING_VALUE` issues with sheet, row, and column context; source data is not cleaned or rewritten.
- Unreadable OOXML is normalized to `XLSX_PARSE_FAILED` (422 semantics).
- Preview isolates known validation/preflight errors per file and returns `INVALID` for only that file; valid siblings continue.
- Unexpected server errors remain HTTP 500 and are correlated to a server-side request ID without returning internal detail to the browser.
- Preview remains read-only. Confirm still reparses, fingerprints, validates, and writes each file through the existing transaction.

Because the unavailable private file could not be inspected, the exact offending cell in that binary is unknown. The corrected defect is the proven 500-producing path, not a claim about a specific private cell.

## Upload limits and multi-file behavior

The enforced limits are now visible and consistent:

- Maximum files per Preview request: 8.
- Maximum compressed bytes per file: 25 MiB.
- Maximum aggregate Preview request bytes: 50 MiB.
- Maximum expanded workbook bytes: 100 MiB per file.
- Maximum worksheet cells: 250,000 per file.

Evidence:

- `src/server/http/local-mutation.ts`
- `src/server/import/xlsx-preflight.ts`
- `src/app/imports/page.tsx`
- `tests/stage5-route-flow.test.ts` covers real 1/2/4/8-file Preview plus sequential transactional Confirm, client identity preservation, a mixed valid/invalid request, and Preview zero-write.
- Existing `tests/import.test.ts` continues to cover duplicate, replacement, active-version consistency, every replacement failure stage, and complete rollback.

## Delivered corrections

### Excel import UI

- `src/app/imports/page.tsx`
- Scrollable 8-file list, selected count/total bytes, clear-all, per-file remove, exact limit copy, and per-file decisions.
- Grouped error/warning summaries show Chinese labels, counts, example rows, and expandable detail.
- Version overview shows active date count, earliest/latest dates, version total, filter, pagination, Chinese state/source labels, and rollback controls.
- `ACTIVE_VERSION_CHANGED` behavior remains compatible with the approved compare-and-swap contract.

### Historical processing

- `src/server/statistics/history-service.ts` adds backward-compatible `seriesByMachine` and `stateShareByMachine`; existing aggregate fields are unchanged.
- `src/components/history-widgets.tsx` renders complete X/Y axes, ticks, units, grid, legends, SVG point tooltips, valid-zero points, nullable gaps, ranking axes, and comparison delta.
- `src/app/history/processing/page.tsx` starts with no machine selected, adds all/clear controls and the latest active-date shortcut, preserves selection between modes, clears stale results on filter changes, and supports per-machine/aggregate six-state views.
- All Green, six-state, coverage, and comparison values remain backend results. The client does not recompute business formulas.

### Event analysis

- `src/app/history/events/page.tsx`
- Chinese main terminology and three modes: all information, machine lamp states, and sensor alerts.
- One unified continuous-state list with all/red/yellow filtering; the primary value is accumulated colored seconds, with hours, bounds, interval count, and cross-day information secondary.
- The alert table has five main columns. Raw sensor/rule/classification/source IDs are placed in expandable technical detail.
- Missing alert source and provided-empty source use distinct Chinese messages; a zero-result filter hides pagination.
- Red/Yellow wording remains state-based and does not claim confirmed equipment failure or standby.

### Home and shared layout

- `src/app/page.tsx`, `src/components/app-shell.tsx`, `src/app/globals.css`
- `/` is an independent legacy-style lobby with no Sidebar, no system-scope panel, and three ordered workspaces: real-time monitoring, historical analysis, data management.
- Cards link to the currently appropriate machine/history/import pages and make no fake KPI, 3D, or live-data claim.
- The legacy project remained read-only. Brand/Icon structure and shell visual language were selectively adapted; legacy API, database, Excel, fake-data, and 3D logic were not copied.

## Automated verification

Final commands:

| Command | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test -- --reporter=dot` | Passed: 69 tests in 11 files |
| `npm run build` | Passed with `next build --webpack`; 18 routes emitted |

New or expanded high-value cases:

- Contract-invalid required value returns per-file `INVALID`, not HTTP 500, while a valid sibling remains usable.
- 1/2/4/8 real synthetic XLSX Preview/Confirm and independent active batches.
- Per-machine trend and six-state API results, including valid Green zero.
- Formal chart axes, machine legends, valid-zero Tooltip, and line gaps.
- Alarm source row/event identifiers for expandable detail.
- Existing transaction, 24:00, NULL/0, formula, data quality, migration, and statistics suites remain green.

## Real-browser acceptance

Environment: production build on localhost with `/private/tmp` synthetic XLSX files and a disposable SQLite database. No private file or enterprise endpoint was used.

| Browser flow | Result |
|---|---|
| Home lobby | Passed; no Sidebar, three ordered workspace cards, no horizontal overflow |
| Historical processing: 8, 2, and 1 machine | Passed; series/rank count follows selection |
| Same-day 30-minute and cross-day daily trend | Passed; daily X labels were 06-01/06-02/06-03 |
| Valid all-zero Green | Passed; chart remained present, rank showed `0.000`, Tooltip showed `0.000 小時` |
| Six-state per-machine / aggregate | Passed; 8 cards switched to one backend aggregate result |
| Day same-period and different-period comparison | Passed |
| Week comparison | Passed; seven positions rendered |
| February/March month comparison | Passed; coverage showed 26,880 and 29,760 expected intervals for two machines, with position 31 retained for not-applicable/missing semantics |
| Alert source statuses | Passed; nonempty, confirmed empty, and missing produced three different Chinese messages |
| Alert zero-result filter | Passed; empty state shown and pagination absent |
| Lamp-state modes | Passed; Red and Yellow lists showed accumulated seconds and human-readable bounds |
| Four-file selection, remove one, Preview | Passed; only the remaining three files were Previewed and Preview did not change version total |
| Confirm then historical query | Passed; three active imports were added and a new imported day returned real coverage/ranking |
| Duplicate / invalid / same-day conflict | Passed; displayed `完全重複`, `驗證失敗`, and `同日版本衝突` separately |
| Replacement and rollback | Passed; replacement became batch #11, rollback restored batch #1, and A1 ranking returned to `0.050` |
| 0 / 1 / 4 / 8-file list layout | Passed; 8-file list capped at 300 px with internal scrolling |
| 1280 / 1366 / 1440 px | Passed; home/import/history/events had no horizontal page overflow; import two-column cards remained equal width |
| Browser console | Passed; no warning/error entries in the final inspected tab |

The browser exposed a pre-existing behavior of native date inputs: `fill()` alone changed the DOM value without React state in this driver, while clear + typed input correctly dispatched the user flow. All reported browser results used the latter interaction and were visibly verified.

## Items still requiring human confirmation

1. Run the original private 2025-06-03 workbook through Preview on the target laptop and record its per-file result/request ID. The binary was not available here, so this exact-file claim remains open.
2. Optional visual taste check on the target display for typography density; functional overflow/alignment checks already passed at 1280/1366/1440.

These items do not require a contract or architecture change. Do not begin Stage 6/7 until separately authorized.
