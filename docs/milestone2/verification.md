# Local verification — November 1, 2026

All checks below ran on the `Deep` checkout. No shared deployment was reset or
updated, and no external messages, controller approvals or postings were made.

| Check | Actual result |
| --- | --- |
| `corepack pnpm install --frozen-lockfile` | Passed, no lockfile changes |
| `corepack pnpm data:test` | 33 tests passed |
| `corepack pnpm retrieval:test` | 39 tests passed |
| `corepack pnpm test` | 266 tests across 21 files passed |
| `uv run --project retrieval python -m unittest discover -s evaluation/milestone2 -p 'test_*.py' -v` | 3 evaluator tests passed; includes isolated actual HTTP evaluation |
| `corepack pnpm exec tsc -p convex` | Passed |
| `corepack pnpm --filter web exec tsc -b` | Passed |
| `corepack pnpm --filter web build` | Passed |
| Retrieval pilot | 72 executions, zero errors; per-example evidence in `evaluation/milestone2/results/results.json` |
| Report artifacts | PDF verified as 8 letter-size pages; all 8 pages rendered and visually reviewed; DOCX contains 7 explicit page breaks, 2 figures and 5 external contribution links |
| Evidence integrity | All source and dataset SHA-256 hashes match the recorded evaluation manifest |

Total automated tests: **341**. These tests do not measure full-system agent
accuracy. The scoring tests use explicitly synthetic oracle decisions.

Environment note: `corepack pnpm typecheck` passed its Convex stage but then
failed with exit 127 because its nested bare `pnpm` command was absent from PATH.
Both stages passed via the direct Corepack commands above. The existing README
recommends `corepack enable pnpm`; this verification did not modify global shims.

The artifact build uses the provided DOCX template and common report content for
the Word/PDF/Markdown versions. Automatic Word pagination could not be verified:
Microsoft Word returned an AppleEvent timeout. Its editable DOCX has the same
eight content sections/pages separated by explicit page breaks, but Word layout
may differ from the verified eight-page PDF. The source template is unchanged.
