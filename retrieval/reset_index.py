"""Replace one entity's index with the seed's policy/contract allowlist.

This deliberately removes its runtime decisions/corrections. It never resets
Convex and never sends the answer key. Use --dry-run to inspect counts first.
"""
import argparse
import json
import os
from pathlib import Path
import httpx
from store import seed_chunks


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url",default="http://127.0.0.1:8000")
    parser.add_argument("--seed",type=Path,default=Path(__file__).resolve().parents[1]/"datagen/seed.json")
    parser.add_argument("--dry-run",action="store_true")
    parser.add_argument("--reset-counters",action="store_true",help="Also reset service-wide retrieval counters")
    args=parser.parse_args()
    seed=json.loads(args.seed.read_text())
    documents=seed_chunks(seed)
    body={"entity":seed["entity"],"chunks":[{"collection":d.collection,"id":d.id,"text":d.text,"meta":d.meta} for d in documents],
          "resetCounters":args.reset_counters}
    if args.dry_run:
        print(json.dumps({"dryRun":True,"entity":seed["entity"],"documents":len(documents),
                          "collections":sorted({d.collection for d in documents}),"runtimeMemoryWillBeRemoved":True}))
        return
    headers={"Authorization":"Bearer "+os.environ["RETRIEVAL_API_KEY"]} if os.getenv("RETRIEVAL_API_KEY") else {}
    response=httpx.post(args.url.rstrip("/")+"/reindex-all",json=body,headers=headers,timeout=180)
    response.raise_for_status()
    print(json.dumps(response.json(),indent=2))


if __name__=="__main__": main()
