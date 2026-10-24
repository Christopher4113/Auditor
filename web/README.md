# Auditor frontend

A responsive React and TypeScript workspace with white and soft gray surfaces, navy text, violet accents, and reduced-motion support. The overview stays simple; evidence and accounting details expand inside a transaction.

## Run

Use Node 22.12+ (Node 24 recommended) and pnpm 10:

```sh
pnpm install
pnpm dev:web
```

Without a Convex URL, the app opens a self-contained demo. To read the shared sandbox, put only the public deployment URL in the ignored root `.env.local`:

```dotenv
CONVEX_URL=https://your-deployment.convex.cloud
```

The workspace tools menu switches between live and demo records. Demo actions are local and reset on reload. Live records never fall back to sample records after a connection failure. Provider credentials must stay on the server; do not add them to browser variables.

## Phase 2: sources and reviewer evidence (D3/D4)

- Real bank records and cited contract passages, with money rendered in monospace.
- Proposed entry lines, revision selector, and separately labelled discarded first read.
- Recorded reviewer, outcome, reason, and exact verbatim citation passages. Source buttons open the matching source card inside the transaction.
- Audit history queried for the selected proposal revision, showing actor and full Pacific timestamps.
- Approval, confirmed posting, and held payments shown as distinct states. A posted suspense journal does not release a held payment.
- Reactive workspace progress, server scoreboard, period locks, and activity feed with loading, reconnecting, unavailable, and retry states.
- Close preparation awaits a real workflow ID before reporting that the request was accepted.

The Phase 1 API does not expose original ledger balances. The ledger card explicitly reports unavailable evidence until `getDecision` returns a linked posted journal; that journal is labelled **Posted journal total**, never presented as an original balance.

The current branch has no integrated C3 controller approval, rejection, or sign-off endpoints. These actions are read-only in live mode. The demo retains local approval, required return instructions, scenario injection, and sign-off flows. Live Ask Auditor, measured impact/scoring, CRS verification, and reset are later integration work. No frontend action fabricates an agent revision or a successful live mutation.

## Data contracts and ownership

- `src/data/contracts.ts`: browser wire types mirroring the existing server queries; IDs and integer cents remain explicit.
- `src/data/adapters.ts`: pure, tested wire-to-view mapping; no generated backend imports.
- `src/data/live.ts`: entity-scoped subscriptions for Festival NYC (`eo-festival-nyc`).
- `src/data/selectors.ts`: latest revision, unresolved progress, and human-review selection.
- `src/components/TransactionDetail.tsx`: D3/D4 sources, entry, decision, and audit view.
- `src/components/QueryBoundary.tsx`: isolates failed queries and supports retry by remounting.

Read APIs: `listPeriods`, `listProposals`, `getBreak`, `getDecision`, `scoreboard`, `closeStatus`, and `auditTrail`. Close preparation uses `startClose`. `getBreak` takes the internal Convex break ID; `getDecision` takes the internal proposal ID. Future C3 approve/reject actions take the external proposal code instead; do not interchange these identifiers. Backend rules must enforce identity, balancing, citations, materiality, payment holds, and period locks.

Demo content is fictional. Apex's three source passages match `retrieval/main.py` verbatim; other demo excerpts are illustrative. Live mode uses only server-returned text and results.

## Verify

From the repository root:

```sh
pnpm test
pnpm exec tsc -b web
pnpm --filter web build
pnpm --filter web lint
```

The shared test runner includes backend controls and agent tests, pure adapter/selector regressions, and server-rendered transaction-detail checks. UI tests cover missing evidence, revision isolation, exact citations, and the distinction between approval, posting, and a payment hold.
