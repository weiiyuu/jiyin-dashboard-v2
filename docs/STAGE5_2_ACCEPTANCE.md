# Stage 5.2 Acceptance — Excel Data Quality and Import UX

Date: 2026-11-14

Branch: `dev`

Implementation commit: `dca36b7`

Scope: Stage 5.2 only. Historical-processing and event-analysis visual design was not reworked. No Stage 6/7 work, enterprise API call, deployment, push, database deletion, or Docker-volume deletion was performed.

## Decision

Stage 5.2 is accepted for the repository, public synthetic-data, migration, transaction, performance, and real-browser scopes. The importer now separates whether a row can be preserved from whether each metric may participate in statistics. Recognizable nullable source values remain `NULL`; they are never silently converted to zero.

The private 2025-06-01–06-05 workbook set was not available as a complete local set. Equivalent source-quality cases were verified with public synthetic workbooks, but this document does not claim execution of all five original private files.

## Delivered functionality

### Field classes and NULL policy

- Critical identity fields still block the affected file when the source date, timestamp, machine/sensor identity, required semantic dictionary value, or other approved business key cannot be identified reliably.
- Core machine and environment observations may be stored as `NULL`. Eligibility is calculated independently for Green hours, six-state share, transitions, environment average, maximum, median, and minimum.
- Alarm event time and sensor ID remain critical. Missing sensor name, type, rule name, rule condition, current value, or original duration is preserved as `NULL` with an INFO or WARNING issue; no substitute source name or zero duration is invented.
- Missing source quality status is preserved as `NULL` and makes affected statistics ineligible. It is not rewritten as `NORMAL` or another passing state.
- Derived/source-comparison disagreements remain warnings. The importer preserves source columns and does not overwrite the workbook or replace an abnormal observation with a recomputed value.

Evidence: `src/server/import/workbook-parser.ts`, `src/server/import/types.ts`, `docs/DATA_CONTRACT.md`, and `tests/import.test.ts`.

### Deterministic completion, preservation, and isolation

- Automatic processing is limited to deterministic parsing and normalization already defined by the approved six-sheet contract: canonical text trimming, numeric parsing, date/time interval conversion including `24:00`, fingerprints, and eligibility/issue metadata.
- Missing observations are not estimated, interpolated, inferred by AI, or converted to zero.
- A critical, unidentifiable row produces a blocking file-level validation result. Row-level quarantine is explicitly reported as unsupported (`supported: false`, count `0`) rather than pretending that rejected rows were isolated.
- Non-critical missing values and source-confirmed quality problems are saved with traceable issue codes and grouped quality summaries.

### Data-quality model and statistical eligibility

- Quality rule version is now `jiyin-quality-v2`.
- Import acceptance is explicit: `ACCEPT`, `ACCEPT_WITH_WARNINGS`, `INVALID`, or `REVIEW_REQUIRED`.
- Quality levels are distinct: INFO, WARNING, SEVERE, and blocking ERROR. They remain separate from Red/Yellow equipment-state events.
- Preview and Confirm expose both arrival counts and metric-specific eligible-row counts. A 100% imported-row count therefore does not imply that every metric is valid.
- Issues are grouped by source date, source time, rule code, affected objects, metric scope, count, and representative rows. This avoids one notification per missing cell.
- A source-confirmed severe three-minute state-incompleteness signal preserves original seconds but disables Green-hours, six-state-share, and transition eligibility. The 2025-06-04 00:54-shaped synthetic regression verifies this behavior without inventing a global numeric threshold.
- Historical Alarm consumers accept nullable descriptions and use sensor-ID/“not provided” fallbacks. This is the only history UI compatibility adjustment; chart, legend, and filter design was unchanged.

Evidence: `src/server/import/quality-summary.ts`, `src/server/statistics/history-service.ts`, `src/app/history/events/page.tsx`, `tests/import.test.ts`, and `tests/history-service.test.ts`.

## SQLite migration and data safety

Migration v2, `stage5_2_nullable_quality_v2`, rebuilds the affected STRICT tables inside one transaction:

- machine/environment source-quality columns become nullable;
- approved descriptive Alarm columns become nullable;
- validation severity accepts `SEVERE`;
- existing rows are retained with their IDs and batch/version relationships;
- source-confirmed severe rows receive v2 eligibility flags and traceable issue codes;
- indexes, foreign keys, active-batch uniqueness, version activation, and rollback behavior remain intact.

Migration tests verify upgrade from v1 with existing data, nullable insertion, row/batch preservation, migration version/checksum state, idempotency, and rollback on failure. Existing duplicate, replacement, activate/rollback, compare-and-swap, and injected transaction-failure tests remain green. No existing database or volume was deleted during this work.

Evidence: `src/server/db/migrations.ts`, `tests/db.test.ts`, `tests/import.test.ts`, and `tests/stage5-route-flow.test.ts`.

## Import API and UI acceptance

### API behavior

