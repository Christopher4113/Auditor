# Auditor

The cash accounting function for one entity of an event-management group, Experts Only Festival NYC (fiscal periods July–September 2026; every number is fictitious). Three seats: one Claude Sonnet **staff accountant** agent that reconciles bank to books, retrieves precedent, policy and its own corrections through Moss, and proposes entries with verbatim citations; a **controls engine written in TypeScript** (balance, citation, P&L threshold, 4.3 bank-detail hold with CRS payee check, period lock, revision cap, precedent exception, correction check) that posts routine entries and escalates the rest; and a **human controller** who approves or rejects with an instruction and signs the period. The agent cannot post, enforced server-side in `post_entry`, not in a prompt. Source of truth: `Auditor — Cal Hacks 13.0 Brief v2 (final design).pdf` and `Auditor — Design.pdf` in the shared drive.

## Seats

| Seat | Who | Does | Cannot |
|---|---|---|---|
| Staff accountant | One Claude Sonnet agent | Investigate unmatched transactions, retrieve precedent, policy and past corrections, propose balanced entries with verbatim citations, ask the human a question | Post, approve, change policy |
| Controls | TypeScript rules, no model | Validate every proposal; post under pre-approved policy when every rule passes; hold payments on bank-detail changes (4.3); verify payees via CRS; lock closed periods; escalate the rest | Propose, override the human |
| Controller | Human (Christopher in the demo) | Approve or reject escalations with an instruction; sign the period close | Nothing it did not review |

Who may call which tool is the `TOOLS` map in `convex/tools.ts`. Materiality is P&L impact: under $5,000 with every rule passing and a clause cited may post; $5,000 or more, or any control exception, goes to the controller. A human-decided precedent with matching `precedentScope`, under threshold, is pre-approved and does not re-escalate (8.2).

## What runs where

Convex is the center: tables, the close as a durable Workflow (time and data triggers, no run button), the agent (Agent component, typed tool calls, prompt caching) and the controls engine all live there. Vite is the window into it; every view is a reactive query. FastAPI is a sidecar Convex calls for Moss retrieval (`/index`, `/query`, `/stats`) and CRS payee verification (`/verify`, fails closed). A code matcher (exact amount, same counterparty, within N days) closes ~85% of bank transactions with no model call; only unmatched items reach Sonnet, about 8–15 proposals a month.

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

Group A's Phase 1 is ready to consume: [data contract and Convex handoff](datagen/README.md), [10-transaction sample](datagen/sample.seed.json), [retrieval stub guide](retrieval/README.md), and [verification record](datagen/AUDIT.md). Run `pnpm data:generate`, `pnpm data:validate`, `pnpm data:test`, and `pnpm retrieval:test` from the root. Generation and validation require Python/uv; no API credentials or running services.

Convex env: `npx convex env set ANTHROPIC_API_KEY ...` and `RETRIEVAL_URL`; `ANTHROPIC_MODEL` swaps Sonnet for Opus. CRS and Moss credentials go in `retrieval/.env` (copy `retrieval/.env.example`); they are read only by the FastAPI service.

## The six planted breaks

Phase 2 adds these six planted breaks to ~120 clean transactions a month so precision and recall can be measured. Amounts and clauses are in the brief; A3 supplies the answer key in `seed.json`. Phase 1 has empty `breaks` and `answerKey` arrays and does not claim detection or scoring results yet.

| # | Month | Break | Right answer | Who decides |
|---|---|---|---|---|
| 1 | Jul, recurs | Stripe pays weekly net of fees ($48,600 gross, $47,180 deposit) | Match payout to charges; book $1,420 processing fees | Human first time, precedent after |
| 2 | Jul | SoundWave invoice SW-1042 arrives twice ($18,500) | Void the duplicate | Human (control exception) |
| 3 | Jul | $60,000 headliner deposit; artist cancels; bank returns $51,000 | Clear receivable; expense $9,000 under 5.1 (D-0417) | Human |
| 4 | Aug | Sponsor amended to $30,000 + $2/attendee; ledger still ratable on $50,000 | Catch-up in Aug; variable fee in Sept, capped at $70,000 | Human |
| 5 | Sept | Field & Flame bank-detail change Sept 10; $42,000 due Sept 15 | Hold on the change; CRS verify; escalate same day; payment parked in 1400 | Human (control exception) |
| 6 | Aug → Sept | Ironclad site setup Aug 30–31; $9,400 invoice arrives Sept 8 | Accrue in Aug (7.1); reverse in Sept and book AP | Human |

