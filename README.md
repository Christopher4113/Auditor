# Auditor

Three-seat month-end close for Harbor Lights Festival: a Reconciler agent (Sonnet) proposes entries, a Controller agent (Opus) reviews them against policy and precedent, a human signs off above $5,000. Nothing posts without a review it did not write. Brief and design doc are in the shared drive.

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

Convex env: `npx convex env set ANTHROPIC_API_KEY ...` and `RETRIEVAL_URL`. CRS and Moss credentials go in `retrieval/.env` (copy `retrieval/.env.example`); they are read only by the FastAPI service.

## Branch workflow

1. Branch from `main`: `a/p1-generator`, `b/p1-tools`, `c/p1-schema`, `d/p1-shell`, one branch per component pair.
2. PR into the integration branch `phase-N`. One other person reviews for interface compliance only.
3. All four in → run the gate test together on `phase-N`. Fix there, no new features.
4. Gate passes → merge `phase-N` to `main`, tag `phase-N`, everyone pulls `main` and branches again.
5. Gate still failing at gate time + 1h → merge what passes, carry the broken piece into the next phase.

Gates: Phase 1 Fri ~11 pm (seed loads, fake close runs through the Workflow, rail updates live) · Phase 2 Sat ~3 pm (the moment reproduces; breaks 1, 3, 5 pass) · Phase 3 Sat ~9 pm (all four scenes, scoreboard, Devpost draft). Freeze after 3.
