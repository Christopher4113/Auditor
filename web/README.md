# Auditor frontend

A responsive React and TypeScript workspace with white and soft gray surfaces, navy text, violet accents, a complete dark theme, and reduced-motion support. The overview stays simple; evidence and accounting details expand inside a transaction.

The header's sun/moon toggle remembers your appearance choice across reloads. It follows the system preference until you choose a mode. The bottom “Tracks & technology” strip loops through Hyphenate, Convex, Moss, CRS Credit, Anthropic, Vultr, and context.dev. Hover or focus pauses it; the pause button keeps it still. Reduced-motion preferences show a static list instead.

Controls use a glass finish with subtle highlights, frosted surfaces, clear focus rings, and spring press feedback. The header navigation and activity filters share a moving glass lens: tap an option or drag across the control and release to select. Vertical gestures keep scrolling, and cancelling a drag restores the current selection. Arrow keys, Home, and End select options when the control has focus.

The material and motion follow [Apple’s Liquid Glass design guidance](https://developer.apple.com/videos/play/wwdc2025/219/) and [interactive control guidance](https://developer.apple.com/videos/play/wwdc2025/323/): a quiet floating control layer, responsive highlights, and clear content underneath. This implementation uses web CSS and pointer events.

Layouts adapt from narrow phones to large displays: mobile transactions retain the vendor, amount, and status; drawers and wide tables scroll locally; form fields stay readable and touch targets are at least 44px. Reduced-motion removes spring movement, and reduced-transparency or unsupported-blur environments use solid surfaces. The override styles load in order from `src/styles/glass.css`, `glass-components.css`, `responsive.css`, `components/LiquidSegmentedControl.css`, and `styles/liquid-refinements.css`.

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

## Phase 3: controller drawers and voice (D5/D6)

- **Review inbox:** live note entry, approval, and return with a required instruction. Both actions await the existing C3 mutations, show success or refusal notifications, preserve instructions after refusal, and prevent duplicate submissions. Approval requires citations and a balanced entry, then refreshes the current source, hold, and revision state before sending; payments on hold remain blocked.
- **Close summary:** server journal counts and trial balance, latest-revision review queue, and live period signing. A rejected historical proposal stops blocking signing once its real later revision posts. Pending revisions, payment holds, disconnected or capped feeds, running closes, and unbalanced totals still block signing. An empty period requires a completed close before signing.
- **Impact:** per-item comparison and editable time assumptions. Estimates are labelled as planning figures; missing measured accuracy or repeat-mistake results are shown as unavailable.
- **How approvals work:** preventive, detective, and enabling controls; separate agent, controls, and human tools; recorded pass/block counts from the loaded proposal feed. Demo permission tests are labelled simulations.
- **Test scenarios:** three forms for a bank transaction, contract amendment, and vendor bank change. Local demo submissions work; live submissions wait for C5 endpoints.
- **Ask Auditor:** editable text and optional browser speech input, exact source passages, explicit read-aloud and stop controls. Recording starts only after a microphone click and never sends a question automatically. Text remains available when speech is unsupported or permission is denied. Recognition may use the browser provider’s speech service. Live answers use an optional typed callback and stay unavailable until the B6 API is integrated; demo answers are clearly labelled samples.

The current `phase-3` integration branch exposes C3 but still has no public C5 injection/permission-test/reset or B6 Ask endpoints. Live measured impact and repeat-mistake scoring also need the A5 result contract. The frontend does not fabricate those responses or call guessed endpoints. See [the Phase 3 rehearsal and handoff](docs/phase-3-rehearsal.md) for remaining integrations and the D6 recording storyboard.

## Data contracts and ownership

- `src/data/contracts.ts`: browser wire types mirroring the existing server queries; IDs and integer cents remain explicit.
- `src/data/adapters.ts`: pure, tested wire-to-view mapping; no generated backend imports.
- `src/data/live.ts`: entity-scoped subscriptions for Festival NYC (`eo-festival-nyc`).
- `src/data/selectors.ts`: latest revision, unresolved progress, and human-review selection.
- `src/components/TransactionDetail.tsx`: D3/D4 sources, entry, decision, and audit view.
- `src/components/WorkspaceDrawer.tsx`: D5 summaries, controls, and scenario forms.
- `src/components/ControllerReview.tsx`: asynchronous controller decision form.
- `src/components/AskDrawer.tsx`: D6 text, speech, citations, and playback.
- `src/components/QueryBoundary.tsx`: isolates failed queries and supports retry by remounting.

Read APIs: `listPeriods`, `listProposals`, `getBreak`, `getDecision`, `scoreboard`, `closeStatus`, `closeSummary`, and `auditTrail`. Close preparation uses `startClose`; controller actions use `approve`, `reject`, and `signPeriod`. `getBreak` takes the internal Convex break ID; `getDecision` takes the internal proposal ID. C3 approve/reject take the external proposal code instead; do not interchange these identifiers. Backend rules must enforce identity, balancing, citations, materiality, payment holds, and period locks. Browser guards support the workflow but cannot replace server enforcement.

Demo content is fictional. Apex's three source passages match `retrieval/main.py` verbatim; other demo excerpts are illustrative. Live mode uses only server-returned text and results.

## Verify

From the repository root:

```sh
pnpm test
pnpm exec tsc -b web
pnpm --filter web build
pnpm --filter web lint
```

The shared test runner includes backend controls and agent tests, pure adapter/selector regressions, rendered transaction-detail checks, and DOM interaction tests. Controller rehearsal tests exercise server success/refusal, instruction preservation, duplicate prevention, real revision updates, and signing. Speech tests exercise permission failures, editable transcripts, explicit submission, citation preservation, playback, and cleanup. These tests use local transports and do not approve, reject, sign, or reset the shared sandbox.
