# Phase 2 retrieval — A4

FastAPI now performs persistent retrieval. **Moss mode uses the real Moss SDK and native semantic/hybrid search.** Local mode is a separate, labelled lexical provider for tests and offline rehearsals. No query returns canned hits. Moss failures return HTTP 503; the service does not silently switch to local search. `/verify` remains fail-closed until A6.

## Try it on this Mac

The supplied Moss credentials have been placed in the gitignored `retrieval/.env` with owner-only permissions. The generated seed must exist first.

```bash
cd "/Users/deepnayak/Desktop/Auditor /Auditor-Deep/datagen"
uv run generate.py
uv run validate.py seed.json
```

Quick rehearsal, no API credentials or running server required:

```bash
cd "../retrieval"
uv sync --locked
uv run demo.py --backend local
```

Real Moss rehearsal:

```bash
uv run --env-file .env demo.py --backend moss
```

Both exercises use the actual HTTP handlers. They index the 21 source clauses, retrieve Apex/policy citations, index a labelled synthetic human-decision fixture and retrieve it, then check historical scoping. Rehearsal memory uses a separate entity and the separate `auditor-rehearsal-v2` Moss index; it is never inserted as a real decision into `eo-festival-nyc`. `D-0417` is a rehearsal fixture until the team's real July approval produces actual memory. Output identifies the backend and measured latency.

## Start the interactive service

From `retrieval/`, keep this process running:

```bash
uv run --env-file .env uvicorn main:app --reload --port 8000
```

Open <http://127.0.0.1:8000/docs> and <http://127.0.0.1:8000/health>. Startup bootstraps policy/contract clauses from `../datagen/seed.json`, then warms one Moss index. First startup can take tens of seconds. Readiness waits for warm-up. `/query` never loads the model/index; an index write refreshes the loaded copy. Disk caches avoid repeated downloads.

For a new clone, create `.env` from `.env.example` if it does not already exist and fill the Moss project ID/key. For offline service operation, explicitly select local mode:

```bash
RETRIEVAL_BACKEND=local uv run uvicorn main:app --reload --port 8000
```

Without credentials or an explicit backend, the development default is local. `/health` and `/stats` always identify the actual backend. The production Docker configuration explicitly requires Moss mode.

Try this body in `POST /query`:

```json
{
  "collection": "contracts",
  "text": "damage deposit less 15 percent inspection fee",
  "entity": "eo-festival-nyc",
  "asOf": "2026-09-30",
  "k": 3
}
```

Or use another terminal:

```bash
curl -s http://127.0.0.1:8000/query \
  -H 'Content-Type: application/json' \
  -d '{"collection":"contracts","text":"inspection fee","entity":"eo-festival-nyc","asOf":"2026-09-30","k":3}'
```

Responses remain the agreed **array** `[{id, text, score}]`. Source IDs and verbatim text are preserved; scores are relevance values, not probabilities that an accounting treatment is correct. Use `text` in new clients; legacy `query` is accepted as an input alias.

Counterparty-only contract queries first select matching canonical contract titles, then rank those clauses. This lets `Apex Staging` find its signed contract even though the vendor name is absent from the clause body. Natural-language treatment questions search the eligible contract corpus.

## API and runtime memory

| Endpoint | Behavior |
| --- | --- |
| `POST /index` | Persist/upsert `{collection,id,text,meta}`; returns `{ok,id}`. Identical writes are idempotent. |
| `POST /index/batch` | Batch upsert `{chunks:[...]}` (1–100 chunks); rejects duplicate IDs within the same entity/collection batch. |
| `POST /query` | Real ranked search within collection, entity and as-of scope; no result means `[]`. |
| `POST /resolve` | Exact citation resolution `{collection,id,entity,asOf}` → `{id,text,meta}` or HTTP 404. No fuzzy matching for a cited ID. |
| `GET /stats` | Backend, document counts, measured retrieval count/median latency and labelled token estimates. Counters are process-local. |
| `GET /health` | Readiness and active backend; no financial text or credentials. |
| `POST /verify` | `{identityMatch:false,fraudFlags:[],available:false}`; unavailable verification cannot release a hold. |

Collections: `policy`, `contracts`, `decisions`, `corrections`. `k` is a JSON integer from 1–50 (default 3; agent tools cap it at 5). Blank text, malformed dates and invalid `k` return HTTP 422.

**Scope:** pass `entity` and `asOf` for every close. Compatible requests that omit them use `eo-festival-nyc` and the conservative **July 31, 2026** default. Thus an older client never silently sees August/September knowledge during July. The Convex adapter now supplies its actual entity and month-end date. Filters are applied before ranking and checked again before returning source text. The August 10 Brightwater amendment is unavailable in July.

