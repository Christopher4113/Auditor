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

Group A's data/retrieval commands: [current data contract and Convex handoff](datagen/README.md), [10-transaction Phase 1 sample](datagen/sample.seed.json), [retrieval runbook](retrieval/README.md), and [historical Phase 1 verification](datagen/AUDIT.md). Run `pnpm data:generate`, `pnpm data:validate`, `pnpm data:test`, and `pnpm retrieval:test` from the root. Generation and offline validation require Python/uv; no API credentials or running services.

Convex env: `npx convex env set ANTHROPIC_API_KEY ...` and `RETRIEVAL_URL`; `ANTHROPIC_MODEL` swaps Sonnet for Opus. CRS and Moss credentials go in `retrieval/.env` (copy `retrieval/.env.example`); they are read only by the FastAPI service.

## Group A Phase 3

A5 scoring and Impact, A6 counters, scoped reset/re-index and CRS sandbox verification are implemented on `Deep`: [Phase 3 runbook and API handoff](retrieval/PHASE3.md). Start with `pnpm scoring:demo` and `pnpm retrieval:phase3:moss`. The scorer self-check is explicitly synthetic; live results come from `pnpm scoring:report` after the team deploys the current Convex functions and loads the dataset. CRS uses the hackathon's `/transunion/identity-manager-verification/basic` default-config route and P01–P20 personas. Live P01 verification and P12 mismatch/enrichment have been checked; no Postman config is needed. Errors still fail closed.

## The six planted breaks

**Group A Phase 2 is implemented:** [data contract and accounting assumptions](datagen/README.md), [real Moss/local retrieval and run commands](retrieval/README.md), and [verification record](retrieval/PHASE2_AUDIT.md). `pnpm data:generate` now defaults to schema 2.0.0: six break families, 11 period-specific cases, 368 bank rows, imported books and dated source documents. `pnpm data:phase1` retains the clean generator. `pnpm retrieval:demo` runs an isolated local-search rehearsal; `pnpm retrieval:demo:moss` uses the real supplied Moss project. Rehearsal human decisions are explicitly labelled fixtures; the full team gate still requires the real close and controller flow.

Phase 2 adds these six planted breaks to ~120 clean transactions a month so precision and recall can be measured. Amounts and clauses are in the brief; A3 supplies the answer key in `seed.json`. The Phase 1 sample has empty `breaks` and `answerKey` arrays. Detection/scoring results require the integrated agent and scoring run.

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

## Phase 1 gate: run it end to end

Historical procedure for the `phase-1` tag. The current branch has the real B3 agent; use the Phase 2 runbooks above for current data/retrieval checks.

Gate: `seed.json` loads; a fake close runs through the Workflow; the rail updates live. Four terminals from the repo root.

```bash
pnpm install && (cd datagen && uv sync --locked) && (cd retrieval && uv sync --locked)
```

**1. Lane checks, no services needed.** Group A's generator and validator, Group B's tool and fake tests, the retrieval contract, both typechecks.

```bash
pnpm data:generate && pnpm data:validate && pnpm data:test && pnpm retrieval:test && pnpm test && pnpm typecheck
```

**2. Backend up.** Pushes `convex/` to the dev deployment and keeps it synced; writes `.env.local`.

```bash
pnpm dev:convex
```

**3. Seed.** Wipes the entity and loads a file in one transaction. The sample has 10 transactions across July–September; the generated file has 360.

```bash
SEED=datagen/sample.seed.json pnpm seed
```

**4. Frontend up.** With `CONVEX_URL` in `.env.local` the rail is live; without it the app runs on fixtures.

```bash
pnpm dev:web
```

Open http://localhost:5173 on this machine and on a second device on the same network (`pnpm dev:web -- --host`). Pick September 2026.

**5. Run the close.** From the UI: Close summary drawer → "Prepare September close". Or from a terminal:

```bash
npx convex run api:startClose '{"entity":"eo-festival-nyc","period":"2026-09"}'
```

Within seconds the rail shows three September proposals on both screens with no refresh: Apex Staging $13,600 posted with Group B's canned entry (Dr 1000 / Dr 5160 / Cr 1200), three verbatim citations and the discarded first read; the Stripe payout and the office-supply payment posted under threshold.

**6. Prove the data trigger.** Inject a bank transaction; the Workflow picks it up and a new row appears at the top of the rail.

```bash
npx convex run close:ingestBankTransaction '{"entity":"eo-festival-nyc","period":"2026-09","txnId":"gate-01","date":"2026-09-29","amount":-45000,"counterparty":"Ridgeway Freight","memo":"Gate test","source":"bank","actor":"inject"}'
```

