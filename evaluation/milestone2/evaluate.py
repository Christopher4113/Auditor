"""Measure the existing local retrieval component and two TF-IDF baselines.

From the repository root:
  uv run --project retrieval python evaluation/milestone2/evaluate.py

No credentials, cloud writes, LLM, controller decisions, or accounting postings.
Labels are loaded only by this evaluator, never indexed or passed to ranking.
"""
from __future__ import annotations

import argparse
import asyncio
from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
import html
import json
import math
from pathlib import Path
import platform
from statistics import median
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(ROOT / "retrieval"), str(ROOT / "datagen")]
from backends import words
from generate import generate
from main import create_app
from service import Settings
from store import seed_chunks
import httpx


def tfidf(query, documents, k=3):
    """Cosine TF-IDF; same text/title/ID fields as the existing local backend."""
    tokens = [Counter(words(d.text + " " + str(d.meta.get("title", "")) + " " + d.id)) for d in documents]
    vocabulary = set().union(*(set(t) for t in tokens)) if tokens else set()
    idf = {t: 1 + math.log((1 + len(tokens)) / (1 + sum(t in row for row in tokens))) for t in vocabulary}
    q = {t: n * idf[t] for t, n in Counter(words(query)).items() if t in idf}
    qnorm = math.sqrt(sum(v * v for v in q.values()))
    scored = []
    for doc, counts in zip(documents, tokens):
        vector = {t: n * idf[t] for t, n in counts.items()}
        denom = qnorm * math.sqrt(sum(v * v for v in vector.values()))
        score = sum(v * vector.get(t, 0) for t, v in q.items()) / denom if denom else 0
        if score > 0:
            scored.append((doc, score))
    return sorted(scored, key=lambda pair: (-pair[1], pair[0].id))[:k]


def metrics(rows):
    positive = [r for r in rows if r["expected"]]
    negative = [r for r in rows if not r["expected"]]
    fraction = lambda n, d: n / d if d else None
    return {
        "n": len(rows), "answerable": len(positive), "negative": len(negative),
        "top1": fraction(sum(r["top1Correct"] for r in positive), len(positive)),
        "hitAt3": fraction(sum(r["hitAt3"] for r in positive), len(positive)),
        "abstention": fraction(sum(not r["hits"] and r["error"] is None for r in negative), len(negative)),
        "taskSuccess": fraction(sum(r["taskSuccess"] for r in rows), len(rows)),
        "scopeViolations": sum(r["scopeViolations"] for r in rows),
        "returnedHits": sum(len(r["hits"]) for r in rows),
        "verbatimHits": sum(r["verbatimHits"] for r in rows),
        "errors": sum(r["error"] is not None for r in rows),
        "medianLatencyMs": median(r["latencyMs"] for r in rows),
    }