The moment (opens the video): Apex's $16,000 deposit comes back as $13,600 on Sept 25. The agent retrieves D-0417, Apex clause 9.4 and policy 5.1, proposes the $2,400 as inspection-fee expense with three verbatim citations, the engine posts it under threshold and indexes D-0625.

## Demo

July and August are pre-run so their decisions sit in Moss; September runs live in under three minutes. The only touch is "prepare September close" in the Scoreboard drawer. Scenes: 1 the moment · 2 the no (Field & Flame hold, CRS check, human keeps the hold) · 3 the forbidden call (Permissions drawer, `post_entry` under the agent's identity refused, denial logged) · 4 Ask Auditor out loud (Moss) · 5 asked once (Stripe fees, escalations 5 → 2 → 1) · 6 learned from a mistake (SoundWave duplicate, repeat mistakes 0). Scenes 1–4 required. Judges can inject a bank transaction, a contract amendment or a vendor bank change from the Inject drawer.

Cut order if behind, from the bottom: core (generator, Workflow, agent, controls engine, dashboard, approvals, scoreboard, Moss citations) → injector and forbidden call → corrections store and repeat-mistakes counter → breaks 2, 4, 6 → Ask Auditor voice → second entity (UK, GBP).

## Running the close (Group C, Phase 1)

```bash
pnpm dev:convex                                   # push convex/ and watch
SEED=datagen/sample.seed.json pnpm seed           # wipe + load an entity (default SEED=datagen/seed.json from pnpm data:generate)
npx convex run api:startClose '{"entity":"eo-festival-nyc","period":"2026-09"}'
npx convex run api:listProposals '{"entity":"eo-festival-nyc","period":"2026-09"}'
```

The Workflow (`convex/close.ts`) runs fetch → reconcile → propose → review → post; every step writes `auditLog` under its seat's identity. A bank transaction arriving through `close.ingestBankTransaction` starts a close for its period within seconds (the data trigger). `ledger.postEntry` is the only writer of `journalEntries` and refuses the proposer's identity (8.1) with the denial logged. `convex/agent.ts` and `convex/controls.ts` are Group B's files with Phase 1 stub bodies: keep the signatures, replace the bodies (B2 canned Apex, then B3/B4).

## Branch workflow

1. Branch from `main`: `a/p1-generator`, `b/p1-tools`, `c/p1-schema`, `d/p1-shell`, one branch per component pair.
2. PR into the integration branch `phase-N`. One other person reviews for interface compliance only.
3. All four in → run the gate test together on `phase-N`. Fix there, no new features.
4. Gate passes → merge `phase-N` to `main`, tag `phase-N`, everyone pulls `main` and branches again.
5. Gate still failing at gate time + 1h → merge what passes, carry the broken piece into the next phase.

Phase 1 pairs (first one unblocks a teammate): A2 seed schema + sample → A1 generator · B1 tool schemas + identities → B2 fake agent + stub rules · C1 schema + seed function → C2 Workflow skeleton + audit log + data trigger · D1 shell + tokens + entity switcher → D2 rail on fixtures.

Gates: Phase 1 Fri ~11 pm (`seed.json` loads, a fake close runs through the Workflow, rail updates live) · Phase 2 Sat ~3 pm (the moment reproduces on demand; breaks 1, 3, 5 pass; citations verbatim) · Phase 3 Sat ~9 pm (scenes 1–4 work, scoreboard and Impact panel score the key, Devpost draft in). Freeze after 3. Sun 8 am reset prod and rehearse; Devpost 9:00 AM.
