# Stage 5.3 UAT Round 1 — V2.0 Visual Gap Check

Date: 2026-11-15

Authority: `STAGE5_3_UAT_ROUND1_VISUAL_FINAL_APPROVED_SPEC.md` is the only visual implementation authority for this round. The superseded visual implementation spec is not used.

## Reference review

All nine files under `_reference_inputs/stage5_3/` were opened and visually inspected. The reference values, dates, white background, and blue sample palette are treated as illustration only. The approved structure is applied with the existing burgundy/deep-purple tokens and real local-history responses.

| View | Reference structure | Current implementation before this round | Required V2.0 correction |
|---|---|---|---|
| R1 | Solid horizontal bars on one shared zero-based hour axis; machine left and readable duration right | Dark full-width tracks, relative fill, raw decimals, percent share, no true grid/axis title | Rebuild as solid bars with dynamic nice ticks, vertical grid, `累積時數`, human hour/minute labels, focus/hover tooltip, and local dim/highlight |
| R2 | N selected machines → N independent lines; time-aware X labels; hour Y axis; legend below | Generic labels contain long date ranges, fixed five proportional Y ticks, legend above, technical Green axis label, native SVG `<title>` only | Add V2 time-label models, dynamic 0-based scale, bottom legend, shared keyboard/mouse tooltip listing all visible series and coverage, and overlap-safe line/marker styles without jitter |
| R3 machine | One full-width chart containing N stacked 100% rows, sorted by Green share | N separate two-column cards with repeated legends and large metadata blocks | Replace with one legend and one full-width plot; one compact 100% row per machine; inline percentages only when wide enough; row tooltip supplies all values |
| R3 total | One full-width aggregate 100% row | One card occupying the left half of a two-column grid | Use the same full-width plot area with exactly one aggregate row and no unused right column |
| C1 | A/B paired solid bars per machine on one shared scale; readable A→B duration; local highlight | Nested progress tracks, raw three-decimal values, large coverage grids above plot, generic old title | Rebuild paired bars, compact coverage disclosure, dynamic shared scale, human durations, exact `同期加工時數比較` title, A/B dates and comparison tooltip |
| C2 | One card with overall/single switch; exactly two A/B lines; day/week/month adaptive X labels and shared Y scale | Small header control, generic chart title, generic labels, legend above, no shared tooltip | Use approved title/subtitle, wide local switch, machine selector only in single mode, bottom A/B legend, true date/relative labels, shared tooltip and dynamic scale |
| C3 total | Two adjacent full-width 100% rows (A then B) plus Green percentage-point summary | Two independent half-width cards with repeated legends/deltas | One legend, two full-width rows, concise `B 相較 A` Green pp summary, and period/date tooltip |
| C3 machine | Machine groups in one plot; A/B rows adjacent; up to 16 bars | Each machine is another bordered card with two inner cards | One continuous full-width grouped chart sorted by period-B Green share; one legend and compact A/B labels |
| Page hierarchy | Mode/filter then three independent full-width chart cards | Full-width cards exist, but titles include numbering and coverage summary cards dominate chart one | Use exact V2 titles without numbering, right-side mode chips, readable one-line subtitles, parent-controlled 24px gaps, and compact quality status/details |

## Cross-cutting gaps

1. Dynamic ticks currently normalize directly to the raw maximum and show arbitrary decimal labels. V2.0 requires a zero origin, a clean rounded upper bound, and roughly 4–6 main ticks.
2. User-facing accumulated durations currently show raw decimals. V2.0 requires nearest-minute hour/minute text, with positive values below 30 seconds shown as `不足 1 分`.
3. Single-day X labels currently expose complete source strings. V2.0 requires eight visible three-hour labels plus the optional 24:00 boundary while retaining all 48/24 data points.
4. Missing and partial coverage is present in data but not consistently exposed in a common tooltip.
5. Overlapping lines have no operable common readout. V2.0 requires a real tooltip panel plus legend focus/hide behavior; source values must never be jittered.
6. Coverage must remain visible but should become a compact status/disclosure rather than five large metric cells before the primary visual.

This document records the pre-change baseline. Final D01–D10 and VF-01–VF-12 results belong in `STAGE5_3_UAT_ROUND1_VISUAL_ACCEPTANCE.md`.
