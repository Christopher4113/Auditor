"""Persistent canonical chunks. Answer keys and planted flags never enter here."""

from dataclasses import dataclass
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
from threading import RLock


@dataclass(frozen=True)
class Document:
    collection: str
    id: str
    text: str
    meta: dict

    @property
    def key(self) -> str:
        return sha256(f"{self.meta['entity']}\0{self.collection}\0{self.id}".encode()).hexdigest()

    def visible(self, collection: str, entity: str, as_of: str) -> bool:
        return (self.collection == collection and self.meta["entity"] == entity
                and self.meta["effectiveDate"] <= as_of <= self.meta.get("validTo", "9999-12-31"))


class Catalog:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = RLock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS chunks (key TEXT PRIMARY KEY, collection TEXT NOT NULL, source_id TEXT NOT NULL, text TEXT NOT NULL, meta TEXT NOT NULL)")
        self.db.execute("CREATE TABLE IF NOT EXISTS pending_resets (entity TEXT PRIMARY KEY, snapshot TEXT NOT NULL)")
        self.db.commit()

    def all(self) -> list[Document]:
        with self.lock:
            return [Document(collection, id, text, json.loads(meta)) for collection, id, text, meta
                    in self.db.execute("SELECT collection, source_id, text, meta FROM chunks ORDER BY key")]

    def put(self, documents: list[Document]) -> None:
        with self.lock, self.db:
            self.db.executemany("INSERT INTO chunks VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET collection=excluded.collection, source_id=excluded.source_id, text=excluded.text, meta=excluded.meta",
                [(d.key, d.collection, d.id, d.text, json.dumps(d.meta, sort_keys=True)) for d in documents])

    def replace(self, documents: list[Document]) -> None:
        with self.lock, self.db:
            self.db.execute("DELETE FROM chunks")
            self.put(documents)

    def replace_entity(self, entity: str, documents: list[Document]) -> None:
        with self.lock, self.db:
            keys = [(doc.key,) for doc in self.all() if doc.meta["entity"] == entity]
            self.db.executemany("DELETE FROM chunks WHERE key = ?", keys)
            self.db.executemany("INSERT INTO chunks VALUES (?, ?, ?, ?, ?)",
                [(d.key, d.collection, d.id, d.text, json.dumps(d.meta, sort_keys=True)) for d in documents])
            self.db.execute("DELETE FROM pending_resets WHERE entity = ?", (entity,))

    def begin_reset(self, entity: str, documents: list[Document]) -> None:
        with self.lock, self.db:
            self.db.execute("INSERT INTO pending_resets VALUES (?, ?) ON CONFLICT(entity) DO UPDATE SET snapshot=excluded.snapshot",
                (entity, json.dumps([{"collection": d.collection, "id": d.id, "text": d.text, "meta": d.meta} for d in documents])))

    def pending_resets(self):
        with self.lock:
            return [(entity, [Document(**row) for row in json.loads(snapshot)])
                    for entity, snapshot in self.db.execute("SELECT entity, snapshot FROM pending_resets")]

    def close(self) -> None:
        with self.lock:
            self.db.close()


def seed_chunks(seed: dict) -> list[Document]:
    """Explicit allowlist: only policy/contract clauses, never scoring data/books.

    Decisions and corrections are added at runtime by the backend after review.
    No D-0417 fixture is silently inserted into real memory.
    """
    entity = seed["entity"]
    output = [Document("policy", row["id"], row["text"], {
        "entity": entity, "effectiveDate": row["effectiveDate"], "sourceType": "policy",
        "policyPackId": row["policyPackId"], "title": f"Policy {row['number']}",
    }) for row in seed["policyClauses"]]
    for contract in seed["contracts"]:
        for clause in contract["clauses"]:
            output.append(Document("contracts", clause["id"], clause["text"], {
                "entity": entity, "effectiveDate": clause["effectiveDate"], "sourceType": "contract",
                "contractId": contract["id"], "vendorId": contract["vendorId"], "title": contract["title"],
            }))
    return output
