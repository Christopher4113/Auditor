# Auditor

Auditor runs the cash accounting close for one entity of an event-management group. One Claude agent proposes the entries, a controls engine written in code reviews every one of them, and a human controller decides the exceptions and signs the period. Nothing posts without a review it did not write, and that is enforced on the server, not in a prompt.

The demo entity is modelled on Coachella (Goldenvoice / AEG; public shape in `datagen/public/coachella.json`) with fiscal periods July–September 2026. Every financial number is fictitious. Live demo: https://auditor-nine-ecru.vercel.app

## The three seats

| Seat | Who | Does | Cannot |
|---|---|---|---|
| Staff accountant | One Claude Sonnet agent | Investigates unmatched bank transactions, retrieves precedent, policy and its own past corrections through Moss, proposes balanced entries with verbatim citations, asks the controller a question when unsure | Post, approve, change policy |
| Controls | TypeScript rules, no model | Checks every proposal: balance, citations resolve verbatim, P&L threshold, bank-detail hold with CRS payee verification, period lock, revision cap, precedent exception, correction check. Posts routine entries, escalates the rest | Propose, override the human |
| Controller | A human | Approves or rejects with an instruction, keeps or releases vendor holds, signs the period | Nothing it did not review |

Materiality is P&L impact: under $5,000 with every rule passing and a clause cited may post; $5,000 or more, or any control exception, goes to the controller. A human approval becomes precedent the agent cites and the engine honors, so the same case escalates once. A rejection becomes a correction the agent must address next time.

## How a close runs

1. A bank transaction arrives from the seed, the scheduled period advance, or an injection. The close for its period starts as a durable Convex Workflow within seconds.
2. A code matcher (exact amount, same counterparty, within a few days) closes most transactions against the ledger with no model call. The rest become breaks.
3. For each break the agent retrieves, proposes an entry with citations, and records the first read it discarded. Each step runs under its seat's identity.
4. The engine runs every rule and writes a decision plus an audit row per rule. Pass: posts under policy and indexes the decision as precedent. Return: the agent revises, up to the cap. Escalate: it waits for the controller.
5. The controller decides from the Review inbox. Approval posts under the human identity and records the precedent scope. Rejection stores the instruction as a correction and the agent re-proposes.
6. Signing snapshots entries, carried items and the trial balance, locks the period, and schedules the next period's advance.

Every unit of work carries a trace id from the bank transaction through proposals, decisions, the journal entry, the sidecar calls and the human's decision. The trace is readable as a timeline and in plain English, and it is indexed into Moss so Ask Auditor can answer questions from the audit trail itself.

## Architecture

