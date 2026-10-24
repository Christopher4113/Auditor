# Phase 1 verification — October 24, 2026

Scope: Group A's A1 generator, A2 seed contract/sample, and the existing Interface 1 fixture service. Reviewed against **Auditor — Cal Hacks 13.0 Brief v2 (final design)**, **Auditor — Design (3)**, and the supplied Hyphenate track rubric. This is a reproducible foundation for team integration; it is not a claim that the complete demo has passed.

## Upstream reconciliation

Merged `main` at `c64b2d5` into `Deep`, preserving the expanded README, three-identity tool map, architecture notes, and other team changes. Resolved conflicts in the README, generator, Python project description, and seed schema. The implemented generator/strict schema replace the earlier placeholders while retaining upstream's `eo-festival-nyc` entity and `fxRates` section.

Any local JSON generated before this sync should be regenerated. The committed sample and new full output use the same entity, reference data, and schema. Only `Deep` is the push destination; the integration branches remain owned by the team.

## Evidence

| Check | Result |
| --- | --- |
| Data acceptance suite | 21 tests passed, including full validation of seeds 0–99 |
| Generated output | 360 bank transactions: 120 July, 120 August, 120 September |
| Weekly payouts | 12 reports: 5 July, 4 August, 3 September; gross − fees = net = linked bank receipt |
| Sample | Exactly 10 authored bank transactions and 3 linked payout reports; same master data as full generation |
| Reference data | All 27 account codes and 12 policy clause numbers match the final brief; 6 contracts; 15 fictitious counterparties |
| Opening entry | $500,000 debit = $500,000 credit; $380,000 cash, $60,000 prepaid, $60,000 retained earnings debit, $500,000 common stock credit |
| Cash sanity | No running cash overdraft in the 100 tested generated datasets |
| Referential integrity | Unique IDs/codes, valid entity/period/vendor/account references, reciprocal bank/payout links, unique citation IDs and clause numbers |
| Monetary transport | Integer cents, no booleans/fractions, bounded to JavaScript safe integers |
| JSON parsing | Duplicate keys and nonstandard `NaN`/`Infinity` rejected |
| Repeatability | Same seed/volume/revision produces identical serialized output; changing seed preserves reference data |
| Retrieval contract suite | 9 tests passed, with no external services |
| Verbatim citations | `apex-9.4` and `policy-5.1` match seed text exactly |
| API specification | Committed `retrieval/openapi.yaml` equals the app-generated OpenAPI document |
| Real local HTTP smoke | `/index`, `/query`, `/stats`, `/verify` and `/docs` returned expected responses; temporary server stopped after checking |
| Invalid API inputs | Empty/whitespace required text and invalid `k` rejected with HTTP 422; negative `k` regression fixed |
| Repository TypeScript check | Passed |
| Frontend production build | Passed; upstream app remains a shell awaiting Group D's implementation |

The malformed-data cases include missing/extra fields, invalid dates, two-sided/zero opening lines, unbalanced opening balances, unknown references, mismatched payout amounts/dates, reused receipts, duplicate citations, and out-of-range cents. Successful parsing alone is not treated as proof of accounting correctness.

## Reproduce

```bash
cd datagen
uv sync --locked
uv run generate.py
uv run validate.py seed.json
uv run validate.py sample.seed.json
uv run python -m unittest discover -s tests -v
```

```bash
cd retrieval
uv sync --locked
uv run python -m unittest discover -s tests -v
```

From the repository root, the equivalent commands are `pnpm data:generate`, `pnpm data:validate`, `pnpm data:test`, and `pnpm retrieval:test`. Repository checks: `pnpm typecheck` and `pnpm --filter web build`. See [the handoff](README.md) and [retrieval guide](../retrieval/README.md) for setup details.

## What remains for the team's demo

- **Phase 1 team gate:** Group C must load the sample/full data into Convex and run the fake Workflow with Group B's fakes while Group D's rail updates live. The upstream Convex table definitions and Workflow remain placeholders, so this gate cannot be claimed from Group A's tests.
- **Phase 2:** A3 adds six planted errors and the answer key; A4 implements real Moss indexing/search and runtime decision/correction memory. The current `/index` only acknowledges, `/query` returns canned chunks, and `/stats` is all zeros. No recall, precision, learning, or retrieval-latency result is claimed yet.
- **Phase 3:** Sponsor-issued CRS test identity IDs are still needed. `crsTestIdentity` is null; `/verify` returns `available: false` and cannot authorize a payment. No live CRS check was performed in this review.
- **Precedent:** `D-0417` is canned fixture text, not a seeded human decision. A real July close must create it before September can cite it.
- **Time:** Keep the August 10 Brightwater amendment and September attendance out of July agent context. Effective dates are present; the real retrieval/Convex read paths must enforce the as-of period.
- **Hyphenate evidence:** Every financial number and source document is synthetic. Real Phase 2/3 evidence must show live proposal/review behavior, server-side segregation of duties, and measured scoring against the answer key. The Phase 1 tests do not establish those future outcomes.
