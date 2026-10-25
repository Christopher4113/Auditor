# Phase 3 · Data + Retrieval (A5 + A6)

Group A's implementation and local runbook. The PDFs define requirements; their examples and “Built” labels are not verification evidence. This delivery does not claim the whole team's four demo scenes pass.

## Run on this Mac

```bash
cd "/Users/deepnayak/Desktop/Auditor /Auditor-Deep"
git switch Deep
git pull --ff-only origin Deep
corepack pnpm install --frozen-lockfile
pnpm data:generate
pnpm data:validate
pnpm scoring:demo
pnpm retrieval:phase3
pnpm retrieval:phase3:moss
```

If `pnpm` is unavailable, use `corepack pnpm` for each command. The scorer demo needs Node 22.18+ for TypeScript stripping. Expected output:

Data generation still labels the financial fixtures Phase 2: the same 368 bank rows and 11 cases are used by Phase 3's scorer and verification service.

```text
Phase 3 scorer self-check — SYNTHETIC fixtures; no agent accuracy or real approvals claimed.
Unprocessed seed: 0/11 detected; 0 corrected.
Oracle fixture: 11/11 corrected; precision=1; recall=1.
PASS: .artifacts/scoring-self-check.json (baseline + oracle; not live performance).
```

The generated JSON contains both reports. The oracle deliberately uses expected entries to test the scorer. It is never seeded into Convex, indexed into Moss, or reported as Claude's performance. A fresh dataset must score zero corrections before work occurs.

Moss rehearsal makes real SDK requests to `auditor-rehearsal-v2`, with unique synthetic entities. It checks retrieval, historical scoping, runtime fixture indexing, reset and preservation of another entity, then removes this run's entities. It never changes `auditor-memory-v2`. Reusing the owned rehearsal index avoids another project index slot.

To run the local service, restart it after changing environment settings:

```bash
pnpm dev:retrieval
```

Open <http://127.0.0.1:8000/docs>. Initial health is `ready:true`, `backend:moss`, 21 source chunks. Reviewed runtime memory can legitimately increase that count.

## POST requests

`POST /query` — expect 200, `apex-9.4` first with its verbatim $16,000 / 15% clause:

```json
{"collection":"contracts","text":"Apex Staging damage deposit inspection fee","entity":"eo-festival-nyc","asOf":"2026-09-30","k":3}
```

`POST /resolve` — expect **404** for July, **200** after changing `asOf` to `2026-08-31`. The intentional 404 is now documented in Swagger:

```json
{"collection":"contracts","id":"brightwater-amendment-1","entity":"eo-festival-nyc","asOf":"2026-07-31"}
```

`POST /verify`:

```json
{"testIdentityId":"P01"}
```

P01–P20 map to **CRS's hackathon personas**, representing fictional vendor contacts. No personal identity fields are stored in the financial seed. Consumer identity/risk checking does not establish destination bank-account ownership or authorize payment. Field & Flame is deliberately mapped to the published P12 mismatch persona.

The hackathon route is `POST /transunion/identity-manager-verification/basic`, with the account's default config. **No TruValidate config name or Postman collection is needed.** Credentials remain in ignored `retrieval/.env`; restart the service after environment changes. Direct live checks:

```bash
pnpm retrieval:verify
pnpm retrieval:verify --persona P12 --report
```

P01 returns `identityMatch:true`, no flags, `available:true`. P12 returns `identityMatch:false` with mismatch flags. Add `"includeReport":true` to the POST body for sanitized Criminal, Fraud Finder and PitchPoint summaries:

```json
{"testIdentityId":"P12","includeReport":true}
```

The normal three-field response is preserved unless the report is requested. Enrichment calls `/criminal/new-request`, `/fraud-finder/fraud-finder` and `/pp/fcrablj/data`. The report contains counts, score and review flags, never raw personal data. A requested product's failure makes the complete enriched check unavailable; partial results remain labelled. Fraud score ≥70 requests review, a stated demo routing threshold rather than payment authority.

Authentication alone is not verification. Missing credentials/persona, product-access failure, timeouts, HTTP errors, malformed/unsupported reports fail closed:

