"""Phase 2 API contract tests: actual scoped search, no external services."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
import httpx
import yaml

RETRIEVAL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RETRIEVAL))
from main import create_app
from service import Settings
from backends import LocalBackend


class RetrievalContractTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.settings = Settings(data_dir=Path(self.tmp.name), seed_path=RETRIEVAL.parent / "datagen/sample.seed.json")
        await self.start()

    async def start(self, settings=None, backend=None):
        self.app = create_app(settings or self.settings, backend)
        self.lifespan = self.app.router.lifespan_context(self.app)
        await self.lifespan.__aenter__()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")

    async def stop(self):
        await self.client.aclose()
        await self.lifespan.__aexit__(None, None, None)

    async def asyncTearDown(self):
        await self.stop()
        self.tmp.cleanup()

    async def query(self, collection="contracts", text="inspection fee", **scope):
        return await self.client.post("/query", json={"collection": collection, "text": text, **scope})

    async def index_memory(self, id="D-test", entity="eo-festival-nyc", effective="2026-07-31"):
        return await self.client.post("/index", json={"collection":"decisions", "id":id,
            "text":"Controller approved expensing a non-recoverable deposit inspection fee.",
            "meta":{"entity":entity,"effectiveDate":effective,"reviewer":"human","fixture":True,
                    "scope":json.dumps({"breakKind":"deposit_shortfall"})}})

    async def test_query_returns_ranked_verbatim_contracts(self):
        response = await self.query()
        self.assertEqual(response.status_code, 200)
        hits = response.json()
        self.assertEqual(hits[0]["id"], "apex-9.4")
        self.assertIn("15% inspection fee", hits[0]["text"])
        self.assertTrue(all(0 <= hit["score"] <= 1 for hit in hits))
        self.assertEqual(set(hits[0]), {"id","text","score"})

    async def test_queries_are_real_and_collections_are_separate(self):
        self.assertEqual((await self.query(text="zzunfindablenonceterm" )).json(), [])
        self.assertEqual((await self.query(collection="decisions")).json(), [])
        policies = (await self.query(collection="policy", text="non recoverable fee receivable")).json()
        self.assertEqual(policies[0]["id"], "policy-5.1")
        self.assertTrue(all(row["id"].startswith("policy-") for row in policies))

    async def test_counterparty_name_selects_its_contract_without_altering_text(self):
        hits = (await self.query(text="Apex Staging")).json()
        self.assertEqual([hit["id"] for hit in hits], ["apex-9.4"])
        self.assertTrue(hits[0]["text"].startswith("A damage deposit"))

    async def test_runtime_memory_is_searchable_and_survives_restart(self):
        self.assertEqual((await self.index_memory()).status_code, 200)
        hits = (await self.query(collection="decisions")).json()
        self.assertEqual([hit["id"] for hit in hits], ["D-test"])
        resolved = await self.client.post("/resolve", json={"collection":"decisions","id":"D-test"})
        self.assertEqual(resolved.json()["meta"]["scope"], {"breakKind":"deposit_shortfall"})
        await self.stop()
        await self.start()
        self.assertEqual((await self.query(collection="decisions")).json()[0]["id"], "D-test")

    async def test_index_is_idempotent(self):
        await self.index_memory()
        await self.index_memory()
        stats = (await self.client.get("/stats")).json()
        self.assertEqual(stats["collections"]["decisions"], 1)

    async def test_runtime_corrections_are_a_separate_collection(self):
        response = await self.client.post("/index", json={"collection":"corrections","id":"C-test",
            "text":"Void the repeated SoundWave payable before proposing another payment.",
            "meta":{"effectiveDate":"2026-07-31","scope":"duplicate payable"}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual((await self.query(collection="corrections", text="repeated payable")).json()[0]["id"], "C-test")
        self.assertEqual((await self.query(collection="decisions", text="repeated payable")).json(), [])

    async def test_entity_isolation_and_future_memory(self):
        await self.index_memory("D-other", entity="other-entity")
        await self.index_memory("D-future", effective="2026-09-25")
        self.assertEqual((await self.query(collection="decisions", asOf="2026-07-31")).json(), [])
        hits = (await self.query(collection="decisions", asOf="2026-09-30")).json()
        self.assertEqual([row["id"] for row in hits], ["D-future"])

    async def test_amendment_is_unavailable_before_it_was_signed(self):
        request = {"collection":"contracts","id":"brightwater-amendment-1","asOf":"2026-07-31"}
        self.assertEqual((await self.client.post("/resolve", json=request)).status_code, 404)
        request["asOf"] = "2026-08-31"
        resolved = await self.client.post("/resolve", json=request)
        self.assertEqual(resolved.status_code, 200)
        self.assertIn("$30,000", resolved.json()["text"])

    async def test_future_documents_do_not_crowd_out_visible_hits(self):
        await self.index_memory("D-visible")
        for i in range(8):
            await self.index_memory(f"D-later-{i}", effective="2026-09-30")
        hits = (await self.query(collection="decisions", asOf="2026-07-31", k=1)).json()
        self.assertEqual([hit["id"] for hit in hits], ["D-visible"])

    async def test_invalid_inputs_return_422(self):
        for k in (-1, 0, 51, True, 1.5, "2", None):
            with self.subTest(k=k):
                self.assertEqual((await self.query(k=k)).status_code, 422)
        for body in ({}, {"collection":"answerKey","text":"fee"},
                     {"collection":"policy","text":"   "},
                     {"collection":"policy","text":"fee","asOf":"not-a-date"}):
            self.assertEqual((await self.client.post("/query", json=body)).status_code, 422)
        for collection in ("policy","contracts","decisions","corrections"):
            self.assertEqual((await self.client.post("/index",json={"collection":collection,"id":"D","text":"approval"})).status_code,422)

    async def test_stats_are_measured_and_estimates_labelled(self):
        self.assertEqual((await self.client.get("/stats")).json()["retrievals"], 0)
        await self.query()
        stats = (await self.client.get("/stats")).json()
        self.assertEqual(stats["backend"], "local")
        self.assertEqual(stats["retrievals"], 1)
        self.assertGreater(stats["medianLatencyMs"], 0)
        self.assertGreater(stats["tokensUsed"], 0)
        self.assertGreaterEqual(stats["tokensFullContext"], stats["tokensUsed"])
        self.assertEqual(stats["tokenCounting"], "estimate_chars_div_4")

    async def test_authentication_can_protect_reads_and_writes(self):
        await self.stop()
        await self.start(Settings(data_dir=Path(self.tmp.name), seed_path=None, api_key="test-only"))
        self.assertEqual((await self.query()).status_code, 401)
        self.assertEqual((await self.client.get("/stats")).status_code, 401)
        self.assertEqual((await self.client.get("/health")).status_code, 200)
        self.assertEqual((await self.client.get("/stats",headers={"Authorization":"Bearer test-only"})).status_code, 200)

    async def test_backend_failure_returns_503_without_fallback_or_secrets(self):
        class Broken(LocalBackend):
            name = "moss"
            async def query(self, *args):
                raise RuntimeError("secret-key-sentinel")
        await self.stop()
        await self.start(backend=Broken())
        response = await self.query()
        self.assertEqual(response.status_code,503)
        self.assertNotIn("secret-key-sentinel",response.text)

    async def test_resolve_verifies_exact_text(self):
        response=await self.client.post("/resolve",json={"collection":"policy","id":"policy-5.1"})
        self.assertEqual(response.status_code,200)
        seed=json.loads(self.settings.seed_path.read_text())
        policy=next(row for row in seed["policyClauses"] if row["id"]=="policy-5.1")
        self.assertEqual(response.json()["text"],policy["text"])

    async def test_verify_remains_fail_closed(self):
        response=await self.client.post("/verify",json={"testIdentityId":"unconfigured-test-only"})
        self.assertEqual(response.json(),{"identityMatch":False,"fraudFlags":[],"available":False})

    async def test_legacy_query_alias_and_bounds(self):
        response=await self.client.post("/query",json={"collection":"contracts","query":"inspection fee","k":1})
        self.assertEqual(response.status_code,200)
        self.assertEqual(len(response.json()),1)

    async def test_openapi_matches_committed_spec(self):
        self.assertEqual(yaml.safe_load((RETRIEVAL/"openapi.yaml").read_text()),
                         (await self.client.get("/openapi.json")).json())

    async def test_batch_rejects_duplicates(self):
        chunk={"collection":"policy","id":"same","text":"a clause","meta":{"effectiveDate":"2026-07-01"}}
        response=await self.client.post("/index/batch",json={"chunks":[chunk,chunk]})
        self.assertEqual(response.status_code,422)

    async def test_trace_id_is_preserved_without_changing_response_contract(self):
        response = await self.client.post("/query", json={"collection":"contracts","text":"inspection fee"},
            headers={"X-Trace-Id":"T-bank-apex-refund"})
        self.assertEqual(response.headers.get("X-Trace-Id"), "T-bank-apex-refund")
        self.assertIsInstance(response.json(), list)


if __name__ == "__main__":
    unittest.main()
