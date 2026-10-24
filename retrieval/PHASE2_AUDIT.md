# Phase 2 verification — October 24, 2026

Scope: Group A's A3 data/evidence/answer key and A4 local + real Moss retrieval, with the small Convex loader and API adapter changes needed to consume them. The user selected **local service plus deployment files**; no public Railway service or shared Convex reset was performed.

## Checks that passed

| Check | Evidence |
| --- | --- |
| Python data suite | 32 tests, including 100 clean Phase 1 seeds and default + four other Phase 2 seeds |
| Python retrieval suite | 21 tests: real local search, persistence, idempotency, corrections, entity/date isolation, input/auth failure behavior, exact resolution, trace propagation, SDK upserts and warm-once query behavior |
| Repository suite | 139 Vitest tests across Convex tools/controls, matching, seed integration, C4 publishing, HTTP adapters, and existing frontend tests |
| TypeScript | Convex check passed; frontend typecheck passed as part of the production build |
| Frontend | Production build passed |
| Actual JSON load | Full generated 368-bank-row / 387-import-entry file loaded into an isolated `convex-test` database; one opening journal produces 388 entries total |
| Legacy compatibility | Original ten-transaction sample still loads with one opening entry |
| Reset / import validation | Re-seeding is idempotent and preserves other entities; unbalanced imports are rejected without replacing existing data |
| Bank matcher | Routine books match; exactly five intended cash mismatches remain: three Stripe settlements and the Northern/Apex refunds |
| Accounting oracle | Applying expected corrections produces a balanced trial balance, cash equal to the bank, sponsorship revenue $70,000, cleared artist/sponsor receivables, and security setup expense in August once |
| Exact cited text | Canonical clause IDs/text survive indexing, query, resolution, and source reads |
| Time | August amendment and September documents cannot be read as July evidence |
| Large-seed command | `node scripts/seed.mjs --dry-run` validated the ~400 KB Phase 2 JSON without a shell argument-size failure or a deployment write |

Total: **192 automated tests passed**. Oracle checks prove the dataset is internally coherent; they are not a measurement of the agent's precision or recall.

## Real Moss checks (separate from mocked unit tests)

Using the supplied project credentials from the ignored local `.env`:

1. Authenticated successfully without printing credentials.
2. Created/populated the dedicated `auditor-memory-v2` index with **21 policy/contract clauses**. Existing unrelated project indexes were preserved.
3. Initial bootstrap + native model warm-up completed in **26.6 seconds** in the observed run. Queries do not call `load_index`.
4. Retrieved `apex-9.4` first for the damage-deposit/inspection-fee question and `policy-5.1` first for non-recoverable fees/receivables.
5. Ran the HTTP-handler rehearsal in a separate rehearsal entity/index. Indexed a clearly labelled synthetic human-decision fixture at runtime; decision search changed from no hit to `D-0417`. Production entity memory was not fabricated.
6. The four-query real Moss rehearsal observed **3.44 ms median** retrieval latency on this machine. This is one small run, not a performance guarantee or an end-to-end close latency.
7. Started a real temporary Uvicorn HTTP server in Moss mode. `/health` reported `backend: moss`, `ready: true`, 21 documents. `/query`, `/stats`, `/docs`, and historical `/resolve` checks passed. The temporary server was stopped.
8. Verified a counterparty-only `Apex Staging` lookup returns its own contract and unchanged clause text.

`uv run demo.py --backend local` also passed, reporting local lexical search explicitly. A failed Moss operation returns HTTP 503; it never masquerades as local or canned success.

## What changed at the team interfaces