**7. Prove the 8.1 gate.** Take a proposal and decision id from the rail (or the dashboard) and post as the agent; it is refused and the denial is in the audit log.

```bash
npx convex run --inline-query 'const p = await ctx.db.query("proposals").withIndex("by_entity_proposalId", q => q.eq("entity","eo-festival-nyc").eq("proposalId","P-sample-bank-10-r1")).unique(); const d = await ctx.db.query("decisions").withIndex("by_proposal", q => q.eq("proposalId", p._id)).first(); return {proposalId: p._id, decisionId: d._id};'
npx convex run ledger:postEntry '{"caller":"agent","proposalId":"<proposalId>","decisionId":"<decisionId>"}'
npx convex run api:auditTrail '{"entity":"eo-festival-nyc","period":"2026-09","limit":5}'
```

**Observability.** Every unit of work (one bank transaction's journey) carries a correlation id, `T-<txnId>`, minted at seed or ingest and inherited by the break, proposals, decisions, journal entry, corrections and every audit row. `audit()` resolves it from any id on the chain, so a tool only has to pass the id it has. Sidecar calls send it as `X-Trace-Id`. The trace view is one indexed query, by trace id or by a proposal's code:

```bash
npx convex run api:trace '{"entity":"eo-festival-nyc","proposalId":"P-sample-bank-01-r1"}'
```

The Convex dashboard adds function logs, table data, schedules and the Workflow component's step status; the audit log is the durable, product-facing record.

**Judges' scenarios and the forbidden call (Phase 3, C5/C6).** The Inject drawer calls `inject.injectBankTransaction`, `inject.amendContract` (indexed into Moss, the period's close re-runs) and `inject.changeVendorBank` (rule 4.3: hold, verify_payee via CRS, escalate; the controller answers with `inject.decideVendorHold`). `inject.resetAll` wipes and reseeds from the last loaded seed. The Permissions drawer reads `api.listRules` (every rule with kind, fired and failed counts, the three tool lists, denials) and its "make the agent post" button calls `api.attemptAgentPost`, which is refused server-side with the 8.1 reason and logged. `api.traceSummary` tells one unit of work in plain English from the audit rows; `api.indexTraces` pushes those summaries to Moss so Ask Auditor can search the log (supported by the sidecar's separate `events` collection).

```bash
npx convex run inject:changeVendorBank '{"entity":"eo-festival-nyc","vendorId":"field-flame","newLast4":"8832","source":"email"}'
npx convex run api:attemptAgentPost '{"entity":"eo-festival-nyc","proposalId":"P-sample-bank-10-r1"}'
```

**Reading the backend directly.** `api:listProposals`, `api:scoreboard`, `api:closeStatus --watch`, `api:auditTrail`; the dashboard (https://dashboard.convex.dev/d/wary-labrador-928) shows every table and the Workflow component's step log.

**How the lanes connect.** A's `seed.json` → `convex/seed.ts` (interface 5). The Workflow in `convex/close.ts` runs fetch → reconcile → propose → review → post; `convex/agent.ts` and `convex/controls.ts` are B's entry points and use B2's `agent/fake.ts` canned Apex proposal (interface 2). `convex/api.ts` is what the UI subscribes to; `web/src/data/live.ts` maps rows into D's `Proposal` view model (interface 3). `ledger.postEntry` is the only writer of `journalEntries` and refuses the proposer's identity. Every step writes `auditLog` under its seat.

## Branch workflow

1. Branch from `main`: `a/p1-generator`, `b/p1-tools`, `c/p1-schema`, `d/p1-shell`, one branch per component pair.
2. PR into the integration branch `phase-N`. One other person reviews for interface compliance only.
3. All four in → run the gate test together on `phase-N`. Fix there, no new features.
4. Gate passes → merge `phase-N` to `main`, tag `phase-N`, everyone pulls `main` and branches again.
5. Gate still failing at gate time + 1h → merge what passes, carry the broken piece into the next phase.

Phase 1 pairs (first one unblocks a teammate): A2 seed schema + sample → A1 generator · B1 tool schemas + identities → B2 fake agent + stub rules · C1 schema + seed function → C2 Workflow skeleton + audit log + data trigger · D1 shell + tokens + entity switcher → D2 rail on fixtures.

Gates: Phase 1 Fri ~11 pm (`seed.json` loads, a fake close runs through the Workflow, rail updates live) · Phase 2 Sat ~3 pm (the moment reproduces on demand; breaks 1, 3, 5 pass; citations verbatim) · Phase 3 Sat ~9 pm (scenes 1–4 work, scoreboard and Impact panel score the key, Devpost draft in). Freeze after 3. Sun 8 am reset prod and rehearse; Devpost 9:00 AM.
