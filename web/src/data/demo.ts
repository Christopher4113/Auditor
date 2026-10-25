import type {
  Citation,
  ControlRule,
  Period,
  PermissionGroup,
  Proposal,
} from "./types";

/** Illustrative, local-only records for the frontend. No live financial activity. */
export const periods: Period[] = ["July 2026", "August 2026", "September 2026"];

// These three passages are copied verbatim from retrieval/main.py's agreed stub interface.
const apexCitations: Citation[] = [
  {
    sourceType: "precedent",
    sourceId: "D-0417",
    text: "Northern Lines cancellation fee expensed per policy 5.1; not carried as a receivable.",
    score: 0.91,
  },
  {
    sourceType: "contract",
    sourceId: "apex-9.4",
    text: "A damage deposit of $16,000 is payable before load-in and refundable within 5 business days after load-out, less a 15% inspection fee.",
    score: 0.88,
  },
  {
    sourceType: "policy",
    sourceId: "policy-5.1",
    text: "Where a contract makes a fee, penalty or deduction non-recoverable, the amount is expensed in the period it becomes certain. It is not carried as a receivable.",
    score: 0.85,
  },
];

const standardRules: ControlRule[] = [
  {
    label: "Balanced entry",
    detail: "Total debits equal total credits.",
    passed: true,
  },
  {
    label: "Source citations",
    detail: "The proposal includes supporting source evidence.",
    passed: true,
  },
  {
    label: "P&L materiality",
    detail: "P&L impact is below the $5,000 approval threshold.",
    passed: true,
  },
  {
    label: "Open period",
    detail: "The fiscal period is open for journal entries.",
    passed: true,
  },
  {
    label: "Segregation of duties",
    detail: "The controls identity posts; the agent can only propose.",
    passed: true,
  },
];

const materialRules = (detail: string): ControlRule[] =>
  standardRules.map((rule) =>
    rule.label === "P&L materiality"
      ? { ...rule, detail, passed: false }
      : { ...rule },
  );

/** Additional passages below are illustrative demo source excerpts, not retrieved live. */
const stripeCitations: Citation[] = [
  {
    sourceType: "precedent",
    sourceId: "D-0408",
    text: "For weekly Stripe settlements, reconcile gross ticket receipts to the net bank deposit and separately recognize processing fees. Scope: Stripe ticket settlements, USD, same fee structure.",
    score: 0.96,
  },
  {
    sourceType: "contract",
    sourceId: "stripe-settlement",
    text: "Each settlement remits ticket receipts net of payment-processing fees. The payout report identifies gross receipts, processing fees and the net bank deposit.",
    score: 0.93,
  },
  {
    sourceType: "policy",
    sourceId: "policy-8.2",
    text: "A human-approved decision with a matching precedent scope may be applied under the materiality threshold when every other control passes.",
    score: 0.9,
  },
];

const ironcladCitations: Citation[] = [
  {
    sourceType: "contract",
    sourceId: "ironclad-service",
    text: "Site setup services are performed on August 30 and August 31, 2026. The total fixed fee is $9,400.",
    score: 0.97,
  },
  {
    sourceType: "policy",
    sourceId: "policy-7.1",
    text: "Recognize the cost of services in the period the services are received. Accrue uninvoiced services at period end and reverse the accrual when the invoice is recorded.",
    score: 0.94,
  },
];

