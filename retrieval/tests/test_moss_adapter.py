"""No-network SDK boundary checks for warm loading and real upserts."""
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backends import MossBackend
from service import RetrievalService, Settings
from store import Document


class MossAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_queries_do_not_cold_load_and_updates_are_upserts(self):
        document = Document("contracts", "apex-9.4", "Verbatim contract", {"entity":"eo-festival-nyc","effectiveDate":"2026-07-01"})
        metadata = {"collection":document.collection,"sourceId":document.id,"auditorMeta":json.dumps(document.meta)}
        client = Mock()
        client.list_indexes = AsyncMock(return_value=[SimpleNamespace(name="owned-index")])
        client.get_docs = AsyncMock(return_value=[SimpleNamespace(id=document.key,text=document.text,metadata=metadata)])
        client.load_index = AsyncMock()
        client.query = AsyncMock(return_value=SimpleNamespace(docs=[SimpleNamespace(id=document.key,score=0.8)]))
        client.add_docs = AsyncMock()
        client.close = AsyncMock()
        with tempfile.TemporaryDirectory() as directory, patch("moss.MossClient", return_value=client):
            backend = MossBackend("test-project", "test-key", "owned-index", Path(directory))
            self.assertEqual(await backend.start(), [document])
            for _ in range(3):
                self.assertEqual(await backend.query("inspection", [document], 3), [(document,0.8)])
            self.assertEqual(client.load_index.await_count, 1)
            await backend.upsert([document])
            self.assertTrue(client.add_docs.await_args.args[2].upsert)
            self.assertEqual(client.load_index.await_count, 2)
            await backend.close()

    async def test_moss_mode_requires_credentials_and_does_not_fall_back(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "requires MOSS_PROJECT_ID"):
                RetrievalService(Settings(backend="moss",data_dir=Path(directory),project_id="",project_key=""))

    async def test_snapshot_removes_only_target_cloud_ids_including_orphans(self):
        client=Mock()
        client.get_docs=AsyncMock(return_value=[
            SimpleNamespace(id="stale",metadata={"entity":"target"}),
            SimpleNamespace(id="orphan-from-failed-write",metadata={"entity":"target"}),
            SimpleNamespace(id="peer",metadata={"entity":"other"})])
        client.delete_docs=AsyncMock()
        client.load_index=AsyncMock()
        with tempfile.TemporaryDirectory() as directory, patch("moss.MossClient",return_value=client):
            backend=MossBackend("test-project","test-key","isolated",Path(directory))
            backend.loaded=True
            await backend.replace_entity("target",[],[])
        client.delete_docs.assert_awaited_once_with("isolated",["stale","orphan-from-failed-write"])
        client.load_index.assert_awaited_once()

    async def test_snapshot_retries_a_transient_cloud_error_without_deleting_other_entities(self):
        from moss import MossError
        client=Mock()
        client.get_docs=AsyncMock(side_effect=[MossError("transient"),[SimpleNamespace(id="peer",metadata={"entity":"other"})]])
        client.delete_docs=AsyncMock()
        with tempfile.TemporaryDirectory() as directory, patch("moss.MossClient",return_value=client), patch("backends.asyncio.sleep",new_callable=AsyncMock):
            backend=MossBackend("test-project","test-key","isolated",Path(directory))
            backend.loaded=True
            await backend.replace_entity("target",[],[])
        self.assertEqual(client.get_docs.await_count,2)
        client.delete_docs.assert_not_awaited()

    async def test_upsert_retries_with_upsert_semantics_after_a_transient_cloud_failure(self):
        from moss import MossError
        client=Mock()
        client.add_docs=AsyncMock(side_effect=[MossError('transient'),None])
        client.load_index=AsyncMock()
        doc=Document('policy','test','Test clause',{'entity':'target','effectiveDate':'2026-07-01'})
        with tempfile.TemporaryDirectory() as directory, patch('moss.MossClient',return_value=client), patch('backends.asyncio.sleep',new_callable=AsyncMock):
            backend=MossBackend('test-project','test-key','isolated',Path(directory))
            backend.loaded=True
            await backend.upsert([doc])
        self.assertEqual(client.add_docs.await_count,2)
        self.assertTrue(all(call.args[2].upsert for call in client.add_docs.await_args_list))
        client.load_index.assert_awaited_once()