```json
{"identityMatch":false,"fraudFlags":[],"available":false}
```

The smoke command exits 2 for unavailable verification; an available mismatch is a successfully retrieved negative result, not a command failure. Unknown IDs never trigger a request; only the HTTPS sandbox is allowed. Empty `idManagerVerification.messages[]` means verified; a missing array is unavailable. Codes 2101/2201/2202/2301 flag mismatch/deceased identities; 2401 requires step-up and remains flagged even when basic identity matches. Unknown codes request review. Invalid credentials stop further login attempts until restart to protect the sandbox account. No endpoint releases holds, and tokens/raw reports are never persisted or logged.

Source of truth: [CRS's hackathon npm package](https://www.npmjs.com/package/@crscreditapi/crs-calhacks-mcp-server), version **1.1.2**, `dist/guides/tu_identity_verification.md`, the three enrichment guides, `dist/openapi-spec.json`, and `dist/test-data/personas.json`. The general CRS docs show a named-config route; the hackathon guide explicitly supplies the correct default-config route. Only functional request bodies were extracted into `crs_personas.json` from this MIT-licensed, hackathon-only package; no MCP server code or dependency was installed into Auditor.

## A5 · live scoring and Impact

Group C deploys the current Convex code to the intended dev project. Loading the seed replaces the target entity's data; no shared deployment was reset during implementation.

```bash
pnpm dev:convex
# In another terminal, after selecting the intended dev deployment:
pnpm seed
pnpm scoring:report
PERIOD=2026-09 pnpm scoring:report
```

The report command is read-only and uses the Convex CLI's selected deployment. Group D can subscribe to `useQuery(api.scoring.report, {entity, period})`; omit `period` for the whole entity. `api.scoreboard` retains its counts and adds `precision`, `recall`, `accuracy`, recomputed from current records. Internal `scoring:refresh` saves a per-case result snapshot; live queries never trust stale cached scores. Oversized scans fail explicitly.

The latest team branch is merged into Deep. Its `retrieval.indexTrace` summaries are supported in a fifth collection, `events`, without creating approval precedent. Ask Auditor now uses the array response, shared auth and entity/date scope; it accepts optional `asOf`, defaults to the supplied proposal's month end, or conservatively July 31 without context. The UI owner still needs to wire its live question callback and pass the selected period when no proposal is selected. The combined dependency install pins test-only `@asamuzakjp/css-color` to the registry-verified 7.1.7 patch so it passes the existing release-age policy; no policy was disabled.

| Measure | Definition |
|---|---|
| caught | A break links to the actual bank transaction, or raw evidence IDs for a non-bank case. Planted flags/case IDs are not detection evidence. |
| precision | Detected labelled cases / (detected labelled cases + distinct unmatched alerts). Repeated flags/revisions are deduplicated. |
| recall | Detected labelled cases / labelled cases in scope. |
| accountingCorrect | Exact net corrective account movements in cents; entries must balance, have approved/posted decisions and be posted by controls/human. Imported books, proposals and status labels earn no posting credit. All corrective postings are summed, so duplicate posting fails. |
| controlsCorrect | Expected escalation behavior; the bank-change case also needs the vendor payment hold. |
| correct / accuracy | Detection + accounting + controls + required prior-case corrections. Accuracy = correct cases / labelled cases. |
| cashProtectedCents | Corrected duplicate payable and held-payment exposure; conservative exposure, not realized cash savings. |
| misclassificationCorrectedCents | Corrected non-cash P&L classification, separate from protected cash. |
| repeatMistakes | A later proposal fails the same recorded rule after its correction on the same break. Free-text human instructions are not semantically graded. |

Undefined ratios are `null`. The benchmark covers labelled synthetic cases; a judge's new unlabelled scenario needs a reviewed expected outcome before interpreting precision.

Impact uses deduplicated `match.close` audit records, investigated breaks and human-review events. Visible, configurable assumptions: 3 minutes/routine match, 15 minutes/exception, 5 minutes/controller review, 5 days/manual close. Hours saved = (estimated manual minutes − controller minutes)/60; excludes setup/other overhead. Actual elapsed close time stays `null` until a `close.start` and controller signature exist; estimated days saved compares that interval with the stated baseline. Events without a period cannot be attributed to a monthly report.

The existing sponsorship assumption remains: 82 inclusive campaign days and a **$15,121.95** August catch-up. This differs from the brief's approximate amount and needs controller agreement.

## A6 · counters and reset

`GET /stats` adds latency sample/window sizes and separate verification status to the existing fields. Retrieval totals count successful queries (including empty results), since start or explicit reset. Median uses the latest 1,000 successful queries. Tokens remain labelled `estimate_chars_div_4`, not actual Claude billing or measured cost savings.

`POST /reindex-all` replaces one entity's **complete snapshot**, preserving other entities. Each chunk needs its own `meta.entity` and `meta.effectiveDate`. Empty `chunks` intentionally clears the target. The shared Bearer token protects it when configured.

```json
{
  "entity":"isolated-test-entity",
  "chunks":[{
    "collection":"policy","id":"test-policy","text":"Synthetic test clause.",
    "meta":{"entity":"isolated-test-entity","effectiveDate":"2026-07-01"}
  }],
  "resetCounters":false
}
```

To replace the real demo entity with the seed's 21 source clauses, removing its runtime decisions/corrections:

```bash
pnpm retrieval:reset --dry-run
pnpm retrieval:reset
```

This resets the sidecar only. Convex `seed.load` now schedules `retrieval.resetEntity`; C5 reset via `seed.load` therefore clears stale Moss memory too. Ordinary `indexEntity` remains an upsert. Audit records distinguish confirmed reset from failure; check `retrieval.reset_entity` succeeded. The team must coordinate reset with active workflows; this lane does not cancel C's in-flight jobs.

SQLite journals a pending replacement before cloud writes. Retrieval/readiness fail closed after failure; startup replays pending work. Cloud retry also removes orphaned target-entity chunks. Identical snapshots are idempotent. Optional `resetCounters:true` resets service-wide retrieval counters; the default is false. Verification counters remain separate and process-local.

## Verification and handoff limits

Run `pnpm data:test`, `pnpm retrieval:test`, `pnpm test`, `pnpm typecheck`, `pnpm --filter web build`. Tests cover exact cents, evidence-only cases, unposted/imported entries, double posting, dependencies, false positives, scope, reset authorization/validation/restart recovery, CRS token reuse/reauthentication, malformed reports and errors. They require no Claude or shared database reset.

B/C owns event investigation, real approvals, callback/hold decisions and demo scenes. D owns rendering scoring/Impact. The integrated demo still needs configured frontend/sidecar URLs and matching deployed code. Public hosting remains outside this delivery per the user's local-service choice; A7 second entity remains stretch scope.

## Checked locally · October 24, 2026

- **338 passing tests after merging the team branch:** 33 data, 39 retrieval/CRS, 266 TypeScript/UI. Convex type check, frontend production build and frozen dependency install passed. OpenAPI matches the FastAPI application; changed files pass whitespace and credential checks.
- Real Moss Phase 3 rehearsal passed: four successful initial retrievals, median **4.24 ms** in that run; verbatim sources, runtime fixture indexing, historical scope, stale-memory removal and other-entity preservation checked. This is a small rehearsal measurement, not a production latency benchmark. Idempotent cloud writes use bounded retries; exhausted failures still return 503, and pending resets remain unavailable until recovery.
- Live CRS: P01 clean; P12/P13 identity mismatches; P14 deceased flag; P16 basic match with mandatory step-up flag. All returned available results using the account-default route. P01 four-product report was clear (fraud score 11); P12 report carried mismatch flags and fraud score **85**. No role/config blocker remains for these tested products.
- The scorer oracle passed 11/11; the untouched dataset scored 0/11. Both are explicitly synthetic self-checks, not agent accuracy. The real four-scene integrated demo and actual controller approvals were not run in this lane.
- No shared Convex data was reset or deployed, and no Docker image/public host was built. Deployment files include the sponsor persona JSON. After pulling, restart the local server so it reloads CRS environment settings.