- **Convex** holds the tables, the Workflow, the agent, the controls engine and the audit log. The agent is the Agent component with typed tool calls; the close is the Workflow component with time and data triggers.
- **Vite + React** dashboard: one screen with the proposal rail, sources and decision panel, and drawers for the Review inbox, close summary, permissions, scenario injection and Ask Auditor. Every view is a reactive query.
- **FastAPI sidecar**: Moss retrieval over policy, contracts, decisions, corrections and audit events; CRS payee verification against the TransUnion TruValidate sandbox with the full report (identity, fraud score, criminal, public records). Fails closed when unavailable.
- **Python generator**: deterministic synthetic books, bank feed, Stripe payouts, contracts, policy pack, vendors with CRS sandbox personas, planted breaks and an answer key, so precision and recall are measured rather than assumed.
- **context.dev**: used offline to gather sourced public facts and to fetch real public documents (Stripe's fee schedule and payout terms) that are stored as citable sources, and as a Monitor that files a contract amendment through a signed webhook when a watched page changes. The agent never fetches the web during a close.

## The planted breaks

| # | Month | Break | Right answer |
|---|---|---|---|
| 1 | Jul, recurs | Stripe pays weekly net of fees | Match payout to charges; book the processing fees |
| 2 | Jul | SoundWave invoice arrives twice | Void the duplicate |
| 3 | Jul | Headliner deposit returned short after a cancellation | Clear the receivable; expense the shortfall under policy 5.1 |
| 4 | Aug | Sponsor amended to a base plus a per-attendee fee; ledger still ratable | Catch-up in August; variable fee in September, capped |
| 5 | Sept | Vendor bank-detail change days before a payment | Hold, verify the payee via CRS, escalate the same day |
| 6 | Aug → Sept | Site setup done in August, invoice arrives in September | Accrue in August; reverse and book payables in September |

The opening moment: a staging vendor's deposit comes back short in late September. The agent retrieves a July precedent, the contract's inspection clause and policy 5.1, proposes the difference as inspection-fee expense with three verbatim citations, and the engine posts it under threshold and indexes the decision.

## Repository

| Dir | Contents |
|---|---|
| `convex/` | `schema.ts`, `close.ts` (Workflow and data trigger), `agent.ts` and `agent/` (the agent), `controls.ts` and `controls/` (the rules), `ledger.ts` (the only writer of journal entries), `human.ts` (approve, reject, sign), `inject.ts` (judge scenarios, vendor holds, public sources, reset), `ask.ts` (Ask Auditor), `retrieval.ts` (sidecar calls), `trace.ts`, `audit.ts`, `scoring.ts`, `http.ts` (webhook), `seed.ts` |
| `web/` | The dashboard. `src/data/live.ts` adapts Convex rows to the view model. |
| `datagen/` | `generate.py` → `seed.json` (contract in `seed.schema.json`), `sample.seed.json`, `public/coachella.json` |
| `retrieval/` | `main.py`, Moss and CRS adapters, `Dockerfile`, `compose.yaml` |

## Running it

```bash
corepack enable pnpm && pnpm install && (cd datagen && uv sync --locked)
pnpm dev:convex                      # first run creates a dev deployment and writes .env.local
pnpm data:generate                   # datagen/seed.json
pnpm seed                            # wipe and load the entity; indexes clauses into Moss
pnpm dev:web                         # http://localhost:5173, live when CONVEX_URL is in .env.local
```

Start a close and read it back:

```bash
npx convex run api:startClose '{"entity":"eo-festival-nyc","period":"2026-09"}'
npx convex run api:listProposals '{"entity":"eo-festival-nyc","period":"2026-09"}'
npx convex run api:trace '{"entity":"eo-festival-nyc","proposalId":"<code from the rail>"}'
```

Checks: `pnpm typecheck`, `pnpm test`, `pnpm data:test`, `pnpm retrieval:test`.

Convex deployment env: `ANTHROPIC_API_KEY`, `RETRIEVAL_URL`, `RETRIEVAL_API_KEY`; optional `ANTHROPIC_MODEL`, `CONTEXT_WEBHOOK_SECRET` or `CONTEXT_WEBHOOK_TOKEN`, `CONTEXT_WEBHOOK_EFFECTIVE_DATE`. The sidecar reads Moss and CRS credentials from `retrieval/.env` (see `retrieval/.env.example`); run it with `pnpm dev:retrieval` or `docker compose -f retrieval/compose.yaml up -d --build`.

## What is real and what is synthetic

Real: the ledger, the Workflow, the agent's decisions, Moss retrieval, the controls engine, the audit trail, the CRS sandbox calls, the public documents cited by URL. Synthetic: the company's books, vendors, sponsors, contracts, bank feed, attendance and every amount.

## The demo

July and August are closed before judging so September has precedent. The one manual touch is Prepare close on September. Scenes: the opening moment above; a vendor's bank details change and the payment is held, CRS flags the payee, the controller keeps the hold; the agent is made to try to post and is refused with the denial logged; Ask Auditor explains a hold out loud from the audit trail. Judges inject their own bank transactions, contract amendments and bank-detail changes from the Inject drawer.
