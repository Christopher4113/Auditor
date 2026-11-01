"""Checks against invalid evaluation credit and a live isolated HTTP run."""
import asyncio
import json
from pathlib import Path
import tempfile
import unittest

from evaluate import evaluate, metrics, tfidf
from store import Document


class EvaluationTests(unittest.TestCase):
    def test_backend_error_cannot_earn_abstention_credit(self):
        row = {"expected":[],"hits":[],"error":"HTTP 503","top1Correct":False,
            "hitAt3":False,"taskSuccess":False,"scopeViolations":0,"verbatimHits":0,"latencyMs":1}
        result = metrics([row])
        self.assertEqual(result["abstention"], 0)
        self.assertEqual(result["taskSuccess"], 0)
        self.assertEqual(result["errors"], 1)
        self.assertIsNone(result["top1"])

    def test_baseline_uses_query_content_and_abstains_without_overlap(self):
        docs = [Document("policy","one","cash payment hold",{"entity":"test"}),
            Document("policy","two","sponsorship revenue schedule",{"entity":"test"})]
        self.assertEqual(tfidf("sponsorship",docs)[0][0].id,"two")
        self.assertEqual(tfidf("photosynthesis",docs),[])

    def test_actual_http_run_has_paired_examples_and_no_indexed_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            asyncio.run(evaluate(Path(directory)))
            result=json.loads((Path(directory)/"results.json").read_text())
        self.assertEqual(len(result["records"]),72)
        self.assertEqual(result["conditions"]["corpusDocuments"],21)
        self.assertFalse(result["conditions"]["labelsPassedToRankers"])
        self.assertEqual({r["errors"] for r in result["summary"]},{0})
        self.assertEqual(len({(r["dataset"],r["exampleId"]) for r in result["records"]}),24)
        for example in {r["exampleId"] for r in result["records"]}:
            rows=[r for r in result["records"] if r["exampleId"]==example]
            self.assertEqual(len(rows),3)
            self.assertTrue(all(r["request"]==rows[0]["request"] for r in rows))
            self.assertTrue(all(r["expected"]==rows[0]["expected"] for r in rows))
        self.assertTrue(all(r["scopeViolations"]==0 for r in result["summary"] if r["method"]=="auditor-local"))


if __name__ == "__main__":
    unittest.main()
