"""Run the Phase 2 retrieval rehearsal through HTTP handlers, with no LLM.

uv run demo.py --backend local
uv run --env-file .env demo.py --backend moss
The human decision is an explicitly labelled fixture in an isolated entity/index.
"""
import argparse
import asyncio
from dataclasses import replace
import json
from pathlib import Path
import tempfile
from uuid import uuid4

import httpx
from main import create_app
from service import Settings
from store import seed_chunks


async def run(backend: str, seed_path: Path, phase3=False):
    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    deposit = next(row for row in seed["bankTransactions"] if row["id"] == "bank-apex-deposit")
    refund = next(row for row in seed["bankTransactions"] if row["id"] == "bank-apex-refund")
    entity = "rehearsal-" + uuid4().hex[:12]
    seed["entity"] = entity
    with tempfile.TemporaryDirectory(prefix="auditor-retrieval-") as directory:
        base = Settings.from_env()
        settings = replace(base, backend=backend, entity=entity, seed_path=None,
            data_dir=Path(directory), index_name="auditor-rehearsal-v2", api_key="")
        app = create_app(settings)
        print(f"Phase {3 if phase3 else 2} retrieval rehearsal | backend={backend}", flush=True)
        print("Synthetic human-decision fixture; isolated rehearsal entity. No agent close or controller approval is claimed.", flush=True)
        if backend == "moss":
            print("Warming the real Moss index/model; first load can take tens of seconds...", flush=True)
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://rehearsal") as client:
                chunks = [{"collection": d.collection, "id": d.id, "text": d.text, "meta": d.meta} for d in seed_chunks(seed)]
                response = await client.post("/index/batch", json={"chunks": chunks})
                response.raise_for_status()
                print(f"Indexed {len(chunks)} policy/contract clauses; answer key excluded.", flush=True)
                print(f"Source facts: Apex deposit ${abs(deposit['amount'])/100:,.2f}; refund ${refund['amount']/100:,.2f}; difference ${(abs(deposit['amount'])-refund['amount'])/100:,.2f}.", flush=True)
                for collection, text, expected in [
                    ("contracts", "damage deposit less 15 percent inspection fee", "apex-9.4"),
                    ("policy", "non recoverable contract fee not carried as receivable", "policy-5.1"),
                ]:
                    result = await client.post("/query", json={"collection":collection,"text":text,"asOf":"2026-09-30"})
                    result.raise_for_status()
                    assert expected in [row["id"] for row in result.json()], f"Expected source not retrieved: {expected}"
                    print(f"{collection}: " + ", ".join(f"{h['id']} ({h['score']:.3f})" for h in result.json()), flush=True)
                request = {"collection":"decisions","text":"deposit shortfall nonrecoverable administrative fee","asOf":"2026-09-30"}
                before = (await client.post("/query", json=request)).json()
                assert before == []
                memory = {"collection":"decisions","id":"D-0417","text":
                    "Northern Lines cancellation deposit refunded $51,000 against $60,000. The controller approved expensing the non-recoverable $9,000 administrative fee under contract 7.2 and policy 5.1, clearing the receivable.",
                    "meta":{"entity":entity,"effectiveDate":"2026-07-31","reviewer":"human","outcome":"approved",
                            "fixture":True,"scope":{"breakKind":"deposit_shortfall","policyClause":"policy-5.1"}}}
                indexed = await client.post("/index", json=memory)
                indexed.raise_for_status()
                after = (await client.post("/query", json=request)).json()
                assert [row["id"] for row in after] == ["D-0417"]
                print("Runtime fixture indexing: 0 decision hits -> D-0417 retrieved.", flush=True)
                resolved = await client.post("/resolve", json={"collection":"contracts","id":"brightwater-amendment-1","asOf":"2026-07-31"})
                assert resolved.status_code == 404
                print("Historical scope: August amendment excluded from July.", flush=True)
                stats = (await client.get("/stats")).json()
                print(f"Measured: {stats['retrievals']} retrievals; median {stats['medianLatencyMs']:.2f} ms; backend={stats['backend']}.", flush=True)
                if phase3:
                    peer = {**memory,"id":"D-peer","meta":{**memory["meta"],"entity":entity+"-peer"}}
                    (await client.post("/index",json=peer)).raise_for_status()
                    reset=await client.post("/reindex-all",json={"entity":entity,"chunks":chunks})
                    reset.raise_for_status()
                    assert (await client.post("/query",json=request)).json() == []
                    assert (await client.post("/resolve",json={"entity":entity+"-peer","collection":"decisions","id":"D-peer"})).status_code == 200
                    print("Snapshot reset: stale decision removed; 21 source clauses restored; another entity preserved.",flush=True)
                    closed=(await client.post("/verify",json={"testIdentityId":"unknown-rehearsal-only"})).json()
                    assert closed == {"identityMatch":False,"fraudFlags":[],"available":False}
                    print("Unknown CRS identity: fail closed. This rehearsal does not claim a live CRS result.",flush=True)
                    # Clean only this run's synthetic entities, never shared memory.
                    for cleanup in (entity,entity+"-peer"):
                        (await client.post("/reindex-all",json={"entity":cleanup,"chunks":[]})).raise_for_status()
                print("PASS: real search, verbatim sources, runtime indexing, and historical scoping.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", choices=("local", "moss"), default="local")
    parser.add_argument("--seed", type=Path, default=Path(__file__).resolve().parents[1] / "datagen/seed.json")
    parser.add_argument("--phase3",action="store_true",help="Also rehearse scoped replacement and fail-closed verification")
    args = parser.parse_args()
    if not args.seed.exists():
        parser.error("Generate the Phase 2 seed first: cd datagen && uv run generate.py")
    asyncio.run(run(args.backend, args.seed, args.phase3))


if __name__ == "__main__":
    main()
