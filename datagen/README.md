# Phase 1 data handoff — Group A

A1 (generator core) and A2 (seed contract + sample), based on **Auditor — Cal Hacks 13.0 Brief v2 (final design)** and **Auditor — Design (3)**. The demo entity is Experts Only Festival NYC, July–September 2026. All financial data, vendors, account suffixes, and contract/policy text are fictitious.

Phase 1 supplies clean source data and the canned fixture needed by the team's fake close. A3 (six planted breaks + answer key), A4 (Moss indexing/querying), A5 (scoring), and A6 (CRS + live statistics) are later phases. `breaks` and `answerKey` are present but empty. The overall Phase 1 gate still requires the other developers' Convex seed mutation, fake agent, Workflow, and live rail.

The October 24 sync with `main` adopts its shared entity ID, `eo-festival-nyc`, and the empty `fxRates` section. Regenerate any earlier local `seed.json` before loading it. See [the verification record](AUDIT.md) for the checks performed and remaining integration work.

## Run

From the repository root:

```bash
pnpm data:generate
pnpm data:validate
pnpm data:test
```

Or use uv directly, without Node/pnpm:

```bash
cd datagen
uv sync --locked
uv run generate.py
uv run validate.py seed.json
uv run validate.py sample.seed.json
uv run python -m unittest discover -s tests -v
```

The generator uses only the Python standard library. The local validation/test tools use the locked `jsonschema` dev dependency. No API keys, `.env`, deployment, or network service is needed to generate or validate data; uv needs a network connection only for initial dependency/Python installation.

```bash
uv run generate.py --seed 42 --out /tmp/auditor-seed.json
uv run generate.py --transactions-per-month 20 --out /tmp/small-seed.json
uv run validate.py /tmp/auditor-seed.json
```

Default seed: `1328`. Default output: `seed.json` in the current working directory. The default command from this directory writes the gitignored `datagen/seed.json`. At the same generator revision, the same seed and volume produce identical bytes, with no current timestamps or global random state. Generated files elsewhere are your responsibility to keep out of commits. The minimum volume is five transactions per month to accommodate weekly payouts.

## Interface 5

`seed.schema.json` is a strict Draft 2020-12 JSON Schema, version `1.0.0`. Both `sample.seed.json` and the full generated file conform to it. Every top-level key is required; unknown fields are rejected. `validate.py` also checks cross-record references and accounting invariants, which JSON Schema alone cannot express. Its file loader rejects duplicate JSON keys, `NaN`, and `Infinity` instead of silently accepting ambiguous data.

| Section | Default output | Consumer guidance |
| --- | --- | --- |
| `schemaVersion`, `seed`, `dataset`, `entity`, `currency`, `company` | Version, reproducibility inputs, entity/event metadata; `synthetic: true` | Metadata, not table documents. `dataset` distinguishes `sample` from `generated`. |
| `accounts` | 27 accounts from the final brief | `id` is an external key; `code` is a four-character string. |
| `openingBalances` | Four July 1 lines, debit total = credit total = $500,000 | Combine into **one balanced opening journal entry**. These are lines, not four separate entries. |
| `periods` | July, August, September 2026, all initially `open` | External period keys are `2026-07`, `2026-08`, `2026-09`. |
| `bankTransactions` | Exactly 120 per month, 360 total, including payouts | All initially `unmatched` for the Workflow to consume. Positive is cash in; negative is cash out. |
| `stripePayouts` | 12 weekly reports: 5 July, 4 August, 3 September | Positive `gross - fee = net`; `net` equals the linked bank receipt. |
| `contracts` | Six signed agreements, including five scenario contracts and SoundWave | Clauses retain exact text, external citation IDs, and `effectiveDate`. |
| `policyClauses` | Twelve clauses from one `policyPackId`, `policy-nyc-v1` | Group into a `policyPacks` record if that is the Convex table shape. Preserve each clause's ID/text. |
| `vendors` | Fifteen fictitious counterparties, including freight, power, site services, staffing, communications, and print | Only account last four digits; `crsTestIdentity` is present and `null` until sponsor test IDs are supplied. |
| `breaks`, `answerKey` | Empty arrays | A3 extends these in Phase 2. Never expose the answer key to the agent or retrieval. |
| `fxRates` | Empty array, matching `main` | This version is USD only. A later second-entity contract must define FX records before populating this section. |

Every section record has `entity: "eo-festival-nyc"`. Nested contract clauses inherit their parent's entity. All money is **integer USD cents**, including `amount`, `gross`, `fee`, `net`, `debit`, `credit`, and `pnlImpact`. For example, `$13,600` is `1360000`; `$2,400` is `240000`. There are no floating point monetary values. Values are bounded to JavaScript's safe integer range so TypeScript/Convex consumers can preserve the same exact cents. Currency is normalized to `USD`.

