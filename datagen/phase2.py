"""A3: six break families plus the Apex transfer case, with raw source evidence.

No proposed entries, controller decisions, or learned precedent are seeded.
The answer key is scoring-only. Imported books intentionally contain the errors.
All amounts are integer cents. Corrective entries assume earlier cases were fixed.
"""

from reference_data import CURRENCY, ENTITY


def line(account: str, debit: int = 0, credit: int = 0) -> dict:
    return {"accountCode": account, "debit": debit, "credit": credit}


def prorata(amount: int, days: int, total_days: int = 82) -> int:
    """Positive half-up rounding; campaign July 1–September 20 is 82 days inclusive."""
    return (2 * amount * days + total_days) // (2 * total_days)


def plant_scenarios(data: dict) -> dict:
    from generate import bank_transaction

    data["schemaVersion"] = "2.0.0"
    data["ledgerEntries"] = []
    data["sourceDocuments"] = []
    # Sponsor-issued sandbox persona IDs only. Field & Flame uses the published
    # mismatch case for the hold scene. Bodies remain in the sidecar, not books.
    persona_ids = iter([f"P{i:02d}" for i in range(1,16) if i != 12])
    for vendor in data["vendors"]:
        vendor["crsTestIdentity"] = "P12" if vendor["id"] == "field-flame" else next(persona_ids)
    banks = data["bankTransactions"]
    books = data["ledgerEntries"]
    docs = data["sourceDocuments"]
    vendors = {row["id"]: row["name"] for row in data["vendors"]}

    def book(id, date, lines, memo, reference, vendor=None, bank=None):
        books.append({"id": id, "entity": ENTITY, "period": date[:7], "date": date,
                      "lines": lines, "memo": memo, "reference": reference,
                      "vendorId": vendor, "bankTransactionId": bank})

    def document(id, date, kind, vendor, title, text, amount=None, reference=None):
        contract = next(row["id"] for row in data["contracts"] if row["vendorId"] == vendor)
        docs.append({"id": id, "entity": ENTITY, "period": date[:7], "date": date,
                     "kind": kind, "vendorId": vendor, "contractId": contract,
                     "title": title, "text": text, "amount": amount, "reference": reference})

    def cash(id, date, amount, vendor, description, reference, lines=None):
        banks.append(bank_transaction(id, date, amount, vendors[vendor], description, reference, vendor))
        if lines:
            book(f"JE-{id}", date, lines, f"{vendors[vendor]}: {description}", reference, vendor, id)

    def case(number, date, kind, description, bank_ids, contract_ids, source_ids,
             ledger_ids, lines, action, citations, escalate, explanation, depends=None):
        id = f"B{number}-{date[:7]}"
        # A family may recur in a later period. Each period gets a separate case.
        data["breaks"].append({"id": id, "entity": ENTITY, "period": date[:7],
            "kind": kind, "description": description, "bankTransactionIds": bank_ids,
            "contractIds": contract_ids, "status": "open", "breakNumber": number,
            "date": date, "sourceDocumentIds": source_ids, "ledgerEntryIds": ledger_ids})
        impact = sum(abs(row["debit"] - row["credit"]) for row in lines if row["accountCode"].startswith(("4", "5")))
        data["answerKey"].append({"id": f"answer-{id}", "entity": ENTITY, "breakId": id,
            "period": date[:7], "expectedAction": action, "expectedLines": lines,
            "citationIds": citations, "expectedEscalation": escalate, "pnlImpact": impact,
            "explanation": explanation, "breakNumber": number, "dependsOn": depends or []})

    # The same net-fee issue recurs. Reports themselves reconcile; the imported
    # settlement entries use gross cash. No false bank receipt is manufactured.
    stripe_cases = {
        "2026-07-10": (4_860_000, 142_000, 200),
        "2026-08-14": (5_920_000, 173_000, 240),
        "2026-09-11": (6_380_000, 186_000, 260),
    }
    for payout in data["stripePayouts"]:
        if payout["arrivalDate"] in stripe_cases:
            gross, fee, count = stripe_cases[payout["arrivalDate"]]
            payout.update(gross=gross, fee=fee, net=gross-fee, chargeCount=count)
            next(row for row in banks if row["id"] == payout["bankTransactionId"])["amount"] = gross-fee

    payout_by_bank = {row["bankTransactionId"]: row for row in data["stripePayouts"]}
    expense_accounts = {"beacon": "5600", "printworks": "5600", "city-permits": "5500",
        "island-clean": "5500", "office": "5900", "signal": "5900", "ridgeway": "5100",
        "livewire": "5100", "crew": "5100"}
    for txn in banks:
        payout = payout_by_bank.get(txn["id"])
        if payout:
            book(f"JE-charges-{payout['id']}", txn["date"],
                 [line("1010", payout["gross"]), line("2200", credit=payout["gross"])],
                 "Stripe ticket charges deferred until event", payout["id"])
            if txn["date"] in stripe_cases:
                lines = [line("1000", payout["gross"]), line("1010", credit=payout["gross"])]
                fee = payout["fee"]
                case(1, txn["date"], "stripe_fee_netting",
                     f"Stripe bank receipt {payout['net']} cents; settlement book uses {payout['gross']} cents.",
                     [txn["id"]], [], [], [f"JE-settlement-{payout['id']}"],
                     [line("5400", fee), line("1000", credit=fee)], "correct_gross_cash_settlement",
                     ["policy-6.1", "policy-8.2"], txn["period"] == "2026-07",
                     "The settlement was already imported at gross. Expense the fee and reduce cash by the difference; do not reverse ticket revenue.")
            else:
                lines = [line("1000", payout["net"]), line("5400", payout["fee"]), line("1010", credit=payout["gross"])]
            book(f"JE-settlement-{payout['id']}", txn["date"], lines,
                 "Stripe payout settlement", payout["id"], bank=txn["id"])
        else:
            amount = -txn["amount"]
            book(f"JE-{txn['id']}", txn["date"],
                 [line(expense_accounts[txn["vendorId"]], amount), line("1000", credit=amount)],
                 f"{txn['counterparty']}: {txn['description']}", txn["reference"], txn["vendorId"], txn["id"])

    # 2: the service is in September, so both July invoices were capitalized as
    # prepaid. Voiding the duplicate reduces AP/prepaid and has zero P&L impact.
    for channel, reference in (("email", "SW-1042"), ("portal", "SW1042")):
        document(f"sw1042-{channel}", "2026-07-14", "invoice", "soundwave", f"SoundWave invoice via {channel}",
                 f"Invoice {reference}, production services for September 19–20, 2026, $18,500. Submitted via {channel}. Purchase order SOUND-2026-01.", 1_850_000, reference)
        book(f"JE-sw1042-{channel}", "2026-07-14", [line("1300", 1_850_000), line("2000", credit=1_850_000)],
             f"SoundWave Production invoice {reference} via {channel}", reference, "soundwave")
    cash("bank-soundwave-payment", "2026-07-29", -1_850_000, "soundwave", "Payment of production invoice SW-1042", "SW-1042",
         [line("2000", 1_850_000), line("1000", credit=1_850_000)])
    case(2, "2026-07-31", "duplicate_payable", "Two imported payables have SW-1042/SW1042, the same purchase order and amount; one bank payment.",
         ["bank-soundwave-payment"], ["contract-soundwave"], ["sw1042-email", "sw1042-portal"],
         ["JE-sw1042-email", "JE-sw1042-portal"], [line("2000", 1_850_000), line("1300", credit=1_850_000)],
         "void_duplicate_payable", ["soundwave-2.1", "policy-2.0", "policy-8.0"], True,
         "Reverse only the portal duplicate: debit AP, credit prepaid. September production has not been delivered in July, so the reversal has zero P&L impact.")
    book("JE-soundwave-service", "2026-09-20", [line("5100", 1_850_000), line("1300", credit=1_850_000)],
         "SoundWave Production services delivered", "SW-1042", "soundwave")

    # 3: the July receivable and the later Apex deposit have different vendors
    # and accounts. They share treatment only after a real controller decision.
    cash("bank-artist-deposit", "2026-07-08", -6_000_000, "northern-lines", "50 percent artist deposit", "NL-DEPOSIT",
         [line("1250", 6_000_000), line("1000", credit=6_000_000)])
    document("northern-cancellation", "2026-07-20", "cancellation", "northern-lines", "Artist cancellation notice",
             "The Northern Lines cancel the September 19 performance on July 20, more than 30 days before the event. Refund processed under signed clause 7.2.", 6_000_000, "NL-CANCEL")
    book("JE-northern-receivable", "2026-07-20", [line("1100", 6_000_000), line("1250", credit=6_000_000)],
         "The Northern Lines deposit reclassified to receivable", "NL-CANCEL", "northern-lines")
    cash("bank-artist-refund", "2026-07-27", 5_100_000, "northern-lines", "Artist deposit refund", "NL-REFUND")
    case(3, "2026-07-31", "deposit_shortfall", "Artist refund is $51,000; receivable remains $60,000.",
         ["bank-artist-refund"], ["contract-northern-lines"], ["northern-cancellation"], ["JE-northern-receivable"],
         [line("1000", 5_100_000), line("5050", 900_000), line("1100", credit=6_000_000)],
         "clear_receivable_and_expense_contract_fee", ["northern-lines-7.2", "policy-5.1"], True,
         "The $9,000 is exactly 15% of the $60,000 deposit and is non-recoverable. A human approval of this treatment may become D-0417; no decision is fabricated by seeding.")
    cash("bank-apex-deposit", "2026-08-25", -1_600_000, "apex", "Equipment damage deposit", "APEX-DEPOSIT",
         [line("1200", 1_600_000), line("1000", credit=1_600_000)])
    cash("bank-apex-refund", "2026-09-25", 1_360_000, "apex", "Equipment deposit returned", "APEX-RETURN")
    case(3, "2026-09-25", "deposit_shortfall", "Apex returns $13,600 against a $16,000 vendor deposit.",
         ["bank-apex-refund"], ["contract-apex"], [], ["JE-bank-apex-deposit"],
         [line("1000", 1_360_000), line("5160", 240_000), line("1200", credit=1_600_000)],
         "expense_inspection_fee", ["apex-9.4", "policy-5.1", "policy-8.2"], False,
         "15% of $16,000 is $2,400. Clear the deposit, recognize cash and inspection expense. Retrieve the actual July human decision if it exists.", ["B3-2026-07"])

    # 4: daily ratable fixed revenue, cumulative catch-up, then the capped
    # variable amount. The brief's approximate $6,700 is not the cumulative
    # result of its stated campaign dates; all arithmetic here is explicit.
    old_july = prorata(5_000_000, 31)
    old_august = prorata(5_000_000, 62) - old_july
    old_september = 5_000_000 - old_july - old_august
    new_august_cumulative = prorata(3_000_000, 62)
    fixed_remaining = 3_000_000 - new_august_cumulative
    ar_excess = old_july + old_august - 3_000_000
    catch_up = old_july + old_august - new_august_cumulative
    variable = min(50_000 * 200, 7_000_000 - 3_000_000)
    document("brightwater-amendment", "2026-08-10", "amendment", "brightwater", "Signed sponsorship amendment",
             next(c["text"] for row in data["contracts"] for c in row["clauses"] if c["id"] == "brightwater-amendment-1"), reference="BW-AMEND-1")
    book("JE-brightwater-july", "2026-07-31", [line("1150", old_july), line("4100", credit=old_july)],
         "Brightwater Beverage July fixed sponsorship recognition", "BW-JUL", "brightwater")
    cash("bank-brightwater-fixed", "2026-08-15", 3_000_000, "brightwater", "Fixed sponsorship payment", "BW-FIXED",
         [line("1000", 3_000_000), line("1150", credit=old_july), line("2250", credit=3_000_000-old_july)])
    book("JE-brightwater-august", "2026-08-31", [line("2250", 3_000_000-old_july), line("1150", ar_excess), line("4100", credit=old_august)],
         "Brightwater Beverage August fixed recognition at original schedule", "BW-AUG", "brightwater")
    case(4, "2026-08-31", "contract_amendment", "Signed amendment sets $30,000 fixed; books continue the original $50,000 schedule.",
         ["bank-brightwater-fixed"], ["contract-brightwater"], ["brightwater-amendment"], ["JE-brightwater-july", "JE-brightwater-august"],
         [line("4100", catch_up), line("1150", credit=ar_excess), line("2250", credit=fixed_remaining)],
         "cumulative_fixed_fee_catch_up", ["brightwater-amendment-1", "policy-6.2"], True,
         "82 campaign days inclusive. Fixed revenue through August is round($30,000 × 62/82) = $22,682.93. Imported revenue is $37,804.88, so reduce revenue $15,121.95; clear excess AR and defer the remaining fixed fee.")
    document("festival-attendance", "2026-09-20", "attendance", "brightwater", "Final paid attendance certificate",
             "At September 20 close the festival's paid attendance is 50,000. Sponsorship variable consideration is $2.00 per paid attendee, subject to the amended $70,000 total cap.", reference="ATTENDANCE-FINAL")
    book("JE-brightwater-september", "2026-09-20", [line("1150", old_september), line("4100", credit=old_september)],
         "Brightwater Beverage September fixed recognition at original schedule", "BW-SEP", "brightwater")
    cash("bank-brightwater-variable", "2026-09-30", variable, "brightwater", "Attendance-based sponsorship settlement", "BW-VARIABLE",
         [line("1000", variable), line("1150", credit=variable)])
    case(4, "2026-09-30", "contract_amendment", "Attendance is now measurable; September books still use the original fixed-only schedule.",
         ["bank-brightwater-variable"], ["contract-brightwater"], ["festival-attendance"], ["JE-brightwater-september"],
         [line("2250", fixed_remaining), line("1150", variable-old_september), line("4100", credit=fixed_remaining+variable-old_september)],
         "recognize_remaining_fixed_and_capped_variable", ["brightwater-amendment-1", "policy-6.2"], True,
         "After the August correction, release $7,317.07 deferred fixed and recognize $40,000 variable (cap $70,000 less $30,000 fixed). Correct the imported September fixed-only entry; cumulative revenue becomes exactly $70,000.", ["B4-2026-08"])

    # 5 is a preventive, non-bank event. The $42,000 never appears as an actual
    # cash outflow. Reclassify the unpaid invoiced advance to review suspense.
    document("field-flame-invoice", "2026-09-01", "invoice", "field-flame", "Catering final advance invoice",
             "Final catering invoice FF-209, $42,000 due September 15 before the event. Pay to the approved vendor master account ending 4471.", 4_200_000, "FF-209")
    book("JE-field-flame-invoice", "2026-09-01", [line("1300", 4_200_000), line("2000", credit=4_200_000)],
         "Field & Flame invoiced catering advance", "FF-209", "field-flame")
    document("field-flame-email", "2026-09-10", "bank_change", "field-flame", "Bank-detail change email",
             "Email received September 10: please change Field & Flame payment details from account ending 4471 to account ending 8832. No callback verification is on file.", reference="FF-CHANGE-0910")
    document("field-flame-payment-request", "2026-09-13", "payment_request", "field-flame", "Catering payment request",
             "Request to pay $42,000 on September 13 to account ending 8832; contractual due date September 15. This is a pending request, not a settled bank transaction.", 4_200_000, "FF-PAY-0913")
    case(5, "2026-09-10", "bank_detail_change", "Vendor master ends 4471; unverified email requests 8832 before a $42,000 payment.",
         [], ["contract-field-flame"], ["field-flame-invoice", "field-flame-email", "field-flame-payment-request"], ["JE-field-flame-invoice"],
         [line("1400", 4_200_000), line("1300", credit=4_200_000)], "hold_and_verify_before_payment",
         ["policy-4.3", "field-flame-5.1"], True,
         "Hold on September 10, retain approved master details, verify via CRS and callback, escalate. Reclass the unpaid advance to 1400; do not credit Cash for a payment that never left. CRS unavailable means the hold remains.")

    # 6: service in August, invoice in September. No fictitious August bank
    # movement is added just to make a bank-only matcher discover an accrual.
    document("ironclad-setup-schedule", "2026-08-31", "service_schedule", "ironclad", "Security site setup schedule",
             "Ironclad Security completed site setup August 30–31 for $9,400. Event coverage September 19–20 is a separate $28,000 service. Setup invoice follows after service.", 940_000, "IC-SETUP")
    document("ironclad-setup-invoice", "2026-09-08", "invoice", "ironclad", "Security setup invoice received",
             "Invoice IC-830 received September 8, $9,400, for site setup performed August 30–31. Net 30 after service.", 940_000, "IC-830")
    book("JE-ironclad-invoice", "2026-09-08", [line("5200", 940_000), line("2000", credit=940_000)],
         "Ironclad Security setup invoice IC-830", "IC-830", "ironclad")
    cash("bank-ironclad-setup", "2026-09-30", -940_000, "ironclad", "Setup invoice payment", "IC-830",
         [line("2000", 940_000), line("1000", credit=940_000)])
    case(6, "2026-08-31", "missing_accrual", "August setup was completed for $9,400; no August setup entry or invoice exists.",
         [], ["contract-ironclad"], ["ironclad-setup-schedule"], [],
         [line("5200", 940_000), line("2100", credit=940_000)], "accrue_in_service_period",
         ["ironclad-2.1", "policy-7.1"], True, "Accrue $9,400 in August from the service schedule even though cash and invoice are absent.")
    case(6, "2026-09-08", "missing_accrual", "September books expense the August setup again when the invoice arrives.",
         ["bank-ironclad-setup"], ["contract-ironclad"], ["ironclad-setup-invoice"], ["JE-ironclad-invoice"],
         [line("2100", 940_000), line("5200", credit=940_000)], "reverse_prior_accrual_on_invoice",
         ["ironclad-2.1", "policy-7.1"], True,
         "After August accrual, reverse it in September. Combined with the already imported invoice, AP remains $9,400 and the service expense remains in August.", ["B6-2026-08"])

    banks.sort(key=lambda row: (row["date"], row["id"]))
    books.sort(key=lambda row: (row["date"], row["id"]))
    docs.sort(key=lambda row: (row["date"], row["id"]))
    data["breaks"].sort(key=lambda row: (row["period"], row["breakNumber"]))
    data["answerKey"].sort(key=lambda row: (row["period"], row["breakNumber"]))
    return data
