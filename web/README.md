# Auditor frontend

A responsive controller workspace built with React, TypeScript, Vite, Lucide, and locally bundled Geist. The light interface uses white and soft-gray surfaces, navy text and violet accents. Its overview shows close progress, one clear review prompt, and a short activity list; supporting evidence appears only when a record is opened. The demo starts in September and includes July–September records.

## Run

Use Node 22.12+ (Node 24 recommended) and pnpm 10. From the repository root:

```sh
pnpm install
pnpm dev:web
```

This machine's older Node/Corepack installation can also run the app with:

```sh
npm exec --yes --package=node@24 --package=pnpm@10 -- pnpm dev:web
```

```sh
pnpm --filter web build
pnpm --filter web lint
```

No environment file, service credential, or live backend is needed for the frontend preview. All fonts and icons are bundled. The demo resets on page reload; the workspace tools menu (three dots beside the period) also has a reset action.

## Implemented interactions

- Simple overview with a close-progress card, review prompt, and searchable activity list.
- Transaction details start with a plain-language outcome and next action. Source documents, accounting entries, control checks, and activity history are collapsed by default.
- Period switching, transaction search (Cmd/Ctrl K), status filters, and transaction selection.
- Expandable verbatim source records and per-proposal audit history.
- Controller approval, return with instruction, and keep-hold flow. Uninvestigated injected items cannot be approved. Held payments cannot be released while verification is unavailable.
- Scoreboard, editable time-saving assumptions, close preparation, and period sign-off. Unresolved, returned, or held items block signing; signed periods block further edits.
- Controls and permission lists with an explicitly simulated agent-post denial and local audit event.
- Scenario lab for bank transactions, contract amendments, and vendor bank changes.
- Searchable sample decision memory and Ask Auditor with source context, optional browser microphone transcription, and read-aloud. Transcripts populate the question field and require explicit sending.
- JSON close export, toasts, keyboard focus containment, Escape dismissal, responsive mobile navigation, and reduced-motion support.

## Backend handoff

`convex/api.ts` currently contains contract comments only, and `convex/schema.ts` is empty. The preview therefore performs no Convex, Anthropic, Moss, CRS, or bank requests. UI labels distinguish local demo behavior from a live system. The sample metrics are illustrative, not measured results.

- `src/data/types.ts` defines the frontend view model.
- `src/data/demo.ts` provides eight complete fixture records. Apex's three citation passages match `retrieval/main.py` verbatim; other source excerpts are illustrative.
- `src/App.tsx` owns the local workspace state and action callbacks.
- `src/components/WorkspaceDrawer.tsx` contains the seven drawers.

Once the backend contracts are implemented, add the Convex provider in `src/main.tsx`, replace local proposal state with the entity-scoped reactive queries, map their output into the shared view model, and replace the action callbacks with the agreed mutations. Fetch actual scoreboard, rules, audit, retrieval, and CRS results before removing demo labels. Keep the same source text in citation cards.

Every call must carry the selected entity. Enforce posting identity, balancing, citation checks, materiality, payment holds, and period locks on the backend. The frontend guards are only demo interaction rules. Do not expose provider keys in `VITE_*` variables; only the public Convex URL belongs in the browser.

This preview shows the Festival NYC entity. Ask Auditor currently uses local answers; live retrieval and the durable close Workflow remain backend/integration work. Microphone transcription uses the browser's speech recognition implementation when supported and requests permission only after the user clicks the microphone button.

Returned entries remain pending until the backend supplies a revised proposal. The local preview records the controller instruction and blocks period signing rather than fabricating an agent correction.
