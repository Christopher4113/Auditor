"""Interface 1 (A -> B). Stub: three hardcoded chunks for any query, /verify fails closed.

A4 replaces the bodies with Moss; A6 wires /verify to the CRS sandbox. The shapes do not change.
Run: uv run uvicorn main:app --reload --port 8000
Spec: uv run python -c "import yaml, main; print(yaml.safe_dump(main.app.openapi(), sort_keys=False))" > openapi.yaml
"""
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Auditor retrieval", version="0.1.0")


class Chunk(BaseModel):
    collection: str  # policy | contracts | decisions
    id: str
    text: str
    meta: dict = {}


class Query(BaseModel):
    collection: str
    text: str
    k: int = 3


class Hit(BaseModel):
    id: str
    text: str
    score: float


class VerifyRequest(BaseModel):
    testIdentityId: str


class VerifyResult(BaseModel):
    identityMatch: bool
    fraudFlags: list[str]
    available: bool


STUB_HITS = [  # the moment's three citations, verbatim
    Hit(id="D-0417", text="Northern Lines cancellation fee expensed per policy 5.1; not carried as a receivable.", score=0.91),
    Hit(id="apex-9.4", text="A damage deposit of $16,000 is payable before load-in and refundable within 5 business days after load-out, less a 15% inspection fee.", score=0.88),
    Hit(id="policy-5.1", text="Where a contract makes a fee, penalty or deduction non-recoverable, the amount is expensed in the period it becomes certain. It is not carried as a receivable.", score=0.85),
]


@app.post("/index")
def index(chunk: Chunk) -> dict:
    return {"ok": True, "id": chunk.id}


@app.post("/query")
def query(q: Query) -> list[Hit]:
    return STUB_HITS[: q.k]


@app.get("/stats")
def stats() -> dict:
    return {"retrievals": 0, "medianLatencyMs": 0, "tokensUsed": 0, "tokensFullContext": 0}


@app.post("/verify")
def verify(_: VerifyRequest) -> VerifyResult:
    # ponytail: fail closed until A6 wires the CRS sandbox; Controller escalates on available=False
    return VerifyResult(identityMatch=False, fraudFlags=[], available=False)