async def evaluate(output):
    seed = generate()
    documents = seed_chunks(seed)
    canonical = {(d.meta["entity"], d.collection, d.id): d for d in documents}
    datasets = [(json.loads(p.read_text()), p) for p in [HERE / "policy_queries.json", HERE / "contract_queries.json"]]
    for dataset, _ in datasets:
        collection = "policy" if dataset["name"].startswith("policy") else "contracts"
        for example in dataset["examples"]:
            for expected in example["expected"]:
                doc = canonical.get((seed["entity"], collection, expected))
                if doc is None:
                    raise ValueError(f"Unknown source label: {example['id']}: {expected}")
                if not doc.visible(collection, example.get("entity", seed["entity"]), example.get("asOf", "2026-09-30")):
                    raise ValueError(f"Invisible positive label: {example['id']}")
    records = []
    with tempfile.TemporaryDirectory(prefix="auditor-m2-") as directory:
        app = create_app(Settings(backend="local", data_dir=Path(directory), seed_path=None, entity=seed["entity"]))
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://milestone2") as client:
                indexed = await client.post("/index/batch", json={"chunks":[{"collection":d.collection,"id":d.id,"text":d.text,"meta":d.meta} for d in documents]})
                indexed.raise_for_status()
                for dataset, _ in datasets:
                    collection = "policy" if dataset["name"].startswith("policy") else "contracts"
                    for example in dataset["examples"]:
                        entity = example.get("entity", seed["entity"])
                        asof = example.get("asOf", "2026-09-30")
                        payload = {"collection":collection,"text":example["query"],"entity":entity,"asOf":asof,"k":3}
                        for method in ["unscoped-tfidf", "scoped-tfidf", "auditor-local"]:
                            start = time.perf_counter()
                            error = None
                            try:
                                if method == "auditor-local":
                                    response = await client.post("/query", json=payload)
                                    response.raise_for_status()
                                    hits = response.json()
                                else:
                                    candidates = [d for d in documents if d.collection == collection and
                                        (method == "unscoped-tfidf" or d.visible(collection, entity, asof))]
                                    hits = [{"id":d.id,"text":d.text,"score":s} for d,s in tfidf(example["query"], candidates)]
                            except Exception as exc:
                                hits, error = [], f"{type(exc).__name__}: {exc}"
                            elapsed = (time.perf_counter() - start) * 1000
                            ids = [h["id"] for h in hits]
                            valid = []
                            verbatim = []
                            for hit in hits:
                                # This corpus has one entity and unique IDs per collection.
                                # The production HTTP response deliberately exposes no metadata.
                                doc = canonical.get((seed["entity"], collection, hit["id"]))
                                valid.append(bool(doc and doc.visible(collection, entity, asof)))
                                verbatim.append(bool(doc and doc.text == hit["text"]))
                            expected = example["expected"]
                            top1 = bool(ids and ids[0] in expected and valid[0])
                            records.append({"dataset":dataset["name"],"exampleId":example["id"],"method":method,
                                "request":payload,"expected":expected,"negativeReason":example.get("negative"),
                                "hits":hits,"latencyMs":elapsed,"top1Correct":top1,
                                "hitAt3":any(i in expected and ok for i,ok in zip(ids,valid)),
                                "taskSuccess":error is None and (top1 if expected else not hits),
                                "scopeViolations":sum(not ok for ok in valid),"verbatimHits":sum(verbatim),"error":error})
    summary = [{"dataset":dataset["name"],"method":method,**metrics([r for r in records if r["dataset"] == dataset["name"] and r["method"] == method])}
        for dataset, _ in datasets for method in ["unscoped-tfidf", "scoped-tfidf", "auditor-local"]]
    commit = subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()
    report = {
        "generatedAtUtc":datetime.now(timezone.utc).isoformat(),"sourceCommit":commit,
        "python":platform.python_version(),"platform":platform.platform(),
        "scope":"Retrieval component pilot. auditor-local is the existing FastAPI /query + SQLite + local BM25-style backend, NOT the complete Claude/Convex/Moss system.",
        "conditions":{"k":3,"runsPerExampleMethod":1,"corpusDocuments":len(documents),"modelCalls":0,"cloudCalls":0,
            "latency":"Auditor includes in-process HTTP routing; baselines are direct function calls. Excludes server startup, indexing, network, LLM and close latency; single-run timings are descriptive only.",
            "seed":1328,"labelsPassedToRankers":False,"threshold":"score > 0; no tuned abstention threshold"},
        "hashes":{str(p.relative_to(ROOT)):sha256(p.read_bytes()).hexdigest() for p in [HERE/"evaluate.py",*(p for _,p in datasets),ROOT/"datagen/reference_data.py",ROOT/"retrieval/service.py",ROOT/"retrieval/backends.py"]},
        "datasets":[{k:v for k,v in d.items() if k != "examples"} for d,_ in datasets],"summary":summary,"records":records,
    }
    output.mkdir(parents=True,exist_ok=True)
    (output/"results.json").write_text(json.dumps(report,indent=2)+"\n")
    lines = ["Auditor Milestone 2 — ACTUAL LOCAL RETRIEVAL PILOT", "Component evaluation only; no Claude close or real approvals.",f"Source commit: {commit}",
        f"Corpus: {len(documents)} source-only clauses; 2 datasets x 12 examples x 3 methods = {len(records)} executions.",
        "Top1/Hit@3 denominator: 9 answerable queries. Abstain denominator: 3 negatives.", "",
        "Dataset             Method             Top1    Hit@3   Abstain  Success  Violations  Median ms"]
    pct = lambda value: f"{value:.1%}"
    for row in summary:
        lines.append(f"{row['dataset']:19} {row['method']:18} {pct(row['top1']):7} {pct(row['hitAt3']):7} {pct(row['abstention']):8} {pct(row['taskSuccess']):8} {row['scopeViolations']:10} {row['medianLatencyMs']:9.3f}")
    lines += ["", "Observed Auditor misses (unchanged production ranking):"]
    for row in records:
        if row["method"] == "auditor-local" and not row["taskSuccess"]:
            lines.append(f"{row['exampleId']}: {row['request']['text']} | expected={row['expected']} | got={[h['id'] for h in row['hits']]}")
    lines += ["", "Latency excludes startup/indexing/network/LLM. Auditor includes HTTP routing; baselines do not.", "No full-system precision, accounting correctness, cost savings, or stakeholder acceptance is established."]
    log = "\n".join(lines)+"\n"
    (output/"execution.txt").write_text(log)
    (output/"execution.html").write_text('<!doctype html><meta charset="utf-8"><title>Actual local retrieval pilot</title><style>body{background:#101827;color:#e5edf8;padding:30px}pre{font:16px/1.7 monospace;white-space:pre-wrap}h1{font:26px sans-serif;color:#66dac6}</style><h1>Milestone 2: recorded evaluation output</h1><pre>'+html.escape(log)+'</pre>')
    print(log,end="")


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out",type=Path,default=HERE/"results")
    args=parser.parse_args()
    asyncio.run(evaluate(args.out))
