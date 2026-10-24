# Data handoff — Phase 2 (A3)

The CLI now defaults to Phase 2, based on the final v2 brief and Design (3). Entity: `eo-festival-nyc`, July–September 2026. Every financial number, vendor, invoice, contract, and policy is synthetic. [Phase 1 commands and the ten-row sample](PHASE1.md) remain supported.

Phase 3 retains schema 2.0.0 and these financial scenarios. It adds [scoring, Impact, reset and CRS integration](../retrieval/PHASE3.md). Vendors carry sponsor persona IDs P01–P15; Field & Flame uses `P12`, the published identity-mismatch scenario. Request bodies stay in the sidecar's P01–P20 sandbox catalog. The historical Phase 1 generator remains unconfigured. No personal identity fields or verification results are added to the financial seed.

## Run on this Mac

```bash
cd "/Users/deepnayak/Desktop/Auditor /Auditor-Deep/datagen"
uv sync --locked
uv run generate.py
uv run validate.py seed.json
uv run python -m unittest discover -s tests -v
```

Expected generation output:

```text
wrote seed.json: 368 bank transactions, 12 payouts (Phase 2, synthetic)
6 break families, 11 period-specific cases; 387 imported entries, 10 source documents
```

The full output is `datagen/seed.json` (gitignored). The 360 clean transactions remain, plus eight scenario cash movements. Counts by period: July 123, August 122, September 123. `uv run generate.py --phase 1` reproduces the clean 360-row version. Fixed seed `1328`; optional `--seed`, `--out`, and `--transactions-per-month` remain available. Same revision/seed/volume produces identical bytes.

## Interface 5, schema version 2.0.0

Version 2 adds `ledgerEntries` and `sourceDocuments`. Version 1.0.0 and `sample.seed.json` remain valid. All money is **integer USD cents**, all dates are ISO `YYYY-MM-DD`, and every record is scoped to its entity. External IDs are strings, never Convex `_id` values. The validator checks the JSON schema, exact cents, balanced entries, references, periods, case coverage, and P&L arithmetic. It deliberately preserves the planted bank/book mismatches.

| Section | Phase 2 content |
| --- | --- |
| `accounts`, `openingBalances`, `periods` | 27 accounts, four opening lines forming one $500,000 balanced journal, three periods |
| `bankTransactions`, `stripePayouts` | 368 real-in-the-simulation cash movements and 12 net settlement reports |
| `ledgerEntries` | 387 imported balanced book entries, including routine books and the intentionally incorrect legacy entries |
| `contracts`, `policyClauses`, `vendors` | 6 contracts, 12 clauses, 15 fictitious counterparties; only account last four digits |
| `sourceDocuments` | 10 dated source documents: duplicate invoices, cancellation, signed amendment, attendance, catering invoice/email/payment request, security schedule/invoice |
| `breaks`, `answerKey` | Scoring-only case annotations and expected corrective entries, with six stable `breakNumber` families across 11 period-specific cases |
| `fxRates` | Empty; USD entity only |

`ledgerEntries[].lines` use `{accountCode, debit, credit}`. `bankTransactionId` is nullable because accruals/invoices need no cash movement. `sourceDocuments` carry `{id, entity, period, date, kind, vendorId, contractId, title, text, amount, reference}`; `amount`/`reference` may be null. Source text states facts, not the scoring answer.

Cases add `breakNumber`, `date`, `sourceDocumentIds`, and `ledgerEntryIds` to the Phase 1 break shape. Answer rows add `breakNumber` and `dependsOn` (earlier case IDs). Each answer is a **corrective entry applied to the imported books**, not a second copy of an already-recorded full transaction. Later corrections assume the listed prior-period corrections have been applied.

## Cases and accounting assumptions

