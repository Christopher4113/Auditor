"""Fictitious reference data from the final Auditor brief, not production policy.

Amounts are integer USD cents. Clause IDs intentionally match Interface 1's
existing retrieval fixtures, so later indexing can preserve the verbatim text.
"""

from copy import deepcopy

ENTITY = "eo-festival-nyc"  # Shared entity ID from main's final-design skeleton.
CURRENCY = "USD"

ACCOUNT_ROWS = [
    ("1000", "Cash", "asset"),
    ("1010", "Stripe clearing", "asset"),
    ("1100", "Accounts receivable", "asset"),
    ("1150", "Sponsorship receivable", "asset"),
    ("1200", "Vendor deposits", "asset"),
    ("1250", "Artist deposits", "asset"),
    ("1300", "Prepaid expenses", "asset"),
    ("1400", "Payments under review", "asset"),
    ("2000", "Accounts payable", "liability"),
    ("2100", "Accrued liabilities", "liability"),
    ("2200", "Deferred ticket revenue", "liability"),
    ("2250", "Deferred sponsorship revenue", "liability"),
    ("3000", "Common stock", "equity"),
    ("3100", "Retained earnings", "equity"),
    ("4000", "Ticket revenue", "revenue"),
    ("4100", "Sponsorship revenue", "revenue"),
    ("5000", "Artist fees", "expense"),
    ("5050", "Artist cancellation fees", "expense"),
    ("5100", "Production", "expense"),
    ("5150", "Staging and equipment", "expense"),
    ("5160", "Equipment inspection and damage fees", "expense"),
    ("5200", "Security", "expense"),
    ("5300", "Catering", "expense"),
    ("5400", "Payment processing fees", "expense"),
    ("5500", "Venue and permits", "expense"),
    ("5600", "Marketing", "expense"),
    ("5900", "G&A", "expense"),
]

POLICY_ROWS = [
    ("1.0", "The controller owns the books and signs each period close."),
    ("2.0", "The bank feed is the system of record for cash, the ledger for balances, and signed contracts for amounts owed. When sources disagree, the proposal states which governs and why."),
    ("3.0", "Periods close on human sign-off and are then locked. Late items are booked in the current period with a reference to the original period."),
    ("4.3", "A vendor bank-detail change holds payments to that vendor until callback verification is logged. The change is escalated the day it arrives."),
    ("5.1", "Where a contract makes a fee, penalty or deduction non-recoverable, the amount is expensed in the period it becomes certain. It is not carried as a receivable."),
    ("6.1", "Ticket sales are deferred until the event. Gross charges are recorded to Stripe clearing; processing fees are expensed when the payout settles."),
    ("6.2", "Fixed sponsorship is recognized ratably over the campaign. Variable components are recognized when measurable. A mid-term amendment triggers a catch-up in the period signed."),
    ("7.1", "Costs for services rendered are accrued in the period of service from the schedule and reversed when the invoice arrives."),
    ("8.0", "Materiality is P&L impact, the sum of revenue and expense lines. Under $5,000 the controls engine may post when every rule passes and a policy clause is cited. $5,000 or more, and any control exception, requires the controller."),
    ("8.1", "No person or system approves an entry it proposed."),
    ("8.2", "A human-decided precedent with matching scope, under threshold, is pre-approved and does not re-escalate."),
    ("9.0", "Every decision records the proposal, reviewer, rules run, verbatim citations, and outcome."),
]

VENDOR_ROWS = [
    ("northern-lines", "The Northern Lines", "artist", "1024"),
    ("apex", "Apex Staging", "staging", "2846"),
    ("brightwater", "Brightwater Beverage", "sponsor", "3165"),
    ("ironclad", "Ironclad Security", "security", "6680"),
    ("field-flame", "Field & Flame", "catering", "4471"),
    ("soundwave", "SoundWave Production", "production", "5912"),
    ("city-permits", "Island Event Permits", "venue", "7403"),
    ("beacon", "Beacon Creative", "marketing", "6284"),
    ("office", "Backstage Office Supply", "administration", "9157"),
    ("ridgeway", "Ridgeway Event Freight", "logistics", "4208"),
    ("livewire", "Livewire Temporary Power", "production", "5316"),
    ("island-clean", "Island Clean Site Services", "venue", "6842"),
    ("signal", "Signal Crew Communications", "administration", "7930"),
    ("crew", "Stage Door Event Staffing", "staffing", "8061"),
    ("printworks", "Festival Printworks", "marketing", "9240"),
]


def clause(id: str, number: str, text: str, effective: str = "2026-07-01") -> dict:
    return {"id": id, "number": number, "text": text, "effectiveDate": effective}