- **Interface 5:** schema 2.0.0 adds imported books, dated source documents and case-family/dependency metadata; 1.0.0 remains supported. Effective clause dates and documents are retained by the loader. Imported books are marked `source: import`, not falsely described as controls-approved postings.
- **Interface 1:** existing field names and array responses remain; entity/as-of scoping, batch indexing, exact resolution and readiness are additive. The old agent HTTP adapter sent `query` and expected `{hits}` despite the agreed array response; it now sends `text`/scope and consumes the array, forwarding an optional service token.
- **Read path:** contract reads filter future evidence; ledger investigation supplies real relevant imported books instead of a placeholder. Real retrieved relevance scores are retained on proposals.
- **Matcher:** cash matching uses bank account 1000 only. Including Stripe clearing 1010 previously cancelled valid net cash settlements and would route routine payouts to the model.
- **Latest C4 sync:** merged `phase-2` through `625529f`. Aligned dates, shared token, batch indexing, stats return fields, and trace headers. Tests exercise C4 decision/correction publication with mocked HTTP, including the real source-clause dates and human scope metadata.

## Reproduce

Follow [the data guide](../datagen/README.md) and [retrieval runbook](README.md). Data generation and offline tests need no credentials. Real Moss needs the provided local `.env`. Root equivalents:

```bash
corepack pnpm data:generate
corepack pnpm data:validate
corepack pnpm data:test
corepack pnpm retrieval:test
corepack pnpm test
corepack pnpm seed --dry-run
corepack pnpm retrieval:demo:moss
```

## Team integration still required before claiming the complete demo

- Group C/B's event/period path must consume **non-cash evidence and imported books**: duplicate payables, sponsorship amendments/revenue schedules, service accruals and bank changes (families 2, 4, 5, 6). Those six period-specific cases are not covered by the five bank mismatches. No fictitious bank row is inserted to make a bank-only scan appear sufficient.
- C4 publishing actions are now present and tested at their HTTP boundary. The integrated close still needs to exercise them with **actual reviewed decisions and corrections**. `D-0417` is only a labelled fixture in the isolated rehearsal until a real July approval is indexed.
- Railway configuration is included but was not built/deployed here, per the selected local-delivery scope. Hosted Convex needs a reachable `RETRIEVAL_URL`; the local machine's loopback address is for local tests. The shared service token must match the backend configuration when enabled.
- The sponsorship answer key uses an explicit **82-day cumulative** proration. Its $15,121.95 August catch-up differs from the brief's approximate ~$6,700; see the documented arithmetic and have the team's controller review that assumption.
- CRS remains unavailable and fail-closed, with null sponsor test identity IDs. A6 needs sponsor-issued sandbox identities and live verification; none is invented here.
- No live Claude close, human approval, period sign-off, or measured planted-error precision/recall is claimed by these component tests. Those require the integrated team gate.

## Read-only recheck after the user's successful local run

Observed on October 24, 2026, before this documentation update:

- Local `Deep` and remote `Deep` matched at `379b47c`; `Deep` included remote `phase-2` at `625529f`. No newer integration commit was missing locally.
- All 192 automated tests passed again. Convex TypeScript and the frontend production build passed again.
- The user's running `127.0.0.1:8000` service reported real Moss, ready, 21 documents (12 policy / 9 contract). Verbatim contract/policy lookups and July/August amendment visibility passed. Its production index had zero decision/correction documents; the isolated rehearsal's fixture is not production learning.
- There was no open Phase 2 pull request from `Deep`; the only existing PR from this branch was the already merged Phase 1 PR #5. The Phase 2 implementation still needs the team's review/merge into the integration branch.
- This checkout had no root Convex environment file or exported `CONVEX_URL`. `web/src/data/live.ts` therefore selects fixture mode here until its backend URL is configured.
- Read-only queries to the provided hosted Convex deployment showed the expected entity's three open periods with 4 / 4 / 3 bank rows, respectively, and zero answer-key cases. July/August had completed workflow records; September had no recorded workflow run. This is not the generated Phase 2 dataset (123 / 122 / 123 rows and 11 cases).
- Hosted Convex's availability does not establish that this local sidecar is connected to it. The local-only delivery choice still needs a deliberate backend/sidecar connection before the shared demo.

The recheck did not reset or change the shared deployment. Required team gate: merge/review the source, deploy matching backend code, load the Phase 2 seed on the intended dev deployment, connect the frontend and sidecar, process all source-event families, and verify an actual approval/memory/September-close sequence. The sponsor proration assumption still needs controller review.