export const initialProposals: Proposal[] = [
  {
    id: "apex-sep",
    title: "A deposit returned. A precedent remembered.",
    vendor: "Apex Staging",
    amount: 16000,
    impact: 2400,
    date: "Sep 25, 2026",
    period: "September 2026",
    status: "posted",
    category: "Deposit reconciliation",
    description:
      "The $16,000 staging deposit came back as $13,600. The difference is a contractual inspection fee.",
    reason:
      "Apex clause 9.4 makes the 15% inspection fee non-recoverable. The Northern Lines decision establishes the treatment under policy 5.1: expense the $2,400 deduction and clear the full deposit. Every control passes, so the controls engine posts under the approved policy.",
    decisionId: "D-0625",
    sourceBank: {
      label: "Deposit refund · Apex Staging",
      amount: 13600,
      date: "Sep 25, 2026",
      reference: "BNK-0925-018",
    },
    sourceLedger: {
      label: "Refundable staging deposit",
      amount: 16000,
      account: "1200 · Vendor deposits",
    },
    contract: {
      title: "Apex Staging Agreement",
      clause: "Clause 9.4 · Inspection fee",
      text: apexCitations[1].text,
    },
    lines: [
      { account: "1000", name: "Operating cash", debit: 13600, credit: 0 },
      {
        account: "5160",
        name: "Inspection fee expense",
        debit: 2400,
        credit: 0,
      },
      {
        account: "1200",
        name: "Vendor deposits",
        debit: 0,
        credit: 16000,
      },
    ],
    citations: apexCitations,
    audit: [
      {
        time: "10:42:01",
        title: "Bank transaction received",
        detail: "$13,600 refund linked to the Apex staging deposit.",
        kind: "info",
      },
      {
        time: "10:42:02",
        title: "Precedent retrieved",
        detail: "Moss returned D-0417, Apex 9.4 and policy 5.1.",
        kind: "info",
      },
      {
        time: "10:42:04",
        title: "Entry proposed",
        detail:
          "Staff accountant proposed a balanced $16,000 entry with three citations.",
        kind: "info",
      },
      {
        time: "10:42:04",
        title: "Controls passed",
        detail:
          "$2,400 P&L impact is below $5,000; period open; sources present.",
        kind: "success",
      },
      {
        time: "10:42:05",
        title: "Posted by controls",
        detail:
          "Decision D-0625 recorded and made available as future precedent.",
        kind: "success",
      },
    ],
    rules: standardRules.map((rule) => ({ ...rule })),
  },
  {
    id: "field-flame-sep",
    title: "New bank details. Payment on hold.",
    vendor: "Field & Flame",
    amount: 42000,
    impact: 0,
    date: "Sep 15, 2026",
    period: "September 2026",
    status: "held",
    category: "Bank detail change",
    description:
      "A $42,000 catering payment is due after the vendor changed its bank details on September 10.",
    reason:
      "The changed beneficiary details trigger policy 4.3 regardless of the P&L impact. CRS verification is unavailable in this demo, so the payment remains held and the funds stay parked in account 1400. A controller must review the exception and obtain independent confirmation.",
    decisionId: "D-0615",
    sourceBank: {
      label: "Payment parked · release held",
      amount: 42000,
      date: "Sep 15, 2026",
      reference: "HOLD-0915-004",
    },
    sourceLedger: {
      label: "Catering payment pending verification",
      amount: 42000,
      account: "1400 · Payments on hold",
    },
    contract: {
      title: "Field & Flame Catering Agreement",
      clause: "Payment schedule · September 15",
      text: "The final catering payment of $42,000 is due on September 15, 2026. Changes to beneficiary bank details require independent confirmation before payment release.",
    },
    lines: [
      { account: "1400", name: "Payments on hold", debit: 42000, credit: 0 },
      { account: "1000", name: "Operating cash", debit: 0, credit: 42000 },
    ],
    citations: [
      {
        sourceType: "policy",
        sourceId: "policy-4.3",
        text: "A change to vendor bank details places any pending payment on hold. Verify the payee independently and escalate the exception to the controller on the same day. Verification failure or unavailability does not release the hold.",
        score: 0.98,
      },
      {
        sourceType: "contract",
        sourceId: "field-flame-payment",
        text: "The final catering payment of $42,000 is due on September 15, 2026. Changes to beneficiary bank details require independent confirmation before payment release.",
        score: 0.95,
      },
    ],
    audit: [
      {
        time: "09:14:01",
        title: "Bank details changed",
        detail: "Vendor account amendment received on September 10.",
        kind: "warning",
      },
      {
        time: "09:14:02",
        title: "Policy 4.3 hold applied",
        detail: "The pending $42,000 payment was held before release.",
        kind: "warning",
      },
      {
        time: "09:14:03",
        title: "CRS verification unavailable",
        detail: "No successful payee verification. The service fails closed.",
        kind: "error",
      },
      {
        time: "09:14:04",
        title: "Escalated to controller",
        detail:
          "Independent bank confirmation is required. Payment remains in account 1400.",
        kind: "warning",
      },
    ],
    rules: [
      {
        label: "Balanced entry",
        detail: "The proposed suspense entry is balanced.",
        passed: true,
      },
      {
        label: "Source citations",
        detail: "Bank amendment and policy 4.3 are attached.",
        passed: true,
      },
      {
        label: "Bank details unchanged",
        detail: "Beneficiary details changed on September 10.",
        passed: false,
      },
      {
        label: "CRS payee verification",
        detail: "Verification unavailable. Payment stays on hold.",
        passed: false,
      },
      {
        label: "Controller release",
        detail: "Independent confirmation and a human decision are required.",
        passed: false,
      },
    ],
  },
  {
    id: "stripe-sep",
    title: "Weekly settlement, without another question.",
    vendor: "Stripe",
    amount: 48600,
    impact: 1420,
    date: "Sep 23, 2026",
    period: "September 2026",
    status: "posted",
    category: "Settlement reconciliation",
    description:
      "$48,600 in ticket receipts reconciled to the $47,180 net deposit and $1,420 processing fee.",
    reason:
      "The settlement matches the controller-approved Stripe precedent from July. The same counterparty, currency and fee structure fall within the precedent scope. Record processing fees separately and clear the gross ticket receivable.",
    decisionId: "D-0623",
    sourceBank: {
      label: "Weekly net settlement · Stripe",
      amount: 47180,
      date: "Sep 23, 2026",
      reference: "STRIPE-0923-W38",
    },
    sourceLedger: {
      label: "Gross ticket settlement clearing balance",
      amount: 48600,
      account: "1100 · Stripe clearing",
    },
    contract: {
      title: "Stripe Settlement Report",
      clause: "Weekly payout · W38",
      text: stripeCitations[1].text,
    },
    lines: [
      { account: "1000", name: "Operating cash", debit: 47180, credit: 0 },
      {
        account: "6100",
        name: "Payment processing fees",
        debit: 1420,
        credit: 0,
      },
      { account: "1100", name: "Stripe clearing", debit: 0, credit: 48600 },
    ],
    citations: stripeCitations,
    audit: [
      {
        time: "08:31:02",
        title: "Net settlement detected",
        detail: "$47,180 payout matched to $48,600 gross ticket receipts.",
        kind: "info",
      },
      {
        time: "08:31:03",
        title: "Prior approval applied",
        detail: "D-0408 precedent scope matches this weekly settlement.",
        kind: "info",
      },
      {
        time: "08:31:04",
        title: "Posted by controls",
        detail:
          "$1,420 fee recorded under policy 8.2. No new human approval needed.",
        kind: "success",
      },
    ],
    rules: [
      ...standardRules.map((rule) => ({ ...rule })),
      {
        label: "Precedent scope",
        detail: "Matches the human-approved July Stripe decision D-0408.",
        passed: true,
      },
    ],
  },
  {
    id: "ironclad-sep",
    title: "An August cost, a September invoice.",
    vendor: "Ironclad Site Services",
    amount: 9400,
    impact: 0,
    date: "Sep 8, 2026",
    period: "September 2026",
    status: "posted",
    category: "Accrual reversal",
    description:
      "The late site-setup invoice clears the August accrual without charging September twice.",
    reason:
      "The $9,400 services were delivered August 30–31 and accrued in August following controller approval. Reverse the accrued liability and book the September invoice to accounts payable. There is no additional September P&L impact.",
    decisionId: "D-0608",
    sourceBank: {
      label: "No payment released · invoice pending",
      amount: 0,
      date: "Sep 8, 2026",
      reference: "INV-IC-0908",
    },
    sourceLedger: {
      label: "Approved August site-setup accrual",
      amount: 9400,
      account: "2100 · Accrued expenses",
    },
    contract: {
      title: "Ironclad Site Setup Order",
      clause: "Service dates · August 30–31",
      text: ironcladCitations[0].text,
    },
    lines: [
      { account: "2100", name: "Accrued expenses", debit: 9400, credit: 0 },
      { account: "2000", name: "Accounts payable", debit: 0, credit: 9400 },
    ],
    citations: [
      ...ironcladCitations,
      {
        sourceType: "precedent",
        sourceId: "D-0531",
        text: "Accrue $9,400 of Ironclad site-setup services in August. Reverse the accrual when the September invoice is recorded; do not recognize the expense twice.",
        score: 0.96,
      },
    ],
    audit: [
      {
        time: "11:05:01",
        title: "Invoice received",
        detail: "Invoice IC-0908 confirms the $9,400 August services.",
        kind: "info",
      },
      {
        time: "11:05:03",
        title: "August decision retrieved",
        detail: "D-0531 supplies the approved accrual and reversal treatment.",
        kind: "info",
      },
      {
        time: "11:05:04",
        title: "Posted by controls",
        detail: "Accrued expenses cleared to AP; September P&L impact is $0.",
        kind: "success",
      },
    ],
    rules: standardRules.map((rule) => ({ ...rule })),
  },
  {
    id: "soundwave-jul",
    title: "One invoice. Two entries.",
    vendor: "SoundWave Production",
    amount: 18500,
    impact: 0,
    date: "Jul 22, 2026",
    period: "July 2026",
    status: "review",
    category: "Duplicate invoice",
    description:
      "Invoice SW-1042 was registered twice. The duplicate $18,500 payable is pending a controller-approved administrative void.",
    reason:
      "Both registrations share the same vendor, invoice number, amount and service date. Keep the original payable and void the duplicate registration against its balance-sheet clearing record. This illustrative administrative correction has $0 P&L impact. A duplicate invoice is still a control exception, so it requires controller review regardless of the materiality threshold.",
    decisionId: "P-0422",
    sourceBank: {
      label: "No second payment · duplicate caught",
      amount: 0,
      date: "Jul 22, 2026",
      reference: "DUP-SW-1042",
    },
    sourceLedger: {
      label: "Duplicate payable registration · SW-1042",
      amount: 18500,
      account: "2000 · Accounts payable",
    },
    contract: {
      title: "SoundWave Invoice SW-1042",
      clause: "Invoice identity · duplicate match",
      text: "Invoice SW-1042: SoundWave Production, production services, total $18,500. One invoice represents one payable obligation.",
    },
    lines: [
      { account: "2000", name: "Accounts payable", debit: 18500, credit: 0 },
      {
        account: "1290",
        name: "Duplicate invoice clearing",
        debit: 0,
        credit: 18500,
      },
    ],
    citations: [
      {
        sourceType: "contract",
        sourceId: "SW-1042",
        text: "Invoice SW-1042: SoundWave Production, production services, total $18,500. One invoice represents one payable obligation.",
        score: 0.99,
      },
      {
        sourceType: "policy",
        sourceId: "policy-duplicate",
        text: "A suspected duplicate invoice is a control exception. Preserve the original valid invoice, void the duplicate payable registration and obtain controller approval before finalizing the correction.",
        score: 0.95,
      },
    ],
    audit: [
      {
        time: "14:12:01",
        title: "Duplicate invoice flagged",
        detail:
          "Two payable registrations reference vendor SoundWave and invoice SW-1042.",
        kind: "warning",
      },
      {
        time: "14:12:03",
        title: "Administrative void proposed",
        detail:
          "Remove the duplicate $18,500 AP registration against duplicate invoice clearing. P&L impact: $0.",
        kind: "info",
      },
      {
        time: "14:12:04",
        title: "Controller review required",
        detail:
          "The duplicate-invoice control exception prevents automatic posting, even with $0 P&L impact.",
        kind: "warning",
      },
    ],
    rules: [
      ...standardRules.map((rule) => ({ ...rule })),
      {
        label: "Duplicate invoice control",
        detail:
          "SW-1042 appears twice. A human must approve the administrative void.",
        passed: false,
      },
    ],
    revisionNote:
      "Controller instruction on approval is stored as a correction so future duplicate checks do not repeat the mistake.",
  },
  {
    id: "northern-lines-jul",
    title: "Cancellation settled. Treatment established.",
    vendor: "Northern Lines",
    amount: 60000,
    impact: 9000,
    date: "Jul 17, 2026",
    period: "July 2026",
    status: "posted",
    category: "Cancellation settlement",
    description:
      "A cancelled headliner returned $51,000 of a $60,000 deposit. The controller approved the $9,000 fee.",
    reason:
      "The retained cancellation fee is non-recoverable under the signed agreement. Policy 5.1 requires recognition as expense when the loss becomes certain. The controller reviewed the $9,000 P&L impact and approved the treatment, establishing decision D-0417.",
    decisionId: "D-0417",
    sourceBank: {
      label: "Cancellation refund · Northern Lines",
      amount: 51000,
      date: "Jul 17, 2026",
      reference: "BNK-0717-006",
    },
    sourceLedger: {
      label: "Headliner booking deposit",
      amount: 60000,
      account: "1200 · Vendor deposits",
    },
    contract: {
      title: "Northern Lines Artist Agreement",
      clause: "Cancellation settlement",
      text: "Following the artist cancellation, $51,000 of the $60,000 deposit will be returned. The retained $9,000 cancellation fee is not refundable.",
    },
    lines: [
      { account: "1000", name: "Operating cash", debit: 51000, credit: 0 },
      {
        account: "6250",
        name: "Cancellation fee expense",
        debit: 9000,
        credit: 0,
      },
      {
        account: "1200",
        name: "Vendor deposits",
        debit: 0,
        credit: 60000,
      },
    ],
    citations: [
      {
        sourceType: "contract",
        sourceId: "northern-cancellation",
        text: "Following the artist cancellation, $51,000 of the $60,000 deposit will be returned. The retained $9,000 cancellation fee is not refundable.",
        score: 0.97,
      },
      apexCitations[2],
    ],
    audit: [
      {
        time: "15:22:01",
        title: "Partial deposit refund matched",
        detail:
          "$51,000 bank receipt matched against the $60,000 artist deposit.",
        kind: "info",
      },
      {
        time: "15:22:03",
        title: "Controller approval requested",
        detail: "$9,000 P&L impact exceeds the materiality threshold.",
        kind: "warning",
      },
      {
        time: "15:27:18",
        title: "Approved by controller",
        detail:
          "Expense the non-recoverable fee under policy 5.1; clear the deposit.",
        kind: "success",
      },
      {
        time: "15:27:19",
        title: "Decision indexed",
        detail:
          "D-0417 saved as a human-reviewed precedent for non-recoverable deposit deductions.",
        kind: "success",
      },
    ],
    rules: [
      ...standardRules.map((rule) =>
        rule.label === "P&L materiality"
          ? {
              ...rule,
              label: "Controller approval",
              detail:
                "$9,000 impact was reviewed and approved by the controller.",
              passed: true,
            }
          : { ...rule },
      ),
    ],
  },
  {
    id: "brightwater-aug",
    title: "The sponsor terms changed. The books did not.",
    vendor: "Brightwater",
    amount: 30000,
    impact: 6666.67,
    date: "Aug 31, 2026",
    period: "August 2026",
    status: "review",
    category: "Contract amendment",
    description:
      "The sponsor amended its $50,000 fixed agreement to $30,000 plus $2 per attendee. The old revenue schedule is still running.",
    reason:
      "Record an illustrative $6,666.67 August catch-up to the amended fixed sponsorship schedule. In this monthly allocation, the old $50,000 fixed fee produced $16,666.67 of August revenue; the amended $30,000 base produces $10,000. Recognize the variable attendance component in September when attendance is known, subject to the $70,000 total cap. The controller must approve this material catch-up.",
    decisionId: "P-0530",
    sourceBank: {
      label: "Amended fixed sponsorship payment",
      amount: 30000,
      date: "Aug 15, 2026",
      reference: "BNK-0815-003",
    },
    sourceLedger: {
      label: "Illustrative August fixed revenue · before catch-up",
      amount: 16666.67,
      account: "4100 · Sponsorship revenue",
    },
    contract: {
      title: "Brightwater Sponsorship Amendment",
      clause: "Amended consideration · August 15",
      text: "The fixed sponsorship fee is amended to $30,000 plus $2 for each verified attendee. Total consideration shall not exceed $70,000. Attendance-based consideration is determined after the September event.",
    },
    lines: [
      {
        account: "4100",
        name: "Sponsorship revenue",
        debit: 6666.67,
        credit: 0,
      },
      {
        account: "2300",
        name: "Deferred sponsorship revenue",
        debit: 0,
        credit: 6666.67,
      },
    ],
    citations: [
      {
        sourceType: "contract",
        sourceId: "brightwater-amendment",
        text: "The fixed sponsorship fee is amended to $30,000 plus $2 for each verified attendee. Total consideration shall not exceed $70,000. Attendance-based consideration is determined after the September event.",
        score: 0.98,
      },
      {
        sourceType: "policy",
        sourceId: "policy-sponsor",
        text: "Update the revenue schedule when enforceable contract terms change. Record the cumulative catch-up in the amendment period and recognize variable consideration when the underlying attendance is established.",
        score: 0.94,
      },
    ],
    audit: [
      {
        time: "13:08:01",
        title: "Amended terms detected",
        detail:
          "The ledger schedule still uses the superseded $50,000 fixed fee.",
        kind: "warning",
      },
      {
        time: "13:08:03",
        title: "Catch-up calculated",
        detail:
          "Illustrative August allocation: reduce fixed revenue from $16,666.67 to $10,000 with a $6,666.67 catch-up.",
        kind: "info",
      },
      {
        time: "13:08:04",
        title: "Controller review required",
        detail:
          "$6,666.67 P&L impact exceeds the threshold. September variable revenue stays pending.",
        kind: "warning",
      },
    ],
    rules: materialRules("$6,666.67 P&L impact exceeds the $5,000 threshold."),
  },
  {
    id: "ironclad-aug",
    title: "Recognized when the work happened.",
    vendor: "Ironclad Site Services",
    amount: 9400,
    impact: 9400,
    date: "Aug 31, 2026",
    period: "August 2026",
    status: "posted",
    category: "Period-end accrual",
    description:
      "Site setup was completed August 30–31. The $9,400 invoice will arrive in September.",
    reason:
      "Policy 7.1 requires the expense in the period the services were received. Accrue $9,400 in August and reverse it when the September invoice is recorded. The controller approved the material accrual.",
    decisionId: "D-0531",
    sourceBank: {
      label: "No cash movement · uninvoiced services",
      amount: 0,
      date: "Aug 31, 2026",
      reference: "ACC-0831-IC",
    },
    sourceLedger: {
      label: "Unrecorded site-setup services",
      amount: 9400,
      account: "6200 · Production expense",
    },
    contract: {
      title: "Ironclad Site Setup Order",
      clause: "Service dates · August 30–31",
      text: ironcladCitations[0].text,
    },
    lines: [
      { account: "6200", name: "Production expense", debit: 9400, credit: 0 },
      { account: "2100", name: "Accrued expenses", debit: 0, credit: 9400 },
    ],
    citations: ironcladCitations,
    audit: [
      {
        time: "16:40:01",
        title: "Uninvoiced services identified",
        detail:
          "Work order confirms site setup was completed before August close.",
        kind: "info",
      },
      {
        time: "16:40:03",
        title: "Accrual proposed",
        detail: "Recognize $9,400 expense in August under policy 7.1.",
        kind: "info",
      },
      {
        time: "16:46:21",
        title: "Approved by controller",
        detail:
          "Material accrual approved with a September invoice reversal instruction.",
        kind: "success",
      },
      {
        time: "16:46:22",
        title: "Posted and indexed",
        detail:
          "D-0531 establishes the reversal treatment for the incoming invoice.",
        kind: "success",
      },
    ],
    rules: standardRules.map((rule) =>
      rule.label === "P&L materiality"
        ? {
            ...rule,
            label: "Controller approval",
            detail: "$9,400 accrual reviewed and approved by the controller.",
            passed: true,
          }
        : { ...rule },
    ),
  },
];

