# Auditor

The cash accounting function for one entity of an event-management group, Experts Only Festival NYC (fiscal periods July–September 2026; every number is fictitious). Three seats: one Claude Sonnet **staff accountant** agent that reconciles bank to books, retrieves precedent, policy and its own corrections through Moss, and proposes entries with verbatim citations; a **controls engine written in TypeScript** (balance, citation, P&L threshold, 4.3 bank-detail hold with CRS payee check, period lock, revision cap, precedent exception, correction check) that posts routine entries and escalates the rest; and a **human controller** who approves or rejects with an instruction and signs the period. The agent cannot post, enforced server-side in `post_entry`, not in a prompt. Source of truth: `Auditor — Cal Hacks 13.0 Brief v2 (final design).pdf` and `Auditor — Design.pdf` in the shared drive.

## Layout

| Dir | Owner | What |
|---|---|---|
| `convex/` | C | 13 tables (all with `entity`), Workflow (the close), Agent component, controls engine, audit log. Root-level so `convex dev` runs from the repo root. |
| `web/` | D | Vite + React + Tailwind + shadcn (dark). Rail, sources, decision panel, four drawers. Reads `../convex/_generated`. |
| `datagen/` | A | Seeded Python generator → `seed.json` (gitignored). |
| `retrieval/` | A | FastAPI sidecar: Moss retrieval (`/index`, `/query`, `/stats`) and CRS `/verify`. |

## Interface files (agreed Friday night, then nobody forks them)

| # | Between | File |
|---|---|---|
| 1 | A → B | `retrieval/openapi.yaml` (regenerate from `retrieval/main.py`, see its docstring) |
| 2 | B ↔ C | `convex/schema.ts` + `convex/tools.ts` (table types, tool schemas, the three identities and who may call what) |
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

Convex env: `npx convex env set ANTHROPIC_API_KEY ...` and `RETRIEVAL_URL`; `ANTHROPIC_MODEL` swaps Sonnet for Opus. CRS and Moss credentials go in `retrieval/.env` (copy `retrieval/.env.example`); they are read only by the FastAPI service.

## Branch workflow

1. Branch from `main`: `a/p1-generator`, `b/p1-tools`, `c/p1-schema`, `d/p1-shell`, one branch per component pair.
2. PR into the integration branch `phase-N`. One other person reviews for interface compliance only.
3. All four in → run the gate test together on `phase-N`. Fix there, no new features.
4. Gate passes → merge `phase-N` to `main`, tag `phase-N`, everyone pulls `main` and branches again.
5. Gate still failing at gate time + 1h → merge what passes, carry the broken piece into the next phase.

Phase 1 pairs (first one unblocks a teammate): A2 seed schema + sample → A1 generator · B1 tool schemas + identities → B2 fake agent + stub rules · C1 schema + seed function → C2 Workflow skeleton + audit log + data trigger · D1 shell + tokens + entity switcher → D2 rail on fixtures.

Gates: Phase 1 Fri ~11 pm (`seed.json` loads, a fake close runs through the Workflow, rail updates live) · Phase 2 Sat ~3 pm (the moment reproduces on demand; breaks 1, 3, 5 pass; citations verbatim) · Phase 3 Sat ~9 pm (scenes 1–4 work, scoreboard and Impact panel score the key, Devpost draft in). Freeze after 3. Sun 8 am reset prod and rehearse; Devpost 9:00 AM.
