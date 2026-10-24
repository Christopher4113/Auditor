# Retrieval in Phase 1

The final design puts real FastAPI + Moss retrieval in **A4 / Phase 2** and CRS verification + measured statistics in **A6 / Phase 3**. Phase 1 uses the existing Interface 1 stub so Group B/C can exercise their fake Workflow without API keys.

```bash
cd retrieval
uv sync --locked
uv run uvicorn main:app --reload --port 8000
```

Interactive contract: <http://localhost:8000/docs>; checked-in specification: `openapi.yaml`. `pnpm dev:retrieval` also works after copying `.env.example` to the gitignored `.env`; its script explicitly loads that file. Stub startup does not require populated credentials.

| Endpoint | Current stub behavior |
| --- | --- |
| `POST /index` | Acknowledges `{collection, id, text, meta}`. Does not persist or index it. |
| `POST /query` | Returns up to three fixed Apex fixture citations, regardless of collection or query. Does not search Moss. |
| `GET /stats` | Returns zero placeholders. These are not measured performance figures. |
| `POST /verify` | Returns `identityMatch: false`, `fraudFlags: []`, `available: false`. Verification is unavailable and must escalate. |

```bash
curl -s http://localhost:8000/query \
  -H 'Content-Type: application/json' \
  -d '{"collection":"contracts","text":"Apex deposit inspection fee","k":3}'
```

The fixture IDs `apex-9.4` and `policy-5.1` resolve verbatim in [Group A's sample](../datagen/sample.seed.json). `D-0417` is canned precedent until the July close creates a real human decision. The source clauses, entity IDs, effective dates, and data-loading instructions for A4 are in the [data handoff](../datagen/README.md).

CRS/Moss credentials belong only in `retrieval/.env`; Anthropic credentials belong in the backend deployment environment. No secret is needed for the Phase 1 data handoff. Null `crsTestIdentity` values in the seed are not verified identities.