CONTRACT_ROWS = [
    {
        "id": "contract-northern-lines", "vendorId": "northern-lines",
        "title": "The Northern Lines headliner agreement", "signedDate": "2026-07-01",
        "startDate": "2026-07-01", "endDate": "2026-09-20",
        "clauses": [
            clause("northern-lines-2.1", "2.1", "The total artist fee is $120,000 for the September 19–20, 2026 festival."),
            clause("northern-lines-3.1", "3.1", "Fifty percent of the artist fee ($60,000) is payable within 10 days of signing; the balance is due before performance."),
            clause("northern-lines-7.2", "7.2", "If the artist cancels more than 30 days before the event, the deposit is refunded less a 15% administrative fee."),
        ],
    },
    {
        "id": "contract-apex", "vendorId": "apex",
        "title": "Apex Staging equipment agreement", "signedDate": "2026-07-01",
        "startDate": "2026-07-01", "endDate": "2026-09-25",
        "clauses": [clause("apex-9.4", "9.4", "A damage deposit of $16,000 is payable before load-in and refundable within 5 business days after load-out, less a 15% inspection fee.")],
    },
    {
        "id": "contract-brightwater", "vendorId": "brightwater",
        "title": "Brightwater Beverage sponsorship agreement", "signedDate": "2026-07-01",
        "startDate": "2026-07-01", "endDate": "2026-09-20",
        "clauses": [
            clause("brightwater-3.1", "3.1", "The sponsor will pay $50,000 on August 15, 2026 for a campaign running July 1 through September 20, 2026."),
            clause("brightwater-amendment-1", "Amendment 1", "Signed August 10, 2026: replace the $50,000 fixed fee with $30,000 fixed, payable August 15, plus $2.00 per paid attendee. Total consideration is capped at $70,000 and the variable balance settles within 15 days after the festival.", "2026-08-10"),
        ],
    },
    {
        "id": "contract-ironclad", "vendorId": "ironclad",
        "title": "Ironclad Security service schedule", "signedDate": "2026-07-01",
        "startDate": "2026-08-30", "endDate": "2026-09-20",
        "clauses": [clause("ironclad-2.1", "2.1", "Site setup on August 30–31, 2026 costs $9,400. Event coverage on September 19–20, 2026 costs $28,000. Each service is invoiced net 30 after service.")],
    },
    {
        "id": "contract-field-flame", "vendorId": "field-flame",
        "title": "Field & Flame catering agreement", "signedDate": "2026-07-01",
        "startDate": "2026-09-19", "endDate": "2026-09-20",
        "clauses": [clause("field-flame-5.1", "5.1", "Final payment of $42,000 is due September 15, 2026 to the account on the vendor master ending 4471.")],
    },
    {
        "id": "contract-soundwave", "vendorId": "soundwave",
        "title": "SoundWave Production purchase order", "signedDate": "2026-07-01",
        "startDate": "2026-07-01", "endDate": "2026-09-20",
        "clauses": [clause("soundwave-2.1", "2.1", "An accepted production invoice is paid once, net 30. Copies submitted through email and the vendor portal do not create separate obligations.")],
    },
]


def master_data(seed: int, dataset: str = "generated") -> dict:
    """Return a fresh document; callers cannot mutate shared reference records."""
    accounts = [
        {"id": f"acct-{code}", "entity": ENTITY, "code": code, "name": name,
         "type": kind, "normalBalance": "debit" if kind in {"asset", "expense"} else "credit",
         "currency": CURRENCY}
        for code, name, kind in ACCOUNT_ROWS
    ]
    opening = [("1000", 38_000_000, 0), ("1300", 6_000_000, 0),
               ("3000", 0, 50_000_000), ("3100", 6_000_000, 0)]
    return {
        "schemaVersion": "1.0.0", "seed": seed, "dataset": dataset,
        "entity": ENTITY, "currency": CURRENCY,
        "company": {
            "name": "Experts Only Festival NYC", "synthetic": True,
            "eventStartDate": "2026-09-19", "eventEndDate": "2026-09-20",
            "paidAttendance": 50_000,
        },
        "accounts": accounts,
        "openingBalances": [
            {"id": f"opening-{code}", "entity": ENTITY, "date": "2026-07-01",
             "accountCode": code, "debit": debit, "credit": credit}
            for code, debit, credit in opening
        ],
        "periods": [
            {"id": f"2026-{month:02d}", "entity": ENTITY,
             "startDate": f"2026-{month:02d}-01", "endDate": f"2026-{month:02d}-{last}",
             "status": "open"}
            for month, last in [(7, 31), (8, 31), (9, 30)]
        ],
        "bankTransactions": [], "stripePayouts": [],
        "contracts": [dict(deepcopy(row), entity=ENTITY, currency=CURRENCY) for row in CONTRACT_ROWS],
        "policyClauses": [
            {"id": f"policy-{number}", "entity": ENTITY, "policyPackId": "policy-nyc-v1",
             "number": number, "text": text, "effectiveDate": "2026-07-01"}
            for number, text in POLICY_ROWS
        ],
        "vendors": [
            {"id": id, "entity": ENTITY, "name": name, "category": category,
             "bankAccountLast4": last4, "crsTestIdentity": None}
            for id, name, category, last4 in VENDOR_ROWS
        ],
        "breaks": [], "answerKey": [], "fxRates": [],
    }
