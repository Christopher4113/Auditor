"""Send only policy/contract clauses to a running local or deployed service."""
import argparse
import json
import os
from pathlib import Path
import httpx
from store import seed_chunks

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--seed", type=Path, default=Path(__file__).resolve().parents[1] / "datagen/seed.json")
    args = parser.parse_args()
    chunks = seed_chunks(json.loads(args.seed.read_text(encoding="utf-8")))
    key = os.getenv("RETRIEVAL_API_KEY", "")
    response = httpx.post(args.url.rstrip("/") + "/index/batch",
        headers={"Authorization": f"Bearer {key}"} if key else {},
        json={"chunks": [{"collection": d.collection, "id": d.id, "text": d.text, "meta": d.meta} for d in chunks]},
        timeout=300)
    response.raise_for_status()
    print(f"Bootstrapped {len(chunks)} clauses: {response.json()}")