Runtime decision example (send only after actual review, using the real decision ID and text):

```json
{
  "collection": "decisions",
  "id": "YOUR-ACTUAL-DECISION-ID",
  "text": "Verbatim recorded reviewer decision and its rationale",
  "meta": {
    "entity": "eo-festival-nyc",
    "effectiveDate": "2026-07-31",
    "reviewer": "human",
    "outcome": "approved",
    "scope": {"breakKind": "deposit_shortfall", "policyClause": "policy-5.1"}
  }
}
```

`meta.effectiveDate` is required for every indexed chunk; unknown dates return HTTP 422 instead of becoming false historical evidence. `meta.validTo` may bound validity. Preserve reviewer/outcome/scope so the controls engine can distinguish human precedent from routine engine decisions. Corrections use the same envelope with `collection: "corrections"`, the actual correction ID, and the human instruction or failed rule text. The trusted backend is responsible for authorization and review provenance; indexing a string does not grant posting authority. Use versioned source IDs for changed clauses/decisions so old citations retain their meaning.

Storage is SQLite under `.data/`, separated by backend/index. Moss is the durable remote corpus in Moss mode; the canonical local mirror is restored from that owned index on startup. The native cache and all local data are gitignored. Local mode requires persistent disk if deployed and runtime memory must survive replacement of a container.

`tokensUsed` / `tokensFullContext` use `ceil(characters/4)` for retrieved versus full eligible context. `tokenCounting: "estimate_chars_div_4"` labels this approximation. These are not actual Claude billing tokens or a measured cost-savings claim.

## Bootstrap and check

Startup bootstraps only an explicit allowlist of policy/contract clauses. It never indexes `answerKey`, `breaks`, planted flags, books, attendance, or simulated human approvals. Re-send source clauses to an existing service with:

```bash
uv run --env-file .env bootstrap.py --url http://127.0.0.1:8000
uv run python -m unittest discover -s tests -v
```

The tests use isolated local catalogs and mock the SDK boundary; no credentials are needed. The real Moss runs are recorded separately in [PHASE2_AUDIT.md](PHASE2_AUDIT.md). Regenerate the agreed specification with `uv run python export_openapi.py`.

## Vultr deployment

The shared synthetic demo is hosted on Vultr. See [the verified deployment handoff](VULTR.md) for the server, health checks, update commands, and current close-review limitations.

## Railway package / team connection

`Dockerfile` and `railway.env.example` are included as the deployment package. They were prepared here; no Railway service was created and the Docker image was not built in this environment.

Configuration references: [Railway config as code](https://docs.railway.com/config-as-code) and [Dockerfile deployments](https://docs.railway.com/builds/dockerfiles).

Create/select a Railway service from the team repository and keep its build root at the repository root. Set `RAILWAY_DOCKERFILE_PATH=/retrieval/Dockerfile` and the service variables listed in `railway.env.example`, filling the project credentials and a random shared API token. Set the healthcheck path to `/health`; allow 300 seconds for initial model warm-up. The image generates the synthetic seed during build and starts with Railway's `$PORT`. No credentials are copied into the image.

The current Railway docs deprecate `railway.toml`/`railway.json` for new services. This package uses the documented Dockerfile-path variable and service settings; a future code-managed project can use Railway's current [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code) workflow.

Give Group C the public service URL and shared API token. Set `RETRIEVAL_URL` and `RETRIEVAL_API_KEY` on the intended Convex deployment; callers use `Authorization: Bearer <token>`. Hosted Convex actions need a reachable service URL, so this machine's `127.0.0.1:8000` is for local testing. `/health` remains public; data endpoints require the token when configured. The adapter forwards the token and consumes the agreed array response.

C4 publishing is now merged and aligned: it sends actual decisions/corrections with reviewer/outcome/scope/effective date, batches the 21 source clauses, forwards the service token, and selects the stats fields its return validator supports. Source clauses without known dates are skipped until re-seeded with the current loader. The sidecar logs and echoes valid `X-Trace-Id` values for cross-service correlation without logging query text or tokens.

Remaining C3/B3 event integration: consume non-cash source documents and imported books for duplicate payables, sponsorship amendments/revenue schedules, bank changes, and accruals (families 2, 4, 5, 6). A bank-only scan leaves these six period-specific cases undiscovered. Full agent/human close and planted-error scoring results are not claimed by the rehearsal.
