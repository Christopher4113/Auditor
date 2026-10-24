"""Real Moss provider and an explicitly labelled local lexical provider."""

from collections import Counter
import json
import math
from pathlib import Path
import re

from store import Document


def words(text: str) -> list[str]:
    return re.findall(r"[\w]+", text.casefold())


class LocalBackend:
    name = "local"

    async def start(self) -> list[Document]:
        return []

    async def upsert(self, documents: list[Document]) -> None:
        pass  # Catalog is the durable store for local mode.

    async def query(self, text: str, documents: list[Document], k: int) -> list[tuple[Document, float]]:
        terms = set(words(text))
        tokenized = [(doc, words(doc.text + " " + str(doc.meta.get("title", "")) + " " + doc.id)) for doc in documents]
        average = sum(len(tokens) for _, tokens in tokenized) / max(len(tokenized), 1)
        ranks = []
        for doc, tokens in tokenized:
            counts = Counter(tokens)
            score = 0.0
            for term in terms & counts.keys():
                frequency = sum(term in other_tokens for _, other_tokens in tokenized)
                idf = math.log(1 + (len(documents) - frequency + 0.5) / (frequency + 0.5))
                tf = counts[term]
                score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * len(tokens) / max(average, 1)))
            if score > 0:
                ranks.append((doc, score / (1 + score)))
        return sorted(ranks, key=lambda pair: (-pair[1], pair[0].id))[:k]

    async def close(self) -> None:
        pass


class MossBackend:
    name = "moss"

    def __init__(self, project_id: str, project_key: str, index_name: str, cache: Path):
        from moss import MossClient
        self.client = MossClient(project_id, project_key, cache_path=str(cache))
        self.index_name = index_name
        self.loaded = False

    async def start(self) -> list[Document]:
        indexes = await self.client.list_indexes()
        names = {getattr(info, "name", None) or getattr(info, "index_name", None) for info in indexes}
        if self.index_name not in names:
            return []
        raw = await self.client.get_docs(self.index_name)
        documents = []
        for item in raw:
            metadata = item.metadata or {}
            if "auditorMeta" in metadata and metadata.get("collection") in {"policy", "contracts", "decisions", "corrections"}:
                documents.append(Document(metadata["collection"], metadata["sourceId"], item.text, json.loads(metadata["auditorMeta"])))
        await self.client.load_index(self.index_name, auto_refresh=True, polling_interval_in_seconds=60)
        self.loaded = True
        return documents

    async def upsert(self, documents: list[Document]) -> None:
        from moss import DocumentInfo, MutationOptions
        raw = [DocumentInfo(id=d.key, text=d.text, metadata={
            "collection": d.collection, "sourceId": d.id, "entity": d.meta["entity"],
            "effectiveDate": d.meta["effectiveDate"], "validTo": d.meta.get("validTo", "9999-12-31"),
            "auditorMeta": json.dumps(d.meta, sort_keys=True),
        }) for d in documents]
        if not self.loaded:
            await self.client.create_index(self.index_name, raw)
        else:
            await self.client.add_docs(self.index_name, raw, MutationOptions(upsert=True))
        # Initial warm once; re-check the index version only after a write, never
        # in the query path. Moss swaps updated copies without model cold loads.
        await self.client.load_index(self.index_name, auto_refresh=True, polling_interval_in_seconds=60)
        self.loaded = True

    async def query(self, text: str, documents: list[Document], k: int) -> list[tuple[Document, float]]:
        from moss import QueryOptions
        if not documents:
            return []
        allowed = {doc.key: doc for doc in documents}
        # Filter by canonical eligible IDs. This enforces entity, collection and
        # time BEFORE ranking; future documents cannot crowd out valid results.
        filter = {"$or": [{"field": "sourceId", "condition": {"$eq": doc.id}}
                          for doc in documents]}
        filter = {"$and": [{"field": "entity", "condition": {"$eq": documents[0].meta["entity"]}},
                            {"field": "collection", "condition": {"$eq": documents[0].collection}}, filter]}
        result = await self.client.query(self.index_name, text, QueryOptions(top_k=k, alpha=0.7, filter=filter))
        return [(allowed[doc.id], float(doc.score)) for doc in result.docs if doc.id in allowed]

    async def close(self) -> None:
        await self.client.close()
