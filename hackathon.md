# Hackathon log

- **Project:** Auditor
- **Event:** Cal Hacks 13.0
- **What it does:** Closes a company's monthly books with one Claude agent that proposes entries, a TypeScript controls engine that checks them, and a human controller who decides exceptions and signs the period.
- **Live app:** https://auditor-nine-ecru.vercel.app
- **Repo:** https://github.com/Christopher4113/Auditor
- **Frontend:** Vercel
- **Convex deployment:** https://tough-shepherd-182.convex.cloud
- **Components:** @convex-dev/agent, @convex-dev/workflow (convex/convex.config.ts)
- **Convex features:** schema with 17 tables and 23 indexes, queries, mutations, actions, internal functions, HTTP action (convex/http.ts), cron (convex/crons.ts), scheduled functions (ctx.scheduler in close.ts, human.ts, inject.ts, advance.ts), realtime useQuery subscriptions (web/src/data/live.ts), snapshot export/import for the demo reset (scripts/demo-reset.sh)
- **Auth:** none
- **AI models:** claude-sonnet-4-5 (convex/agent.ts)
- **Started:** 2026-10-24T01:07:30Z
- **Last updated:** 2026-10-25T15:11:08Z

## How we use Convex

- **The monthly close is a durable Workflow.** `closePeriod` in convex/close.ts (@convex-dev/workflow) matches bank lines, runs the agent per break in parallel, reviews, posts and indexes; it survives restarts and judges can watch its steps.
- **The agent runs inside Convex.** convex/agent.ts uses @convex-dev/agent with typed tools; retrieval goes through actions in convex/retrieval.ts. Proposals, decisions and citations are rows, not chat history.
- **Three identities enforced by the database layer.** `ledger.postEntry` in convex/ledger.ts is the only writer of journalEntries and refuses the agent caller; the denial is a row in auditLog (convex/schema.ts, index by_entity_traceId).
- **Data triggers, not run buttons.** A new bank line (`close.ingestBankTransaction`) or the scheduled period advance (convex/advance.ts, convex/crons.ts) starts or re-runs the close through the scheduler.
- **Everything on screen is a live query.** web/src/data/live.ts subscribes with useQuery to proposals, periods, close summary, workflow status and the audit trail, so the proposal rail, the Review inbox, the close summary and the hero card update on every open browser without a refresh.
- **Webhook as HTTP action.** convex/http.ts verifies a signed context.dev monitor event and files a contract amendment through a mutation, which re-runs the close.

## Log

- 2026-10-24 b135a51 Initial commit.
- 2026-10-24 bc06c2d Monorepo skeleton: web, convex, datagen, retrieval.
- 2026-10-24 a7739b8 Realign to final design: one agent plus controls engine (convex/schema.ts, convex/tools.ts).
- 2026-10-24 764bf77 C1 and C2: 14-table schema, seed function, close Workflow, audit log, data trigger (convex/schema.ts, convex/close.ts, convex/seed.ts).
- 2026-10-24 a760d60 Phase 1 gate: lanes wired end to end (convex/api.ts, web/src/data/live.ts).
- 2026-10-24 a60edec C3 and C4: approve, reject, sign, revision loop, retrieval actions, scheduled advance (convex/human.ts, convex/advance.ts, convex/crons.ts).
- 2026-10-24 8f30503 B3: code matcher and Sonnet agent as internalAction (convex/agent.ts).
- 2026-10-24 acccebb B4: controls engine with eight rules and full audit trail (convex/controls.ts, convex/controls/rules.ts).
- 2026-10-24 2d7651f Correlation id across the close and X-Trace-Id to the sidecar (convex/audit.ts).
- 2026-10-24 8b5825a C5 and C6: inject mutations, vendor hold with CRS verify, reset, forbidden call, trace summaries (convex/inject.ts, convex/trace.ts).
- 2026-10-24 e451f81 B6: askAuditor action with verbatim citations (convex/ask.ts).
- 2026-10-25 14971b9 Phase 3 gate: inject, forbidden call and Ask Auditor live in the app (web/src/App.tsx).
- 2026-10-25 863b3a2 CRS report on the vendor trace, audit trail indexed into Moss, monitor webhook (convex/http.ts, convex/retrieval.ts).
- 2026-10-25 f962ed8 Public documents as citable sources (convex/schema.ts publicSources, convex/inject.ts).
- 2026-10-25 5979879 Demo reset from a snapshot plus Moss reindex (scripts/demo-reset.sh, convex/retrieval.ts).
- 2026-10-25 5693d8c Period-end traces visible to Ask Auditor; close-running status and done toast (web/src/App.tsx).
- 2026-10-25 d39a41c Close workflow runs breaks in parallel (convex/close.ts).
- 2026-10-25 74cf1db Scoreboard fetched on visible changes instead of a live subscription (web/src/data/live.ts).
