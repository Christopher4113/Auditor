"""A6: isolated reset recovery and CRS boundaries, no external requests."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from main import create_app
from service import Settings
from backends import LocalBackend
from crs import CRSSettings, CRSVerifier, CLOSED, normalize_report, PERSONAS
from crs_enrichment import normalize as normalize_enrichment


def report(codes=None):
    # Synthetic response fixture following the hackathon guide's exact shape.
    return {"addOnProducts":[{"idManagerVerification":{"messages":[{"code":code,"text":"Synthetic alert"} for code in (codes or [])]}}]}


class CRSTests(unittest.IsolatedAsyncioTestCase):
    async def verifier(self, handler, **changes):
        options = dict(username="test-user", password="test-secret")
        options.update(changes)
        verifier = CRSVerifier(CRSSettings(**options), httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        self.addAsyncCleanup(verifier.close)
        return verifier

    async def test_login_and_verify_use_documented_paths_and_allowlisted_sample(self):
        requests = []
        def handle(request):
            requests.append(request)
            if request.url.path.endswith("/users/login"):
                return httpx.Response(200, json={"token": "test-token"})
            self.assertEqual(request.url.path, "/api/transunion/identity-manager-verification/basic")
            self.assertEqual(request.headers["authorization"], "Bearer test-token")
            self.assertEqual(json.loads(request.content), PERSONAS["P01"]["identity"])
            return httpx.Response(200, json=report())
        verifier = await self.verifier(handle)
        for _ in range(2):
            self.assertEqual(await verifier.verify("P01"), {"identityMatch": True, "fraudFlags": [], "available": True})
        self.assertEqual(len(requests), 3)  # one cached login, two real checks
        self.assertEqual(verifier.stats()["available"], 2)

    async def test_unconfigured_unknown_and_production_urls_never_send_requests(self):
        def unexpected(_): raise AssertionError("must not call network")
        for changes, identity in [({}, "unknown"), ({"username":""}, "P01"),
            ({"base_url":"https://api.stitchcredit.com/api"}, "P01"),
            ({"base_url":"https://api-sandbox.stitchcredit.com.evil.test/api"}, "P01")]:
            verifier = await self.verifier(unexpected, **changes)
            self.assertEqual(await verifier.verify(identity), CLOSED)

    async def test_errors_timeouts_and_unexpected_success_bodies_fail_closed(self):
        for status, body in [(401,{}),(403,{}),(429,{}),(500,{}),(200,{}),(200,{"identityMatch":True})]:
            def handle(request):
                if request.url.path.endswith("/login"): return httpx.Response(200,json={"token":"sentinel-secret"})
                return httpx.Response(status,json=body)
            self.assertEqual(await (await self.verifier(handle)).verify("P01"), CLOSED)
        def timeout(request): raise httpx.ReadTimeout("sentinel-secret",request=request)
        self.assertEqual(await (await self.verifier(timeout)).verify("P01"), CLOSED)

    async def test_expired_token_reauthenticates_once(self):
        calls = {"login":0,"report":0}
        def handle(request):
            if request.url.path.endswith("/login"):
                calls["login"] += 1
                return httpx.Response(200,json={"token":str(calls["login"])})
            calls["report"] += 1
            return httpx.Response(401 if calls["report"] == 1 else 200,json=report())
        self.assertTrue((await (await self.verifier(handle)).verify("P01"))["available"])
        self.assertEqual(calls,{"login":2,"report":2})

    async def test_risk_mismatch_and_incomplete_reports_are_not_clean_checks(self):
        for code,flag in [("2101","address_mismatch"),("2201","ssn_name_mismatch"),("2202","ssn_dob_inconsistent"),("2301","deceased_ssn")]:
            self.assertEqual(normalize_report(report([code])),{"identityMatch":False,"fraudFlags":[flag],"available":True})
        self.assertEqual(normalize_report(report(["2401"])),{"identityMatch":True,"fraudFlags":["fraud_alert_step_up_required"],"available":True})
        self.assertFalse(normalize_report(report(["unknown"]))["identityMatch"])
        for raw in ({},{"addOnProducts":[]},{"addOnProducts":[{"idManagerVerification":{}}]},
                    {"addOnProducts":[{"idManagerVerification":{"messages":None}}]}):
            self.assertEqual(normalize_report(raw), CLOSED)

    async def test_every_persona_uses_its_exact_documented_flat_body(self):
        ids={p["identity"]["ssn"]:id for id,p in PERSONAS.items()}
        seen=[]
        def handle(request):
            if request.url.path.endswith('/login'): return httpx.Response(200,json={"token":"fixture"})
            body=json.loads(request.content); id=ids[body['ssn']]; seen.append(id)
            self.assertEqual(body,PERSONAS[id]['identity'])
            code={'P12':['2201','2101'],'P13':['2202'],'P14':['2301'],'P16':['2401']}.get(id,[])
            return httpx.Response(200,json=report(code))
        verifier=await self.verifier(handle)
        for id in PERSONAS:
            result=await verifier.verify(id)
            self.assertTrue(result['available'])
            self.assertEqual(result['identityMatch'],id not in {'P12','P13','P14'})
        self.assertEqual(len(seen),20)

    async def test_failed_login_is_not_repeated_until_restart(self):
        requests=[]
        def handle(request):
            requests.append(request)
            return httpx.Response(401,json={"codes":["CRS111"]})
        verifier=await self.verifier(handle)
        for _ in range(3): self.assertEqual(await verifier.verify('P01'),CLOSED)
        self.assertEqual(len(requests),1)

    async def test_optional_enrichment_preserves_default_contract_and_fails_closed_on_partial_error(self):
        paths=[]
        def handle(request):
            path=request.url.path;paths.append(path)
            if path.endswith('/login'):return httpx.Response(200,json={'token':'fixture'})
            if path.endswith('/basic'):return httpx.Response(200,json=report())
            if path.endswith('/criminal/new-request'):
                return httpx.Response(200,json={'orderResponse':{'message':'Request Results'},'cicCriminal':{'candidates':{'count':'1'}}})
            if path.endswith('/fraud-finder/fraud-finder'):return httpx.Response(200,json={'risk':{'score':95}})
            return httpx.Response(503,json={})
        verifier=await self.verifier(handle)
        self.assertEqual(set(await verifier.verify('P01')),{'identityMatch','fraudFlags','available'})
        enriched=await verifier.verify('P01',True)
        self.assertFalse(enriched['available'])
        self.assertEqual(enriched['report']['fraudFinder']['score'],95)
        self.assertIn('criminal_records_require_review',enriched['fraudFlags'])
        self.assertIn('publicRecords_unavailable',enriched['fraudFlags'])
        self.assertIn('/api/pp/fcrablj/data',paths)

    async def test_enrichment_does_not_treat_missing_counts_or_pending_as_zero(self):
        for product,raw in [('criminal',{}),('criminal',{'orderResponse':{'message':'Request Results','status':'Pending'}}),
            ('fraudFinder',{'risk':{'score':True}}),('fraudFinder',{'risk':{'score':101}}),
            ('publicRecords',{'DetailedBLJReport':{'JudgmentsFound':0,'LiensFound':0}})]:
            self.assertFalse(normalize_enrichment(product,raw)['available'])


class SnapshotTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.settings = Settings(data_dir=Path(self.tmp.name),seed_path=None,api_key="test-key")
        await self.start()

    async def start(self, backend=None):
        self.app = create_app(self.settings, backend)
        self.lifespan = self.app.router.lifespan_context(self.app)
        await self.lifespan.__aenter__()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app),base_url="http://test",
                                      headers={"Authorization":"Bearer test-key"})

    async def stop(self):
        await self.client.aclose()
        await self.lifespan.__aexit__(None,None,None)

    async def asyncTearDown(self):
        await self.stop()
        self.tmp.cleanup()

    def chunk(self, entity="eo-festival-nyc", id="D-test", collection="decisions"):
        return {"collection":collection,"id":id,"text":"Synthetic fixture inspection fee decision",
                "meta":{"entity":entity,"effectiveDate":"2026-07-31","fixture":True}}

    async def test_reset_removes_stale_memory_preserves_other_entity_and_is_idempotent(self):
        await self.client.post("/index",json=self.chunk())
        await self.client.post("/index",json=self.chunk(entity="another-entity"))
        snapshot = {"entity":"eo-festival-nyc","chunks":[self.chunk(id="new-source",collection="policy")]}
        for _ in range(2): self.assertEqual((await self.client.post("/reindex-all",json=snapshot)).status_code,200)
        self.assertEqual((await self.client.post("/resolve",json={"collection":"decisions","id":"D-test"})).status_code,404)
        self.assertEqual((await self.client.post("/resolve",json={"collection":"decisions","id":"D-test","entity":"another-entity"})).status_code,200)
        self.assertEqual((await self.client.get("/stats")).json()["documents"],2)
        await self.stop()
        await self.start()
        self.assertEqual((await self.client.get("/stats")).json()["documents"],2)

    async def test_reset_validates_entire_snapshot_before_writing_and_requires_auth(self):
        await self.client.post("/index",json=self.chunk())
        chunk = self.chunk()
        for chunks in [[self.chunk(entity="other")], [chunk,chunk], [{**chunk,"meta":{}}]]:
            self.assertEqual((await self.client.post("/reindex-all",json={"entity":"eo-festival-nyc","chunks":chunks})).status_code,422)
        self.assertEqual((await self.client.get("/stats")).json()["documents"],1)
        self.assertEqual((await self.client.post("/reindex-all",headers={"Authorization":"Bearer wrong"},json={"entity":"eo-festival-nyc","chunks":[]})).status_code,401)

    async def test_reset_failure_blocks_reads_and_recovers_from_durable_journal_on_restart(self):
        class Fails(LocalBackend):
            async def replace_entity(self,*args): raise RuntimeError("secret-sentinel")
        await self.stop()
        await self.start(Fails())
        response = await self.client.post("/reindex-all",json={"entity":"eo-festival-nyc","chunks":[self.chunk()]})
        self.assertEqual(response.status_code,503)
        self.assertNotIn("secret-sentinel",response.text)
        self.assertEqual((await self.client.get("/health")).status_code,503)
        self.assertEqual((await self.client.post("/query",json={"collection":"decisions","text":"fee"})).status_code,503)
        self.assertEqual((await self.client.post("/resolve",json={"collection":"decisions","id":"D-test"})).status_code,503)
        await self.stop()
        await self.start()
        self.assertEqual((await self.client.get("/health")).status_code,200)
        self.assertEqual((await self.client.post("/resolve",json={"collection":"decisions","id":"D-test"})).status_code,200)

    async def test_counter_reset_is_explicit_and_verification_stats_are_separate(self):
        await self.client.post("/query",json={"collection":"policy","text":"fees"})
        await self.client.post("/reindex-all",json={"entity":"eo-festival-nyc","chunks":[]})
        self.assertEqual((await self.client.get("/stats")).json()["retrievals"],1)
        await self.client.post("/reindex-all",json={"entity":"eo-festival-nyc","chunks":[],"resetCounters":True})
        stats = (await self.client.get("/stats")).json()
        self.assertEqual(stats["retrievals"],0)
        self.assertEqual(stats["latencySamples"],0)
        self.assertFalse(stats["verification"]["configured"])

    async def test_http_verify_keeps_default_three_fields_and_makes_report_opt_in(self):
        original=self.app.state.verifier
        class FakeVerifier:
            async def verify(self,id,include_report=False):
                result={'identityMatch':True,'fraudFlags':[],'available':True}
                if include_report:result['report']={'identity':dict(result),'fraudFinder':{'score':11}}
                return result
            def stats(self):return {'configured':True}
            async def close(self):await original.close()
        self.app.state.verifier=FakeVerifier()
        response=await self.client.post('/verify',json={'testIdentityId':'P01'})
        self.assertEqual(set(response.json()),{'identityMatch','fraudFlags','available'})
        enriched=await self.client.post('/verify',json={'testIdentityId':'P01','includeReport':True})
        self.assertEqual(enriched.json()['report']['fraudFinder']['score'],11)

    async def test_audit_events_are_searchable_without_becoming_decision_precedent(self):
        chunk=self.chunk(id='T-fixture',collection='events')
        chunk['text']='Post refused by server rule 8.1; the agent cannot approve its own entry.'
        self.assertEqual((await self.client.post('/index',json=chunk)).status_code,200)
        hits=await self.client.post('/query',json={'collection':'events','text':'post refused'})
        self.assertEqual(hits.json()[0]['id'],'T-fixture')
        self.assertEqual((await self.client.post('/query',json={'collection':'decisions','text':'post refused'})).json(),[])
        self.assertEqual((await self.client.get('/stats')).json()['collections']['events'],1)


if __name__ == "__main__": unittest.main()