export const controlPolicyRules = [
  {
    clause: "4.3",
    title: "Bank-detail change hold",
    description:
      "Hold payment, verify the payee independently and escalate on the same day. Verification fails closed.",
  },
  {
    clause: "5.1",
    title: "Non-recoverable deductions",
    description:
      "Expense a contractual fee when it becomes certain; clear the original receivable or deposit.",
  },
  {
    clause: "7.1",
    title: "Period recognition",
    description:
      "Recognize services when received. Accrue at close and reverse when the invoice arrives.",
  },
  {
    clause: "8.1",
    title: "Separate proposal from posting",
    description:
      "The staff accountant can propose. Controls or a human reviewer can post. The server rejects the proposing agent.",
  },
  {
    clause: "8.2",
    title: "Apply reviewed precedent",
    description:
      "A matching human-approved precedent may be reused under $5,000 when all other controls pass.",
  },
];

export const permissionGroups: PermissionGroup[] = [
  {
    identity: "agent",
    title: "Staff accountant",
    description:
      "Investigates, retrieves evidence and proposes journal entries.",
    tools: [
      "fetch_bank_transactions",
      "fetch_ledger",
      "fetch_contract",
      "search_precedent",
      "search_policy",
      "search_corrections",
      "match_transaction",
      "flag_break",
      "propose_entry",
      "request_approval",
    ],
    restriction: "Cannot post, approve or change policy.",
  },
  {
    identity: "controls",
    title: "Controls engine",
    description:
      "Applies deterministic policy checks and enforces posting permissions.",
    tools: ["verify_payee", "escalate", "post_entry", "index_decision"],
    restriction: "Cannot propose entries or override the human.",
  },
  {
    identity: "human",
    title: "Controller",
    description:
      "Reviews exceptions, gives correction instructions and signs the close.",
    tools: ["approve", "reject", "sign_period"],
    restriction: "Approves only the items reviewed.",
  },
];
