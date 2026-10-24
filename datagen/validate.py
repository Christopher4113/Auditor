"""Validate Interface 5's JSON shape and accounting/reference invariants.

Run from datagen/: uv run validate.py [seed.json | sample.seed.json]
Validation uses only local files, never Convex, Moss, CRS, or an LLM.
"""

import argparse
import calendar
from collections import Counter
import json
from pathlib import Path
import sys

from jsonschema import Draft202012Validator, FormatChecker

SCHEMA_PATH = Path(__file__).with_name("seed.schema.json")
SECTIONS = (
    "accounts", "openingBalances", "periods", "bankTransactions", "stripePayouts",
    "contracts", "policyClauses", "vendors", "breaks", "answerKey",
)


def load_seed(path: Path) -> dict:
    """Reject ambiguous or nonstandard JSON rather than silently normalizing it."""
    def unique_keys(pairs: list[tuple]) -> dict:
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate JSON key: {key}")
            result[key] = value
        return result

    def reject_constant(value: str) -> None:
        raise ValueError(f"nonstandard JSON constant: {value}")

    return json.loads(path.read_text(encoding="utf-8"),
                      object_pairs_hook=unique_keys, parse_constant=reject_constant)


def validate_seed(data: dict) -> list[str]:
    """Return actionable errors; malformed schemas raise rather than silently pass."""
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = [f"{'.'.join(map(str, error.absolute_path)) or '$'}: {error.message}"
              for error in validator.iter_errors(data)]
    if errors:
        return errors  # Relational checks require structurally valid records.

    def check(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)

    # JSON Schema allows 1.0 as an integer mathematically. The transport contract
    # requires actual JSON integer amounts to keep every consumer on exact cents.
    def check_money(value, path: str = "$") -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                if item is not None and key in {"amount", "gross", "fee", "net", "debit", "credit", "pnlImpact"}:
                    check(type(item) is int, f"{path}.{key}: amount must be integer cents")
                check_money(item, f"{path}.{key}")
        elif isinstance(value, list):
            for index, item in enumerate(value):
                check_money(item, f"{path}[{index}]")

    check_money(data)

    indexes = {}
    for section in (*SECTIONS, "ledgerEntries", "sourceDocuments"):
        rows = data.get(section, [])
        counts = Counter(row["id"] for row in rows)
        for id, count in counts.items():
            check(count == 1, f"{section}: duplicate id {id}")
        indexes[section] = {row["id"]: row for row in rows}
        for row in rows:
            check(row["entity"] == data["entity"], f"{section}/{row['id']}: entity differs from document")
            if "currency" in row:
                check(row["currency"] == data["currency"], f"{section}/{row['id']}: currency differs from document")

    accounts = {row["code"]: row for row in data["accounts"]}
    check(len(accounts) == len(data["accounts"]), "accounts: duplicate account code")
    for row in data["accounts"]:
        expected = "debit" if row["type"] in {"asset", "expense"} else "credit"
        check(row["normalBalance"] == expected, f"accounts/{row['id']}: wrong normal balance for {row['type']}")

    company = data["company"]
    check(company["eventStartDate"] <= company["eventEndDate"], "company: event dates reversed")
    periods = indexes["periods"]
    ordered_periods = sorted(data["periods"], key=lambda row: row["startDate"])
    for i, row in enumerate(ordered_periods):
        year, month = map(int, row["id"].split("-"))
        last = calendar.monthrange(year, month)[1]
        check(row["startDate"] == f"{row['id']}-01" and row["endDate"] == f"{row['id']}-{last:02d}",
              f"periods/{row['id']}: boundaries must cover its calendar month")
        if i:
            check(ordered_periods[i - 1]["endDate"] < row["startDate"], "periods: overlapping dates")

    def in_period(row: dict, field: str, section: str) -> None:
        period = periods.get(row["period"])
        check(period is not None, f"{section}/{row['id']}: unknown period {row['period']}")
        if period:
            check(period["startDate"] <= row[field] <= period["endDate"],
                  f"{section}/{row['id']}: {field} outside period")

    balances = data["openingBalances"]
    check(sum(row["debit"] for row in balances) == sum(row["credit"] for row in balances),
          "openingBalances: debits do not equal credits")
    balance_keys = {(row["date"], row["accountCode"]) for row in balances}
    check(len(balance_keys) == len(balances), "openingBalances: duplicate account/date")
    for row in balances:
        check(row["accountCode"] in accounts, f"openingBalances/{row['id']}: unknown account")
        check(row["date"] == ordered_periods[0]["startDate"],
              f"openingBalances/{row['id']}: opening date must be the first period start")

    banks = indexes["bankTransactions"]
    payouts = indexes["stripePayouts"]
    for row in banks.values():
        in_period(row, "date", "bankTransactions")
        vendor_id = row["vendorId"]
        if vendor_id is not None:
            vendor = indexes["vendors"].get(vendor_id)
            check(vendor is not None, f"bankTransactions/{row['id']}: unknown vendor {vendor_id}")
            if vendor:
                check(row["counterparty"] == vendor["name"], f"bankTransactions/{row['id']}: counterparty differs from vendor")
        payout_id = row["stripePayoutId"]
        if payout_id is not None:
            payout = payouts.get(payout_id)
            check(payout is not None, f"bankTransactions/{row['id']}: unknown payout {payout_id}")
            if payout:
                check(payout["bankTransactionId"] == row["id"], f"bankTransactions/{row['id']}: payout back-reference differs")

    payout_bank_ids = [row["bankTransactionId"] for row in payouts.values()]
    check(len(set(payout_bank_ids)) == len(payout_bank_ids), "stripePayouts: a bank receipt is reused")
    for row in payouts.values():
        in_period(row, "arrivalDate", "stripePayouts")
        check(row["gross"] - row["fee"] == row["net"], f"stripePayouts/{row['id']}: gross - fee != net")
        bank = banks.get(row["bankTransactionId"])
        check(bank is not None, f"stripePayouts/{row['id']}: unknown bank transaction")
        if bank:
            check(bank["stripePayoutId"] == row["id"], f"stripePayouts/{row['id']}: bank back-reference differs")
            check(bank["amount"] == row["net"], f"stripePayouts/{row['id']}: bank amount differs from net")
            check(bank["date"] == row["arrivalDate"] and bank["period"] == row["period"],
                  f"stripePayouts/{row['id']}: bank settlement date/period differs")
            check(bank["counterparty"] == "Stripe", f"stripePayouts/{row['id']}: counterparty must be Stripe")
            check(bank["vendorId"] is None, f"stripePayouts/{row['id']}: payout must not refer to a vendor")

    for row in data.get("ledgerEntries", []):
        in_period(row, "date", "ledgerEntries")
        check(sum(l["debit"] for l in row["lines"]) == sum(l["credit"] for l in row["lines"]),
              f"ledgerEntries/{row['id']}: imported entry unbalanced")
        for item in row["lines"]:
            check(item["accountCode"] in accounts, f"ledgerEntries/{row['id']}: unknown account")
        if row["vendorId"]:
            check(row["vendorId"] in indexes["vendors"], f"ledgerEntries/{row['id']}: unknown vendor")
        if row["bankTransactionId"]:
            check(row["bankTransactionId"] in banks, f"ledgerEntries/{row['id']}: unknown bank transaction")
        # Deliberately do not require bank cash == imported book cash: A3 plants
        # those mismatches. Validate the sources, not away the intended errors.

    for row in data.get("sourceDocuments", []):
        in_period(row, "date", "sourceDocuments")
        check(row["vendorId"] in indexes["vendors"], f"sourceDocuments/{row['id']}: unknown vendor")
        contract = indexes["contracts"].get(row["contractId"])
        check(contract is not None, f"sourceDocuments/{row['id']}: unknown contract")
        if contract:
            check(contract["vendorId"] == row["vendorId"], f"sourceDocuments/{row['id']}: contract/vendor mismatch")

    # Citation IDs form a namespace independent of bank/account IDs.
    citation_ids = [row["id"] for row in data["policyClauses"]]
    policy_numbers = [(row["policyPackId"], row["number"]) for row in data["policyClauses"]]
    check(len(policy_numbers) == len(set(policy_numbers)), "policyClauses: duplicate clause number within policy pack")
    for row in data["contracts"]:
        check(row["vendorId"] in indexes["vendors"], f"contracts/{row['id']}: unknown vendor")
        check(row["signedDate"] <= row["startDate"] <= row["endDate"], f"contracts/{row['id']}: invalid contract dates")
        numbers = [clause["number"] for clause in row["clauses"]]
        check(len(numbers) == len(set(numbers)), f"contracts/{row['id']}: duplicate clause number")
        for clause in row["clauses"]:
            citation_ids.append(clause["id"])
            check(row["signedDate"] <= clause["effectiveDate"] <= row["endDate"],
                  f"contracts/{row['id']}/{clause['id']}: clause effective date outside agreement")
    check(len(citation_ids) == len(set(citation_ids)), "citations: duplicate clause id")

    for row in data["breaks"]:
        check(row["period"] in periods, f"breaks/{row['id']}: unknown period")
        for id in row["bankTransactionIds"]:
            check(id in banks, f"breaks/{row['id']}: unknown bank transaction {id}")
        for id in row["contractIds"]:
            check(id in indexes["contracts"], f"breaks/{row['id']}: unknown contract {id}")
        for field, section in (("sourceDocumentIds", "sourceDocuments"), ("ledgerEntryIds", "ledgerEntries")):
            for id in row.get(field, []):
                check(id in indexes[section], f"breaks/{row['id']}: unknown {section} {id}")
        if "date" in row:
            in_period(row, "date", "breaks")
    answer_breaks = [row["breakId"] for row in data["answerKey"]]
    check(len(answer_breaks) == len(set(answer_breaks)), "answerKey: duplicate answer for break")
    for row in data["answerKey"]:
        check(row["breakId"] in indexes["breaks"], f"answerKey/{row['id']}: unknown break")
        check(row["period"] in periods, f"answerKey/{row['id']}: unknown period")
        lines = row["expectedLines"]
        check(sum(line["debit"] for line in lines) == sum(line["credit"] for line in lines),
              f"answerKey/{row['id']}: expected entry unbalanced")
        for line in lines:
            check(line["accountCode"] in accounts, f"answerKey/{row['id']}: unknown account {line['accountCode']}")
        for id in row["citationIds"]:
            check(id in citation_ids, f"answerKey/{row['id']}: unknown citation {id}")
        case = indexes["breaks"].get(row["breakId"])
        if case:
            check(case["period"] == row["period"], f"answerKey/{row['id']}: case/answer period mismatch")
            check(case.get("breakNumber") == row.get("breakNumber"), f"answerKey/{row['id']}: break family mismatch")
        impact = sum(abs(l["debit"] - l["credit"]) for l in lines if l["accountCode"].startswith(("4", "5")))
        check(impact == row["pnlImpact"], f"answerKey/{row['id']}: P&L impact mismatch")
        for dependency in row.get("dependsOn", []):
            prior = indexes["breaks"].get(dependency)
            check(prior is not None and prior["period"] < row["period"], f"answerKey/{row['id']}: invalid prior-period dependency")
    if data["schemaVersion"] == "2.0.0":
        check({row.get("breakNumber") for row in data["breaks"]} == set(range(1, 7)),
              "breaks: Phase 2 must cover all six families")
        check(set(answer_breaks) == set(indexes["breaks"]), "answerKey: every planted case requires exactly one answer")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", type=Path, default=Path("seed.json"))
    args = parser.parse_args()
    try:
        data = load_seed(args.path)
    except (OSError, ValueError) as exc:
        print(f"cannot read {args.path}: {exc}", file=sys.stderr)
        return 1
    errors = validate_seed(data)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    counts = Counter(row["period"] for row in data["bankTransactions"])
    print(f"valid {args.path}: {data['company']['name']} (synthetic, cents), "
          f"bank transactions by period: {dict(sorted(counts.items()))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
