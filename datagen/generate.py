"""A1 / Interface 5: generate the clean Phase 1 dataset without network calls.

Usage: uv run generate.py [--seed 1328] [--out seed.json]
Six planted breaks and their answer key are A3 (Phase 2); their arrays stay empty.
"""
import argparse
import calendar
import json
from pathlib import Path
import random

from reference_data import CURRENCY, ENTITY, master_data

DEFAULT_SEED = 1328
DEFAULT_TRANSACTIONS_PER_MONTH = 120

# Routine purchases deliberately use vendors outside the six Phase 2 scenarios.
ROUTINE_PURCHASES = [
    ("beacon", "Campaign creative", 25_000, 350_000),
    ("city-permits", "Permit and site administration", 15_000, 180_000),
    ("office", "Event operations supplies", 5_000, 65_000),
    ("ridgeway", "Equipment freight and local delivery", 35_000, 240_000),
    ("livewire", "Temporary power services", 45_000, 320_000),
    ("island-clean", "Site preparation and sanitation", 25_000, 190_000),
    ("signal", "Crew radio rental and communications", 12_000, 85_000),
    ("crew", "Temporary event operations crew", 65_000, 480_000),
    ("printworks", "Event signage and printed materials", 15_000, 160_000),
]


def bank_transaction(id: str, date: str, amount: int, counterparty: str,
                     description: str, reference: str, vendor_id: str | None = None,
                     payout_id: str | None = None) -> dict:
    return {
        "id": id, "entity": ENTITY, "period": date[:7], "date": date,
        "amount": amount, "currency": CURRENCY, "counterparty": counterparty,
        "description": description, "reference": reference,
        "vendorId": vendor_id, "stripePayoutId": payout_id, "status": "unmatched",
    }


def generate(seed: int = DEFAULT_SEED,
             transactions_per_month: int = DEFAULT_TRANSACTIONS_PER_MONTH) -> dict:
    """Same inputs produce byte-identical JSON after serialization.

    Fridays settle ticket proceeds through the last pre-event Friday. Fees are
    a synthetic 2.9% plus 30 cents per charge, rounded half-up using integers.
    The weekly report is normalized settlement data, not a Stripe API response.
    """
    if transactions_per_month < 5:
        raise ValueError("transactions_per_month must be at least 5 (room for weekly payouts)")
    rng = random.Random(seed)  # every random choice goes through rng, never the global one
    data = master_data(seed)
    vendor_names = {row["id"]: row["name"] for row in data["vendors"]}
    for month in (7, 8, 9):
        last = calendar.monthrange(2026, month)[1]
        payout_days = [day for day in range(1, last + 1)
                       if calendar.weekday(2026, month, day) == calendar.FRIDAY
                       and (month < 9 or day < 19)]
        for day in payout_days:
            date = f"2026-{month:02d}-{day:02d}"
            suffix = date.replace("-", "")
            payout_id = f"po_{suffix}"
            bank_id = f"bank-stripe-{suffix}"
            count = rng.randint(1800, 4500)
            gross = count * rng.choice((19_900, 24_900, 29_900))
            fee = (gross * 29 + 500) // 1000 + count * 30
            net = gross - fee
            data["stripePayouts"].append({
                "id": payout_id, "entity": ENTITY, "period": date[:7],
                "arrivalDate": date, "currency": CURRENCY,
                "gross": gross, "fee": fee, "net": net, "chargeCount": count,
                "bankTransactionId": bank_id,
            })
            data["bankTransactions"].append(bank_transaction(
                bank_id, date, net, "Stripe", "Weekly ticket payout, net of fees", payout_id,
                payout_id=payout_id,
            ))
        routine_count = transactions_per_month - len(payout_days)
        for number in range(1, routine_count + 1):
            vendor, description, low, high = rng.choice(ROUTINE_PURCHASES)
            date = f"2026-{month:02d}-{rng.randint(1, last):02d}"
            reference = f"EO-{month:02d}-{number:04d}"
            data["bankTransactions"].append(bank_transaction(
                f"bank-{month:02d}-{number:04d}", date, -rng.randint(low, high),
                vendor_names[vendor], description, reference, vendor_id=vendor,
            ))
    data["bankTransactions"].sort(key=lambda row: (row["date"], row["id"]))
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--out", type=Path, default=Path("seed.json"))
    parser.add_argument("--transactions-per-month", type=int, default=DEFAULT_TRANSACTIONS_PER_MONTH)
    args = parser.parse_args()
    try:
        data = generate(args.seed, args.transactions_per_month)
    except ValueError as exc:
        parser.error(str(exc))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {args.out}: {len(data['bankTransactions'])} bank transactions, "
          f"{len(data['stripePayouts'])} payouts (Phase 1, synthetic)")


if __name__ == "__main__":
    main()
