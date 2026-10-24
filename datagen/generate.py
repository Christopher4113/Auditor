"""Interface 5 (A -> C): writes seed.json conforming to seed.schema.json.

One deterministic script: bank feed, Stripe payouts, contracts, policy clauses,
the six planted breaks and the answer key all fall out of the same seed.
Usage: uv run generate.py [--seed 1328] [--out seed.json]
"""
import argparse
import json
import random

SECTIONS = [
    "accounts", "openingBalances", "periods", "bankTransactions", "stripePayouts",
    "contracts", "policyClauses", "vendors", "breaks", "answerKey",
]


def generate(seed: int) -> dict:
    rng = random.Random(seed)  # every random choice goes through rng, never the global one
    _ = rng
    return {"seed": seed, **{s: [] for s in SECTIONS}}  # A1/A3 fill these in


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--seed", type=int, default=1328)
    p.add_argument("--out", default="seed.json")
    a = p.parse_args()
    with open(a.out, "w") as f:
        json.dump(generate(a.seed), f, indent=2)
    print(f"wrote {a.out}")
