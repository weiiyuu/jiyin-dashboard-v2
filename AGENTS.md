# Repository working rules

- This repository root is the only writable product workspace. Never modify the legacy project, `test_api`, or `_reference_inputs`.
- The design truth is `docs/DATA_CONTRACT.md`, `docs/DATABASE_DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/FEATURE_SPEC.md`, then `docs/IMPLEMENTATION_PLAN.md`.
- Never commit enterprise Excel/JSON, credentials, environment files, databases, logs, or private replay data.
- Do not call enterprise APIs in tests. Use synthetic fixtures and temporary databases.
- Before a local commit run the relevant tests plus `npm run typecheck`, `npm run lint`, and `npm run build`.
- Do not push, deploy, delete databases/volumes, or run destructive Git commands without explicit authorization.