Dates are ISO `YYYY-MM-DD` without times; periods are calendar months. All references are external string keys, **not Convex `_id` values**:

| Reference | Target |
| --- | --- |
| `openingBalances[].accountCode`, future `expectedLines[].accountCode` | `accounts[].code` |
| `bankTransactions[].period`, `stripePayouts[].period` | `periods[].id` |
| `bankTransactions[].vendorId`, `contracts[].vendorId` | `vendors[].id` (`vendorId` may be null on Stripe receipts) |
| `bankTransactions[].stripePayoutId` | `stripePayouts[].id` (null on other bank transactions) |
| `stripePayouts[].bankTransactionId` | `bankTransactions[].id`, with a reciprocal `stripePayoutId` |
| Future `answerKey[].breakId` | `breaks[].id` |
| Future `answerKey[].citationIds` | Policy or contract clause IDs |

### Convex developer (Group C)

1. Validate the file before loading. Start with the committed `sample.seed.json`, then use the generated file with the same contract.
2. Create accounts and periods, retaining external keys (for example, as `externalId`). Convert external references to Convex IDs only in the loader if your validators use `v.id(...)`. Do not pass source `id` strings as Convex `_id` values.
3. Create the opening journal entry dated July 1 from the four opening lines. Cash is $380,000 debit; prepaid venue deposit $60,000 debit; common stock $500,000 credit; retained earnings $60,000 **debit**, as specified in the brief. The ledger is seeded only with this opening entry. Bank transactions are source rows for the fake close, not already-posted ledger entries.
4. Load the bank feed, contracts, policies, and associated vendor/payout metadata. Group C owns the table layout: keep vendor and payout source records available in the backend even if embedded in existing table documents, since there are no separate vendor/payout tables in the current design. An idempotent seed mutation should upsert by `(entity, externalId)` or reject a second load before inserting anything.
5. Do not seed proposals, decisions, corrections, or invented precedent. The fake Workflow creates those during the Phase 1 gate. There are no FX records because Phase 1 has one USD entity.

Convex table definitions, agent tools, and frontend implementation remain Group C/B/D responsibilities; their upstream changes are preserved by the sync. The seed mutation and end-to-end gate remain team integration work. JSON shape is defined here for those consumers; coordinate interface changes before merging.

### Sample fixture

`sample.seed.json` contains ten explicit, hand-authored bank transactions across the three months, with the same master data as the generator. It includes:

- `sample-bank-02`: July Stripe receipt $47,180; its report has $48,600 gross and $1,420 fees.
- `sample-bank-06`: August Apex deposit paid, $16,000.
- `sample-bank-10`: September 25 Apex refund received, $13,600, for the **canned fake** Apex proposal. Expected fake entry: Dr Cash $13,600; Dr `5160` inspection fees $2,400; Cr `1200` vendor deposits $16,000.

The canned refund is only in the sample; the generated Phase 1 baseline does not plant a refund discrepancy. The sample is for exercising data flow and fixtures, not for asserting that all services have already been delivered or all accounting entries posted. `D-0417` is a fixture in the existing retrieval stub, not a real decision seeded by this generator. The prior decision must be created by the later July run before a real September close can cite it.

### Retrieval developer / agent consumer (Phase 2 handoff)

Policy and contract clause IDs/text are ready for A4. In particular, `policy-5.1` and `apex-9.4` use the exact strings in the existing retrieval stub. Index one clause per chunk, preserving its ID, entity, source contract/policy pack, and effective date in metadata. Respect the close's as-of date when retrieving: Brightwater Amendment 1 is effective **August 10**, and must not affect July. The final brief's sponsorship break table says “May” once; its contract and timeline consistently say August, which this data follows.

Stripe reports are normalized weekly settlement summaries inspired by [Stripe's balance transaction model](https://docs.stripe.com/api/balance_transactions/object), with integer gross, fees, and net amounts. They are not raw Stripe API objects or a live Stripe integration. Generated fees use a synthetic 2.9% plus $0.30 per charge with integer half-up rounding; the hand-authored sample preserves the brief's example values.

The CRS credentials identify a sandbox account, not the approved test-person IDs. `crsTestIdentity: null` explicitly means verification unavailable. A6 must use sponsor-issued test identities and fail closed when unavailable. No Phase 1 step calls CRS, Moss, Anthropic, or Convex, and no credentials are included in the seed files.