- Preview remains read-only and reports per-file results even when sibling files are invalid.
- Confirm reparses and writes through the existing per-file transaction.
- `DUPLICATE`, `CONFLICT`, and `ACTIVE_VERSION_CHANGED` semantics are unchanged.
- Preview/Confirm responses add backward-compatible quality summaries; existing decision and count fields remain available.
- Client limits are actionable before upload: 8 files, 25 MiB per file, and 50 MiB total. Server preflight limits remain authoritative.

### UI behavior

- The page uses 24px spacing between selection, Preview, and version sections.
- Selection and rules cards align at the top but keep natural independent heights.
- Long selected-file lists and Preview results use bounded internal scrolling.
- Preview is now a batch summary plus a compact per-file list with expandable detail.
- Insert, duplicate, conflict, quality warning, and blocking outcomes are visually distinct.
- Expanded details show source date, row counts, arrival versus metric eligibility, grouped Chinese explanations, counts, examples, raw codes, and representative row numbers.
- Multi-file selection, remove-one, clear-all, loading lockout, duplicate-submit prevention, and version history remain operational.

## Performance measurements

Command: `npm run measure:stage5.2`

Environment: Node v24.18.0, macOS arm64, in-process Next Route Handler, public synthetic `.xlsx`; each workbook contained 3,840 machine rows and 3,840 environment rows. Preview database writes were checked after every run and remained `0`.

| Files | Compressed bytes | HTTP | Elapsed | RSS before | Sampled peak RSS | Preview writes |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 509,919 | 200 | 905.5 ms | 259.7 MiB | 458.3 MiB | 0 |
| 2 | 1,019,841 | 200 | 1,732.5 ms | 460.0 MiB | 520.3 MiB | 0 |
| 4 | 2,039,684 | 200 | 3,520.4 ms | 524.3 MiB | 676.3 MiB | 0 |
| 8 | 4,079,792 | 200 | 9,475.2 ms | 680.6 MiB | 684.8 MiB | 0 |

RSS measurements are samples from one cumulative Vitest process; later baselines include memory retained from earlier fixture generation. They must not be interpreted as isolated per-run deltas. The observed 8-file Preview completed successfully under the approved limits, so no architecture expansion or worker queue was added.

## Automated verification

| Command | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test -- --reporter=dot` | Passed: 77 tests; the opt-in performance suite was skipped in the normal gate |
| `npm run measure:stage5.2` | Passed: 1/2/4/8 full-day Preview measurements and zero database writes |
| `npm run build` | Passed with `next build --webpack`; 18 routes emitted |
| `git diff --check` | Passed |
| tracked sensitive-file and credential-pattern review | Passed; no enterprise Excel/JSON, environment file, SQLite database, log, or credential was added |

High-value regressions cover nullable Alarm descriptions/current value/duration, independent environment metric eligibility, missing source-quality state, preserved NULL versus zero, source-confirmed severe state incompleteness, arrival versus valid-rate summaries, migration v1→v2 preservation, Preview zero writes, mixed valid/duplicate/invalid files, Confirm/replacement/rollback, and active-version consistency.

## Real-browser acceptance

Environment: production build on localhost with a disposable SQLite database and public synthetic workbooks in `/private/tmp`. The temporary server was stopped after verification. No private workbook or enterprise endpoint was used.

| Browser flow | Result |
|---|---|
| No-file state | Passed; selection and version sections have 24px spacing and no horizontal overflow |
| Nullable-quality Preview | Passed; quality-warning file remained confirmable, showed 11 grouped messages, arrival 1/1, Green 1/1, six-state 0/1, environment AVG 1/1 |
| Confirm | Passed; transaction completed and version record showed the active batch and 11 quality messages |
| Duplicate | Passed; same file was classified as one complete duplicate and the Confirm action was disabled |
| Mixed batch | Passed; one new, one duplicate, and one blocking file all remained visible; the valid sibling was not discarded |
| Eight-file selection | Passed; selected list scrolled internally while the rules card retained natural height |
| Eight-file Preview | Passed; eight results, 460px result viewport, 573px scroll content, no Preview writes |
| 1280 / 1366 / 1440px | Passed; no page-level horizontal overflow, controls remained usable, cards remained aligned/readable |
| Browser console | Passed; no final warning or error entries |

## Known limits and human follow-up

1. Run the original private 2025-06-01–06-05 workbooks in an isolated local environment if available. The complete private set was not present, so exact-binary verification remains unclaimed.
2. Row-level quarantine is deliberately not implemented. A row missing critical identity/time information blocks its file; this is safer than mixing an unidentifiable row into active statistics and matches the approved minimum design.
3. RSS figures are cumulative-process samples, not process-isolated benchmarks. Re-run with isolated processes only if a future operational limit requires memory certification.
4. Historical-processing and event-analysis final visual design remains with the team and was intentionally left outside Stage 5.2.

Stage 5.2 work stops here. Stage 6/7 and any push require separate authorization.
