"""Scoped, persistent retrieval orchestration; no accounting decisions."""

import asyncio
from collections import deque
from dataclasses import dataclass
from datetime import date
import json
import os
from pathlib import Path
from statistics import median
import time

from backends import LocalBackend, MossBackend
from store import Catalog, Document, seed_chunks

ROOT = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Settings:
    backend: str = "local"
    data_dir: Path = ROOT / ".data"
    seed_path: Path | None = ROOT.parent / "datagen" / "seed.json"
    entity: str = "eo-festival-nyc"
    default_as_of: str = "2026-07-31"
    project_id: str = ""
    project_key: str = ""
    index_name: str = "auditor-memory-v2"
    api_key: str = ""

    @classmethod
    def from_env(cls):
        pid, key = os.getenv("MOSS_PROJECT_ID", ""), os.getenv("MOSS_PROJECT_KEY", "")
        return cls(backend=os.getenv("RETRIEVAL_BACKEND", "moss" if pid and key else "local"),
            data_dir=Path(os.getenv("RETRIEVAL_DATA_DIR", str(ROOT / ".data"))),
            seed_path=Path(os.getenv("RETRIEVAL_SEED_PATH", str(ROOT.parent / "datagen" / "seed.json"))),
            entity=os.getenv("RETRIEVAL_ENTITY", "eo-festival-nyc"),
            default_as_of=os.getenv("RETRIEVAL_DEFAULT_AS_OF", "2026-07-31"),
            project_id=pid, project_key=key, index_name=os.getenv("MOSS_INDEX_NAME", "auditor-memory-v2"),
            api_key=os.getenv("RETRIEVAL_API_KEY", ""))


class RetrievalService:
    def __init__(self, settings: Settings, backend=None):
        self.settings = settings
        if settings.backend not in {"local", "moss"}:
            raise ValueError("RETRIEVAL_BACKEND must be local or moss")
        if settings.backend == "moss" and not (settings.project_id and settings.project_key):
            raise ValueError("Moss mode requires MOSS_PROJECT_ID and MOSS_PROJECT_KEY")
        date.fromisoformat(settings.default_as_of)
        self.catalog = Catalog(settings.data_dir / f"{settings.backend}-{settings.index_name}.sqlite3")
        self.backend = backend or (MossBackend(settings.project_id, settings.project_key,
            settings.index_name, settings.data_dir / "moss-cache") if settings.backend == "moss" else LocalBackend())
        self.lock = asyncio.Lock()
        self.latencies = deque(maxlen=1000)
        self.retrievals = self.tokens_used = self.tokens_full = 0
        self.ready = True

    async def start(self):
        remote = await self.backend.start()
        if self.backend.name == "moss":
            self.catalog.replace(remote)
        # Replay a durable replacement journal after a crash/partial cloud write.
        # Readiness is never advertised for a half-reset corpus.
        for entity, documents in self.catalog.pending_resets():
            await self.reindex(entity, documents)
        path = self.settings.seed_path
        if path and path.exists():
            seed = json.loads(path.read_text(encoding="utf-8"))
            await self.index(seed_chunks(seed))

    async def index(self, documents: list[Document]) -> int:
        async with self.lock:
            if not self.ready:
                raise RuntimeError("Retry the complete replacement before indexing")
            current = {doc.key: doc for doc in self.catalog.all()}
            documents = [Document(doc.collection, doc.id, doc.text,
                {**(current[doc.key].meta if doc.key in current else {}), **doc.meta}) for doc in documents]
            changed = [doc for doc in documents if current.get(doc.key) != doc]
            if changed:
                await self.backend.upsert(changed)
                self.catalog.put(changed)
            return len(changed)

    async def reindex(self, entity: str, documents: list[Document], reset_counters=False):
        async with self.lock:
            current = self.catalog.all()
            keep = {doc.key for doc in documents}
            removed = [doc for doc in current if doc.meta["entity"] == entity and doc.key not in keep]
            self.catalog.begin_reset(entity, documents)
            self.ready = False
            await self.backend.replace_entity(entity, documents, removed)
            self.catalog.replace_entity(entity, documents)
            self.ready = not self.catalog.pending_resets()
            if reset_counters:
                self.latencies.clear()
                self.retrievals = self.tokens_used = self.tokens_full = 0
            return {"ok": True, "entity": entity, "documents": len(documents), "deleted": len(removed)}

    def visible(self, collection, entity, as_of):
        return [doc for doc in self.catalog.all() if doc.visible(collection, entity, as_of)]

    async def query(self, collection: str, text: str, k: int, entity: str, as_of: str):
        async with self.lock:
            if not self.ready:
                raise RuntimeError("Index replacement incomplete")
            return await self._query(collection, text, k, entity, as_of)

    async def _query(self, collection: str, text: str, k: int, entity: str, as_of: str):
        start = time.perf_counter()
        documents = self.visible(collection, entity, as_of)
        # fetch_contract often supplies only an invented counterparty name.
        # Its authoritative title identifies the contract even when that name
        # is absent from a clause's verbatim body. Scope first, then rank.
        if collection == "contracts":
            needle = " ".join(text.casefold().split())
            matching = [doc for doc in documents if needle in " ".join(str(doc.meta.get("title", "")).casefold().split())
                        or needle == doc.id.casefold()]
            if matching:
                documents = matching
        results = await self.backend.query(text, documents, k)
        # A provider is never allowed to return a different scope or modified text.
        allowed = {doc.key: doc for doc in documents}
        safe = [(allowed[doc.key], score) for doc, score in results if doc.key in allowed]
        self.latencies.append((time.perf_counter() - start) * 1000)
        self.retrievals += 1
        estimate = lambda value: (len(value) + 3) // 4
        self.tokens_used += estimate(text) + sum(estimate(doc.text) for doc, _ in safe)
        self.tokens_full += estimate(text) + sum(estimate(doc.text) for doc in documents)
        return safe

    def stats(self):
        documents = self.catalog.all()
        return {"backend": self.backend.name, "ready": self.ready, "documents": len(documents),
            "collections": {name: sum(d.collection == name for d in documents)
                            for name in ("policy", "contracts", "decisions", "corrections", "events")},
            "retrievals": self.retrievals, "medianLatencyMs": median(self.latencies) if self.latencies else 0,
            "tokensUsed": self.tokens_used, "tokensFullContext": self.tokens_full,
            "tokenCounting": "estimate_chars_div_4", "counterScope": "process_since_start_or_explicit_reset",
            "latencySamples": len(self.latencies), "latencyWindowSize": self.latencies.maxlen}

    async def close(self):
        try:
            await self.backend.close()
        finally:
            self.catalog.close()
