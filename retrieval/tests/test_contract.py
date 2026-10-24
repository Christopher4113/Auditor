"""Interface 1 smoke/contract tests, with no external service calls."""

import json
from pathlib import Path
import sys
import unittest

import httpx
import yaml

RETRIEVAL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RETRIEVAL))
from main import app


class RetrievalContractTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://auditor.test",
        )

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_query_returns_documented_fixture_shape(self):
        response = await self.client.post("/query", json={"collection": "contracts", "text": "Apex refund"})
        self.assertEqual(response.status_code, 200)
        hits = response.json()
        self.assertEqual([hit["id"] for hit in hits], ["D-0417", "apex-9.4", "policy-5.1"])
        for hit in hits:
            self.assertEqual(set(hit), {"id", "text", "score"})
            self.assertTrue(0 <= hit["score"] <= 1)

    async def test_query_k_is_honored_and_never_invents_more_hits(self):
        for k, expected in ((1, 1), (2, 2), (3, 3), (5, 3), (50, 3)):
            with self.subTest(k=k):
                response = await self.client.post("/query", json={"collection": "policy", "text": "fee", "k": k})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(len(response.json()), expected)

    async def test_invalid_k_is_rejected(self):
        for k in (-1, 0, 51, True, 1.5, "2", None):
            with self.subTest(k=k):
                response = await self.client.post("/query", json={"collection": "contracts", "text": "fee", "k": k})
                self.assertEqual(response.status_code, 422)

    async def test_missing_and_blank_inputs_are_rejected(self):
        cases = [
            ("/query", {}),
            ("/query", {"collection": "", "text": "fee"}),
            ("/query", {"collection": "contracts", "text": "   "}),
            ("/index", {"collection": "policy", "id": "", "text": "fee"}),
            ("/index", {"collection": "policy", "id": "policy-5.1", "text": ""}),
            ("/verify", {}),
            ("/verify", {"testIdentityId": "   "}),
        ]
        for route, payload in cases:
            with self.subTest(route=route, payload=payload):
                self.assertEqual((await self.client.post(route, json=payload)).status_code, 422)

    async def test_index_only_acknowledges_and_does_not_change_fixture_search(self):
        response = await self.client.post("/index", json={
            "collection": "policy", "id": "test-chunk", "text": "This is a test chunk.",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True, "id": "test-chunk"})
        hits = (await self.client.post("/query", json={"collection": "policy", "text": "test chunk"})).json()
        self.assertNotIn("test-chunk", [hit["id"] for hit in hits])

    async def test_stats_remain_honest_placeholders(self):
        response = await self.client.get("/stats")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "retrievals": 0, "medianLatencyMs": 0, "tokensUsed": 0, "tokensFullContext": 0,
        })

    async def test_verification_always_fails_closed(self):
        response = await self.client.post("/verify", json={"testIdentityId": "unconfigured-test-only"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"identityMatch": False, "fraudFlags": [], "available": False})

    async def test_seed_citation_ids_and_verbatim_text_match_api(self):
        sample = json.loads((RETRIEVAL.parent / "datagen" / "sample.seed.json").read_text())
        clauses = {row["id"]: row["text"] for row in sample["policyClauses"]}
        clauses.update({clause["id"]: clause["text"] for contract in sample["contracts"]
                        for clause in contract["clauses"]})
        hits = (await self.client.post("/query", json={"collection": "contracts", "text": "Apex"})).json()
        resolved = 0
        for hit in hits:
            if hit["id"] != "D-0417":  # Canned precedent is deliberately not a seeded human decision.
                self.assertEqual(clauses[hit["id"]], hit["text"])
                resolved += 1
        self.assertEqual(resolved, 2)

    async def test_committed_openapi_matches_running_app(self):
        committed = yaml.safe_load((RETRIEVAL / "openapi.yaml").read_text())
        response = await self.client.get("/openapi.json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(committed, response.json())


if __name__ == "__main__":
    unittest.main()
