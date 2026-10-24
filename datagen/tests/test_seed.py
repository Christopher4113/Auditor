"""Offline acceptance tests for Group A's Phase 1 deliverables."""

from collections import Counter
from copy import deepcopy
from datetime import date
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

DATAGEN = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DATAGEN))

from generate import generate  # noqa: E402
from reference_data import master_data  # noqa: E402
from validate import validate_seed  # noqa: E402


class SeedAcceptanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.generated = generate()
        cls.sample = json.loads((DATAGEN / "sample.seed.json").read_text(encoding="utf-8"))

    def test_generated_satisfies_schema_and_accounting_invariants(self):
        self.assertEqual(validate_seed(self.generated), [])

    def test_sample_satisfies_same_contract(self):
        self.assertEqual(validate_seed(self.sample), [])
        self.assertEqual(len(self.sample["bankTransactions"]), 10)
        self.assertEqual(self.sample["dataset"], "sample")

    def test_repeat_runs_are_byte_identical(self):
        self.assertEqual(json.dumps(generate(1328)), json.dumps(generate(1328)))

    def test_different_seed_changes_bank_feed_but_preserves_reference_data(self):
        other = generate(42)
        self.assertNotEqual(self.generated["bankTransactions"], other["bankTransactions"])
        for section in ("accounts", "openingBalances", "contracts", "policyClauses", "vendors"):
            self.assertEqual(self.generated[section], other[section])
        self.assertEqual(validate_seed(other), [])

    def test_default_volume_is_120_per_month(self):
        self.assertEqual(Counter(row["period"] for row in self.generated["bankTransactions"]),
                         {"2026-07": 120, "2026-08": 120, "2026-09": 120})

    def test_custom_volume_keeps_all_weekly_payouts(self):
        small = generate(transactions_per_month=5)
        self.assertEqual(len(small["bankTransactions"]), 15)
        self.assertEqual(len(small["stripePayouts"]), 12)
        self.assertEqual(validate_seed(small), [])

    def test_too_small_volume_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "at least 5"):
            generate(transactions_per_month=4)

    def test_payouts_are_weekly_and_stop_at_event(self):
        self.assertEqual(Counter(row["period"] for row in self.generated["stripePayouts"]),
                         {"2026-07": 5, "2026-08": 4, "2026-09": 3})
        for row in self.generated["stripePayouts"]:
            self.assertEqual(date.fromisoformat(row["arrivalDate"]).weekday(), 4)
            self.assertLess(row["arrivalDate"], "2026-09-19")

    def test_reference_data_matches_final_brief(self):
        self.assertEqual(len(self.generated["accounts"]), 27)
        self.assertEqual(len(self.generated["policyClauses"]), 12)
        self.assertEqual(len(self.generated["contracts"]), 6)
        balances = {row["accountCode"]: (row["debit"], row["credit"])
                    for row in self.generated["openingBalances"]}
        self.assertEqual(balances, {"1000": (38000000, 0), "1300": (6000000, 0),
                                    "3000": (0, 50000000), "3100": (6000000, 0)})

    def test_phase1_does_not_plant_or_score_errors(self):
        for data in (self.generated, self.sample):
            self.assertEqual(data["breaks"], [])
            self.assertEqual(data["answerKey"], [])

    def test_no_invented_crs_test_identities(self):
        self.assertTrue(all(row["crsTestIdentity"] is None for row in self.generated["vendors"]))

    def test_sample_contains_apex_fixture_for_fake_workflow(self):
        refund = next(row for row in self.sample["bankTransactions"] if row["id"] == "sample-bank-10")
        self.assertEqual((refund["amount"], refund["date"], refund["vendorId"]),
                         (1360000, "2026-09-25", "apex"))
        clause = next(clause for contract in self.sample["contracts"]
                      for clause in contract["clauses"] if clause["id"] == "apex-9.4")
        self.assertIn("15% inspection fee", clause["text"])

    def test_reference_records_are_not_shared_between_runs(self):
        changed = master_data(1328)
        changed["contracts"][0]["clauses"][0]["text"] = "changed"
        self.assertNotEqual(changed["contracts"], master_data(1328)["contracts"])

    def test_schema_and_relations_reject_corrupted_handoffs(self):
        cases = [
            ("missing field", lambda d: d["bankTransactions"][0].pop("amount"), "required"),
            ("unknown field", lambda d: d["bankTransactions"][0].update(secret="invalid"), "Additional properties"),
            ("fractional cents", lambda d: d["bankTransactions"][0].update(amount=12.5), "integer"),
            ("float cents", lambda d: d["bankTransactions"][0].update(amount=1200.0), "integer cents"),
            ("boolean cents", lambda d: d["bankTransactions"][0].update(amount=True), "integer"),
            ("zero cash movement", lambda d: d["bankTransactions"][0].update(amount=0), "not"),
            ("bad date", lambda d: d["bankTransactions"][0].update(date="2026-07-32"), "date"),
            ("wrong period", lambda d: d["bankTransactions"][0].update(period="2026-09"), "outside period"),
            ("unknown period", lambda d: d["periods"].pop(0), "unknown period"),
            ("duplicate ID", lambda d: d["bankTransactions"].append(deepcopy(d["bankTransactions"][0])), "duplicate id"),
            ("wrong entity", lambda d: d["bankTransactions"][0].update(entity="other-entity"), "entity differs"),
            ("unknown vendor", lambda d: d["bankTransactions"][0].update(vendorId="missing"), "unknown vendor"),
            ("unknown payout", lambda d: d["bankTransactions"][0].update(stripePayoutId="missing"), "unknown payout"),
            ("unbalanced opening", lambda d: d["openingBalances"][0].update(debit=1), "debits do not equal credits"),
            ("two-sided opening", lambda d: d["openingBalances"][0].update(credit=1), "not valid"),
            ("zero opening", lambda d: d["openingBalances"][0].update(debit=0), "not valid"),
            ("unknown account", lambda d: d["openingBalances"][0].update(accountCode="9999"), "unknown account"),
            ("wrong normal balance", lambda d: d["accounts"][0].update(normalBalance="credit"), "wrong normal balance"),
            ("duplicate account code", lambda d: d["accounts"][1].update(code="1000"), "duplicate account code"),
            ("bad month boundary", lambda d: d["periods"][0].update(endDate="2026-07-30"), "boundaries"),
            ("payout arithmetic", lambda d: d["stripePayouts"][0].update(fee=0), "gross - fee"),
            ("missing bank receipt", lambda d: d["stripePayouts"][0].update(bankTransactionId="missing"), "unknown bank transaction"),
            ("settlement mismatch", lambda d: d["bankTransactions"][1].update(amount=1), "bank amount differs"),
            ("contract vendor", lambda d: d["contracts"][0].update(vendorId="missing"), "unknown vendor"),
            ("future clause", lambda d: d["contracts"][0]["clauses"][0].update(effectiveDate="2026-12-01"), "outside agreement"),
            ("duplicate citation", lambda d: d["policyClauses"][0].update(id="apex-9.4"), "duplicate clause id"),
        ]
        for name, corrupt, expected in cases:
            with self.subTest(name=name):
                data = deepcopy(self.sample)
                corrupt(data)
                self.assertTrue(any(expected in error for error in validate_seed(data)),
                                f"expected {expected!r} in {validate_seed(data)}")

    def test_commands_work_from_another_directory_and_reject_invalid_json(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "nested" / "seed.json"
            generated = subprocess.run(
                [sys.executable, str(DATAGEN / "generate.py"), "--out", str(output)],
                cwd=directory, capture_output=True, text=True,
            )
            self.assertEqual(generated.returncode, 0, generated.stderr)
            self.assertEqual(json.loads(output.read_text()), self.generated)
            valid = subprocess.run([sys.executable, str(DATAGEN / "validate.py"), str(output)],
                                   cwd=directory, capture_output=True, text=True)
            self.assertEqual(valid.returncode, 0, valid.stderr)
            output.write_text("{broken json")
            invalid = subprocess.run([sys.executable, str(DATAGEN / "validate.py"), str(output)],
                                     cwd=directory, capture_output=True, text=True)
            self.assertEqual(invalid.returncode, 1)
            self.assertIn("cannot read", invalid.stderr)


if __name__ == "__main__":
    unittest.main()
