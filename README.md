# Auditor

Month-end cash close for Experts Only Festival NYC: one staff accountant agent proposes entries with citations, a TypeScript controls engine reviews them, and a human controller handles exceptions and signs the period. Every financial number, vendor, and contract in the demo is fictitious. The final v2 brief and design doc are in the shared drive.

## Layout

| Dir | Owner | What |
|---|---|---|
| `convex/` | C | Tables, Workflow, Agent component, audit log. Root-level so `convex dev` runs from the repo root. |
| `web/` | D | Vite + React + Tailwind + shadcn (dark). Reads `../convex/_generated`. |
| `datagen/` | A | Seeded Python generator → `seed.json` (gitignored). |
| `retrieval/` | A | FastAPI sidecar: Moss retrieval (`/index`, `/query`, `/stats`) and CRS `/verify`. |

## Interface files (agreed Friday night, then nobody forks them)

| # | Between | File |
|---|---|---|
| 1 | A → B | `retrieval/openapi.yaml` (regenerate from `retrieval/main.py`, see its docstring) |
| 2 | B ↔ C | `convex/schema.ts` + `convex/tools.ts` |
| 3, 4 | C → D | `convex/api.ts` |
| 5 | A → C | `datagen/seed.schema.json` |

## Setup

```bash
corepack enable pnpm && pnpm install
pnpm dev:convex          # first run logs in and creates the dev deployment; writes .env.local
pnpm dev:web             # http://localhost:5173
pnpm dev:retrieval       # http://localhost:8000/docs
cd datagen && uv run generate.py
```

Group A's Phase 1 is ready to consume: [data contract and Convex handoff](datagen/README.md), [10-transaction sample](datagen/sample.seed.json), and [retrieval stub guide](retrieval/README.md). Run `pnpm data:generate`, `pnpm data:validate`, and `pnpm data:test` from the root. Generation and validation require Python/uv; no API credentials or running services.

Convex env: `npx convex env set ANTHROPIC_API_KEY ...` and `RETRIEVAL_URL`. CRS and Moss credentials go in `retrieval/.env` (copy `retrieval/.env.example`); they are read only by the FastAPI service.

## Branch workflow

1. Branch from `main`: `a/p1-generator`, `b/p1-tools`, `c/p1-schema`, `d/p1-shell`, one branch per component pair.
2. PR into the integration branch `phase-N`. One other person reviews for interface compliance only.
3. All four in → run the gate test together on `phase-N`. Fix there, no new features.
4. Gate passes → merge `phase-N` to `main`, tag `phase-N`, everyone pulls `main` and branches again.
5. Gate still failing at gate time + 1h → merge what passes, carry the broken piece into the next phase.

Gates: Phase 1 Fri ~11 pm (seed loads, fake close runs through the Workflow, rail updates live) · Phase 2 Sat ~3 pm (the moment reproduces; breaks 1, 3, 5 pass) · Phase 3 Sat ~9 pm (all four scenes, scoreboard, Devpost draft). Freeze after 3.
