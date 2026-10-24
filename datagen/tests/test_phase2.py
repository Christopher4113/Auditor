"""A3 evidence and accounting checks, independent of the agent's predictions."""
from collections import defaultdict
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from generate import generate
from validate import validate_seed


class Phase2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = generate()

    def answer(self, id):
        return next(row for row in self.data["answerKey"] if row["breakId"] == id)

    def balances(self, period=None, corrections=True):
        balances = defaultdict(int)
        for row in self.data["openingBalances"]:
            if period is None:
                balances[row["accountCode"]] += row["debit"] - row["credit"]
        for entry in self.data["ledgerEntries"]:
            if not period or entry["period"] == period:
                for row in entry["lines"]:
                    balances[row["accountCode"]] += row["debit"] - row["credit"]
        if corrections:
            for answer in self.data["answerKey"]:
                if not period or answer["period"] == period:
                    for row in answer["expectedLines"]:
                        balances[row["accountCode"]] += row["debit"] - row["credit"]
        return balances

    def test_full_phase2_contract(self):
        self.assertEqual(validate_seed(self.data), [])
        self.assertEqual(self.data["schemaVersion"], "2.0.0")
        self.assertEqual(len(self.data["bankTransactions"]), 368)
        self.assertEqual({row["breakNumber"] for row in self.data["breaks"]}, set(range(1,7)))
        self.assertEqual(len(self.data["answerKey"]), 11)

    def test_repeatability_and_other_seeds(self):
        self.assertEqual(json.dumps(generate()), json.dumps(generate()))
        for seed in (0, 1, 42, 999):
            self.assertEqual(validate_seed(generate(seed)), [])

    def test_source_errors_are_not_silently_fixed_by_generator(self):
        payout = next(row for row in self.data["stripePayouts"] if row["arrivalDate"] == "2026-07-10")
        entry = next(row for row in self.data["ledgerEntries"] if row["id"] == f"JE-settlement-{payout['id']}")
        self.assertEqual(payout["net"], 4_718_000)
        self.assertEqual(entry["lines"][0]["debit"], 4_860_000)
        self.assertNotEqual(self.balances(corrections=False)["1000"], self.balances()["1000"])

    def test_corrected_cash_ties_to_bank_and_trial_balance(self):
        balances = self.balances()
        self.assertEqual(balances["1000"], 38_000_000 + sum(row["amount"] for row in self.data["bankTransactions"]))
        self.assertEqual(sum(balances.values()), 0)
        self.assertEqual(balances["1100"], 0)  # Artist receivable cleared.
        self.assertEqual(balances["1200"], 0)  # Apex deposit cleared.
        self.assertEqual(balances["1250"], 0)  # Artist deposit reclassified then cleared.

    def test_sponsor_cumulative_revenue_is_capped_and_ar_clears(self):
        balances = self.balances()
        self.assertEqual(balances["4100"], -7_000_000)
        self.assertEqual(balances["1150"], 0)
        self.assertEqual(balances["2250"], 0)
        self.assertEqual(self.answer("B4-2026-08")["pnlImpact"], 1_512_195)
        self.assertEqual(self.answer("B4-2026-09")["pnlImpact"], 3_512_195)

    def test_accrual_is_in_august_and_not_expensed_twice(self):
        self.assertEqual(self.balances("2026-08")["5200"], 940_000)
        self.assertEqual(self.balances("2026-09")["5200"], 0)
        self.assertEqual(self.balances()["2100"], 0)

    def test_duplicate_reversal_has_zero_pl_impact(self):
        answer = self.answer("B2-2026-07")
        self.assertEqual(answer["pnlImpact"], 0)
        self.assertTrue(answer["expectedEscalation"])
        self.assertEqual({line["accountCode"] for line in answer["expectedLines"]}, {"2000","1300"})

    def test_payment_hold_never_fabricates_bank_outflow(self):
        self.assertFalse(any(row["vendorId"] == "field-flame" for row in self.data["bankTransactions"]))
        hold = self.answer("B5-2026-09")
        self.assertTrue(hold["expectedEscalation"])
        self.assertNotIn("1000", {row["accountCode"] for row in hold["expectedLines"]})
        vendor = next(row for row in self.data["vendors"] if row["id"] == "field-flame")
        self.assertEqual(vendor["bankAccountLast4"], "4471")
        self.assertEqual(self.balances()["1400"], 4_200_000)

    def test_apex_transfer_case_is_2400_expense(self):
        answer = self.answer("B3-2026-09")
        self.assertEqual(answer["pnlImpact"], 240_000)
        self.assertFalse(answer["expectedEscalation"])
        self.assertIn("B3-2026-07", answer["dependsOn"])
        self.assertEqual(self.balances()["5160"], 240_000)

    def test_non_cash_cases_have_real_documents(self):
        for id in ("B5-2026-09", "B6-2026-08"):
            case = next(row for row in self.data["breaks"] if row["id"] == id)
            self.assertEqual(case["bankTransactionIds"], [])
            self.assertTrue(case["sourceDocumentIds"])

    def test_rejects_corrupted_books_and_scoring(self):
        cases = [
            lambda d: d["ledgerEntries"][0]["lines"][0].update(debit=1),
            lambda d: d["sourceDocuments"][0].update(contractId="missing"),
            lambda d: d["answerKey"][0].update(pnlImpact=1),
            lambda d: d["answerKey"][0].update(dependsOn=["B3-2026-09"]),
            lambda d: d["breaks"][0].update(ledgerEntryIds=["missing"]),
            lambda d: d["answerKey"].pop(),
        ]
        for corrupt in cases:
            data = deepcopy(self.data)
            corrupt(data)
            self.assertTrue(validate_seed(data))


if __name__ == "__main__":
    unittest.main()