| Cases | Family | Correct treatment |
| --- | --- | --- |
| `B1-2026-07/08/09` | Stripe fee netting | Correct imported gross cash: Dr processing fees / Cr Cash. July is $1,420 on $48,600 gross / $47,180 received; August/September recur. July requires initial human approval in the answer key. |
| `B2-2026-07` | Duplicate payable | Reverse the portal copy of SW1042: Dr AP / Cr prepaid $18,500. September production is prepaid in July, so this duplicate reversal has $0 P&L impact and is a control exception. |
| `B3-2026-07` | Artist refund shortfall | Dr Cash $51,000; Dr cancellation fees $9,000; Cr AR $60,000. The July approval can become future precedent. |
| `B3-2026-09` | Apex transfer case | Dr Cash $13,600; Dr inspection fees $2,400; Cr vendor deposits $16,000. Under threshold; retrieve July's actual decision if available. |
| `B4-2026-08/09` | Sponsor amendment | Cumulative fixed-fee catch-up in August; remaining fixed and capped variable revenue in September. |
| `B5-2026-09` | Bank change / payment hold | Hold on September 10, retain master account 4471, verify/callback and escalate. Reclass the unpaid invoiced advance Dr 1400 / Cr prepaid $42,000. No Cash line is invented. |
| `B6-2026-08/09` | Missing accrual | Accrue $9,400 in August; reverse the accrual against September's already imported invoice expense, leaving the expense in August. |

**Sponsor arithmetic:** the campaign has 82 days inclusive (July 1–September 20). Fixed revenue through August is `round($30,000 × 62/82) = $22,682.93`. Imported July/August revenue is $37,804.88, so the August cumulative correction is **$15,121.95**. September's correction is **$35,121.95**, including $40,000 variable (total $70,000 cap less $30,000 fixed). The brief's approximate ~$6,700 does not describe a cumulative catch-up using its stated dates. This implementation states and tests the daily-proration assumption; confirm it with the team's human controller before the demo.

Applying all answer-key corrections to imported books yields a balanced trial balance, cash equal to opening cash plus every bank movement, sponsorship revenue exactly $70,000, cleared artist/sponsor receivables, and the security setup expense in August once. The field-and-flame hold never creates a $42,000 bank outflow. These are oracle integrity checks, not measured agent accuracy.

## Convex integration and team handoff

The loader accepts both schema versions. `ledgerEntries` become `journalEntries` with `source: "import"`, `postedBy: "seed"`, references and optional counterparties. Opening balances remain one separate entry. This imports source books; it does not claim the controls engine approved legacy entries. Invalid/unbalanced imports are rejected before writes.

Raw documents attach to `contracts[].documents`; clause effective dates are retained. Answer-key records keep case IDs, family numbers, expected action, escalation, citations and dependencies. No proposals, controller decisions, or corrections are fabricated by the loader.

From the root:

```bash
corepack pnpm seed --dry-run
```

This validates and shows row counts without touching a deployment. The seed wrapper reads JSON in-process because the full ~400 KB Phase 2 file exceeds macOS shell argument limits. `SEED=datagen/sample.seed.json corepack pnpm seed --dry-run` checks the original sample.

**Team integration:** after Group C has deployed the matching code to the intended dev deployment, `corepack pnpm seed` replaces the selected entity's current data. Coordinate the reset with the team; it is not run automatically by our tests.

The tests load the actual full generated JSON into an isolated `convex-test` database. The code matcher leaves exactly five intended cash mismatches unmatched: three Stripe settlements plus Northern/Apex refunds. **A bank-only scan cannot discover every case.** Group C/B's period/event path must also consume the contract documents and imported books for duplicate invoices (family 2), sponsorship amendments/revenue schedules (family 4), bank-detail changes (family 5), and missing accruals (family 6). Those are six additional period-specific cases. Do not manufacture bank rows to conceal this integration requirement. The pending catering payment remains unpaid until callback verification.

## Retrieval / memory boundary

See [the retrieval guide](../retrieval/README.md) for local and real Moss commands. Automatic bootstrap allowlists **only policy and contract clauses**, preserving IDs/text/effective dates. It excludes bank/book data, planted flags, `breaks`, and `answerKey`. Runtime decisions/corrections are indexed only after the backend produces them; no real `D-0417` is preloaded.

The isolated rehearsal explicitly labels its synthetic human-decision fixture. It demonstrates indexing and retrieval, not a live agent close or real controller approval. [Phase 2 verification](../retrieval/PHASE2_AUDIT.md) records what was tested.
