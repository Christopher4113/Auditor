"""Interface 1: persistent scoped retrieval, real Moss or labelled local search.

Run: uv run --env-file .env uvicorn main:app --reload --port 8000
Spec: uv run python export_openapi.py
"""
from contextlib import asynccontextmanager
from datetime import date
import hmac
import logging
import math
import re
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import AliasChoices, BaseModel, Field

from service import RetrievalService, Settings
from store import Document

Collection = Literal["policy", "contracts", "decisions", "corrections"]
logger = logging.getLogger("auditor.retrieval")


class Chunk(BaseModel):
    collection: Collection
    id: str = Field(min_length=1, max_length=200, pattern=r"\S")
    text: str = Field(min_length=1, max_length=20000, pattern=r"\S")
    meta: dict = Field(default_factory=dict)


class Batch(BaseModel):
    chunks: list[Chunk] = Field(min_length=1, max_length=100)


class Query(BaseModel):
    collection: Collection
    text: str = Field(min_length=1, max_length=4000, pattern=r"\S", validation_alias=AliasChoices("text", "query"))
    k: int = Field(default=3, ge=1, le=50, strict=True)
    entity: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,80}$")
    asOf: date | None = None


class Resolve(BaseModel):
    collection: Collection
    id: str = Field(min_length=1, max_length=200)
    entity: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,80}$")
    asOf: date | None = None


class Hit(BaseModel):
    id: str
    text: str
    score: float


class VerifyRequest(BaseModel):
    testIdentityId: str = Field(min_length=1, pattern=r"\S")


class VerifyResult(BaseModel):
    identityMatch: bool
    fraudFlags: list[str]
    available: bool


def normalize(chunk: Chunk, settings: Settings) -> Document:
    meta = dict(chunk.meta)
    meta.setdefault("entity", settings.entity)
    if not isinstance(meta["entity"], str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", meta["entity"]):
        raise HTTPException(422, "meta.entity must be an entity ID")
    if "effectiveDate" not in meta:
        if chunk.collection in {"decisions", "corrections"}:
            raise HTTPException(422, "Runtime memory requires meta.effectiveDate")
        meta["effectiveDate"] = "2026-07-01"
    try:
        start = date.fromisoformat(meta["effectiveDate"])
        end = date.fromisoformat(meta.get("validTo", "9999-12-31"))
    except (ValueError, TypeError):
        raise HTTPException(422, "Metadata dates must be ISO YYYY-MM-DD")
    if start > end:
        raise HTTPException(422, "validTo precedes effectiveDate")
    return Document(chunk.collection, chunk.id, chunk.text, meta)


def create_app(settings: Settings | None = None, backend=None) -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app):
        service = RetrievalService(settings, backend)
        try:
            logger.info("Starting %s retrieval; warming index before readiness", service.backend.name)
            await service.start()
            app.state.service = service
            yield
        finally:
            await service.close()

    app = FastAPI(title="Auditor retrieval", version="0.2.0", lifespan=lifespan,
        description="Phase 2 persistent policy/contract and runtime decision/correction retrieval. "
        "Backend is reported by /stats and /health. CRS remains unavailable until A6.")
    app.state.service = None
    bearer = HTTPBearer(auto_error=False)

    def authorize(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
        if settings.api_key and (credentials is None or not hmac.compare_digest(credentials.credentials, settings.api_key)):
            raise HTTPException(401, "Retrieval service authorization required")

    def service() -> RetrievalService:
        if app.state.service is None:
            raise HTTPException(503, "Retrieval is not ready")
        return app.state.service

    async def unavailable(operation):
        try:
            return await operation
        except HTTPException:
            raise
        except Exception as exc:
            # SDK error strings can include request context; never echo them.
            logger.error("Retrieval operation failed (%s)", type(exc).__name__)
            raise HTTPException(503, "Retrieval backend unavailable; check service configuration")

    @app.get("/health")
    def health():
        svc = service()
        return {"ready": True, "backend": svc.backend.name, "documents": len(svc.catalog.all())}

    @app.post("/index", dependencies=[Depends(authorize)])
    async def index(chunk: Chunk) -> dict:
        await unavailable(service().index([normalize(chunk, settings)]))
        return {"ok": True, "id": chunk.id}

    @app.post("/index/batch", dependencies=[Depends(authorize)])
    async def index_batch(batch: Batch) -> dict:
        documents = [normalize(chunk, settings) for chunk in batch.chunks]
        if len({doc.key for doc in documents}) != len(documents):
            raise HTTPException(422, "Duplicate source IDs within one batch")
        changed = await unavailable(service().index(documents))
        return {"ok": True, "indexed": changed, "documents": len(documents)}

    @app.post("/query", dependencies=[Depends(authorize)])
    async def query(q: Query) -> list[Hit]:
        results = await unavailable(service().query(q.collection, q.text, q.k,
            q.entity or settings.entity, q.asOf.isoformat() if q.asOf else settings.default_as_of))
        if any(not math.isfinite(score) for _, score in results):
            raise HTTPException(503, "Retrieval returned invalid relevance scores")
        return [Hit(id=doc.id, text=doc.text, score=score) for doc, score in results]

    @app.post("/resolve", dependencies=[Depends(authorize)])
    def resolve(q: Resolve) -> dict:
        documents = service().visible(q.collection, q.entity or settings.entity,
            q.asOf.isoformat() if q.asOf else settings.default_as_of)
        found = next((doc for doc in documents if doc.id == q.id), None)
        if found is None:
            raise HTTPException(404, "Source not found in this entity and as-of scope")
        return {"id": found.id, "text": found.text, "meta": found.meta}

    @app.get("/stats", dependencies=[Depends(authorize)])
    def stats() -> dict:
        return service().stats()

    @app.post("/verify", dependencies=[Depends(authorize)])
    def verify(_: VerifyRequest) -> VerifyResult:
        return VerifyResult(identityMatch=False, fraudFlags=[], available=False)

    return app


app = create_app()
