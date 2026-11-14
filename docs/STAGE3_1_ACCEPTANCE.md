# Stage 3.1 Acceptance

> Scope: corrective implementation and formal acceptance of Stage 0–4. This review does not authorize or implement Stage 5 UI.

## Conclusion

Stage 0–4 can now be formally accepted for the approved single-computer architecture. The data-correctness blockers identified in `STAGE3_ACCEPTANCE_REVIEW.md` have executable regression coverage and pass against isolated SQLite databases. Stage 5 may start after this document is reviewed.

The remaining Stage 6–8 work is explicitly outside this acceptance: real Enterprise Collector transport/schema integration, complete Live Sensor queries, and production Docker deployment/operational validation. No enterprise API was called and no private workbook was added to Git.

## Required fixes and evidence

| # | Result | Implementation evidence | Test evidence |
|---:|---|---|---|
| 1 | Complete | `src/server/import/workbook-parser.ts` validates real dates, three-minute source start/end text (including 24:00), machine/area identity, README date/counts, dictionary semantics, source formulas, quality status and numeric quality conditions. | `tests/import.test.ts`: interval/identity blocking, invalid date, 24:00, derived mismatch and dictionary semantic/version cases. |
| 2 | Complete | Parser emits blocking `ERROR` only for unsafe structure/identity/time/date/semantic cases; source numeric values and exception tokens remain unchanged. Warnings drive metric-specific eligibility instead of rewriting data. | `tests/import.test.ts`: NULL/0/Await preservation, negative value preservation, empty `quality_issues`, Green-versus-six-state eligibility. `tests/private-excel-contract.test.ts` compares persisted source fields with parsed source fields. |
| 3 | Complete | `inspectImportDecision` returns `INSERT`, `DUPLICATE` or `CONFLICT` plus active/duplicate batch IDs. `/api/imports/preview` returns these values without creating a batch. | `tests/import.test.ts`: preview decision progression and unchanged batch count. |
| 4 | Complete | Confirm and activate both compare the current active batch with the previewed/current ID and throw stable `ACTIVE_VERSION_CHANGED` on mismatch. No login, lock server or multi-user subsystem was added. | `tests/import.test.ts`: stale confirm and stale activate rejection, followed by successful matching-ID operations. |
| 5 | Complete | One `BEGIN IMMEDIATE` transaction contains metadata, issues, all four history tables, old/new active changes and event audit. Fault injection is available after every material stage. | `tests/import.test.ts`: replacement failures after metadata, machine, environment, Alarm, quality, old-active, new-active and event; full old batch/event/metadata/issue/history graph remains byte-for-byte equivalent at the selected columns. |
| 6 | Complete | `persistSuccessfulValues` requires both start and current mode to be `LIVE`. Empty reading sets end as `FAILED/NO_READINGS_PERSISTED`; neither DEMO nor empty results insert endpoint success/readings. | `tests/db.test.ts`: DEMO rejection, zero saved reading failure, mode revision discard, MANUAL_TEST separation. |
| 7 | Complete | Green/state and bucket aggregates return `null` plus `MISSING_DATA` when there is no eligible observation; an eligible numeric zero stays zero and `AVAILABLE`. | `tests/statistics.test.ts`: missing versus true zero, quality-rule mismatch. `tests/history-service.test.ts`: selected machine without active eligible rows remains null in ranking/trend. |
| 8 | Complete | `history-service.ts` reads only active batches and supplies range ranking/trend/state share/coverage, day/week/month comparison, status runs/hours, Alarm source coverage, stable paginated Alarm rows and active-version filtering. Canonical GET routes are `/api/history/processing` and `/api/history/events`. | `tests/history-service.test.ts`: active replacement, eligible state share, independent period totals, week missing position, February/March not-applicable positions and 26,880/29,760 expectations, Alarm missing/empty/nonempty and replaced-row exclusion. |
| 9 | Complete | Import write routes require same-origin localhost `Origin`, reject incompatible Fetch Metadata, enforce 25 MiB per XLSX, 50 MiB/10 files per preview and 4 KiB activate JSON, revalidate SHA/canonical fingerprints, and map internal failures to stable safe responses. Canonical routes use `/api/imports/*`; old singular routes remain compatibility aliases. | `tests/http-security.test.ts`: localhost/same-origin acceptance, missing/cross-origin/non-local rejection and internal error redaction. `tests/import.test.ts`: fingerprint/active transaction behavior and XLSX preflight limits. |
| 10 | Complete | Main tests use the committed synthetic workbook builder in `tests/fixtures/standardized-workbook.ts`; no private file is required for the core suite. | 55 passing tests. The local private contract test is additional and optional, and now checks field mapping/statistical content rather than only row counts. |

## Acceptance cases added in Stage 3.1

- Source interval text must match the date/time label and exactly 180 seconds; invalid identity or calendar date blocks preview.
- A source-derived mismatch warns while preserving the original derived value.
- Negative values remain stored; only affected metric eligibility is removed.
- Dictionary semantic removal blocks confirm; a semantically compatible version-name change warns.
- Preview distinguishes insert, exact duplicate and same-day conflict and reports the active batch.
- Stale confirm/activate active IDs return `ACTIVE_VERSION_CHANGED`.
- Failure after each replacement write/switch/audit stage rolls back all new rows and preserves the old active graph.
- DEMO never writes readings; an empty LIVE result cannot be collection success.
- Ineligible/missing Green is null while an eligible zero is zero.
- Active DB results cover ranking, trend, state share, selected-machine coverage, day/week/month alignment and Alarm source/event semantics.
- Replaced machine and Alarm rows are excluded from active queries.
- Private-workbook validation (when locally present) verifies source field persistence and calculated Green totals in addition to counts.
- Import mutations reject non-local/cross-origin requests and do not expose SQLite paths/messages.

## Verification result

| Command | Result |
|---|---|
| `npm test` | Passed: 55 tests, 9 files |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed with the approved Webpack build path |

## Deferred to Stage 6–8

- Real Enterprise API network, authentication, TLS, retry and response-schema validation.
- Complete Live Sensor latest/history query integration and operational collection scheduling.
- Production Docker image/deployment, restart/recovery, retention and volume backup exercises.

These deferred items do not alter Excel history semantics and do not block Stage 5 historical/import UI development. Stage 5 must consume the established APIs and preserve null/availability/coverage semantics rather than recomputing statistics in the browser.
