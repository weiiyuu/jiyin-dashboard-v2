# Repository working rules

- This repository root is the only writable product workspace. Never modify the legacy project, `test_api`, or `_reference_inputs`.
- The design truth is `docs/DATA_CONTRACT.md`, `docs/DATABASE_DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/FEATURE_SPEC.md`, then `docs/IMPLEMENTATION_PLAN.md`.
- Before changing UI layout, tables, charts, or shared visual components, read `docs/UI_LAYOUT_AND_ACCEPTANCE_GUIDELINES.md`.
- An approved page-specific design and acceptance criteria take priority over the shared UI guidelines; apply the shared rules only where they fit.
- UI guideline work does not authorize backend contract changes or broad refactors of existing pages.
- Never commit enterprise Excel/JSON, credentials, environment files, databases, logs, or private replay data.
- Do not call enterprise APIs in tests. Use synthetic fixtures and temporary databases.
- Before a local commit run the relevant tests plus `npm run typecheck`, `npm run lint`, and `npm run build`.
- Do not push, deploy, delete databases/volumes, or run destructive Git commands without explicit authorization.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
