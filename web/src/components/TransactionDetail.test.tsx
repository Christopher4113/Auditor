import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Proposal } from "../data/types";
import TransactionDetail from "./TransactionDetail";
import type { TransactionDetailProps } from "./TransactionDetail";

const clauseText =
  'The $2,400 inspection fee is non-refundable. Use account "5160" & clear the deposit.\nRecognize the fee in the current period.';

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: "P-harbor-r2",
    title: "Deposit refund with an inspection fee",
    vendor: "Harbor Staging",
    amount: 16000,
    impact: 2400,
    date: "Sep 25, 2026",
    period: "September 2026",
    status: "review",
    revision: 2,
    category: "Deposit reconciliation",
    description: "The deposit refund is $2,400 less than the original payment.",
    reason: "The supplied contract identifies a non-refundable inspection fee.",
    decisionId: "D-harbor-r2",
    sourceBank: {
      label: "Deposit refund",
      amount: 13600,
      date: "2026-09-25",
      reference: "BANK-HARBOR-REFUND",
      available: true,
    },
    sourceLedger: {
      label: "Vendor deposit balance",
      amount: 16000,
      account: "1200 · Vendor deposits",
      available: true,
      evidenceKind: "balance",
    },
    contract: {
      title: "Harbor Staging agreement",
      clause: "Clause 9.4",
      text: clauseText,
      sourceId: "harbor-9.4",
      available: true,
    },
    lines: [
      { account: "1000", name: "Operating cash", debit: 13600, credit: 0 },
      {
        account: "5160",
        name: "Inspection fee expense",
        debit: 2400,
        credit: 0,
      },
      { account: "1200", name: "Vendor deposits", debit: 0, credit: 16000 },
    ],
    citations: [
      {
        sourceType: "contract",
        sourceId: "harbor-9.4",
        text: clauseText,
        score: 0.91,
      },
    ],
    rules: [],
    audit: [],
    ...overrides,
  };
}

function render(
  proposal = makeProposal(),
  props: Partial<Omit<TransactionDetailProps, "proposal">> = {},
) {
  return renderToStaticMarkup(
    createElement(TransactionDetail, {
      proposal,
      mode: "live",
      loading: false,
      onReview: () => {},
      onSelectRevision: () => {},
      ...props,
    }),
  );
}

describe("TransactionDetail evidence and decision states", () => {
  it("hides stale live details while the latest record is loading", () => {
    const markup = render(makeProposal(), { loading: true });

    expect(markup).toContain("Loading transaction details");
    expect(markup).not.toContain("Harbor Staging");
    expect(markup).not.toContain("The entry is recorded.");
  });

  it("does not infer live bank or ledger evidence from placeholder amounts", () => {
    const proposal = makeProposal();
    const markup = render({
      ...proposal,
      sourceBank: { ...proposal.sourceBank, available: undefined },
      sourceLedger: { ...proposal.sourceLedger, available: undefined },
    });

    expect(markup).toContain("Bank source not provided.");
    expect(markup).toContain("Ledger source not provided.");
    expect(markup).not.toContain("BANK-HARBOR-REFUND");
    expect(markup).not.toContain("Vendor deposit balance");
  });

  it("shows an unavailable amount instead of a fabricated zero for a missing bank source", () => {
    const proposal = makeProposal();
    const missingBank = {
      ...proposal,
      amount: 0,
      sourceBank: { ...proposal.sourceBank, amount: 0, available: false },
    };
    const markup = render(missingBank);

    expect(markup).toContain('class="td-amount">Amount unavailable</div>');
    expect(markup).not.toContain('class="td-amount">$0.00');

    const demo = render(
      {
        ...proposal,
        amount: 0,
        sourceBank: { ...proposal.sourceBank, available: undefined },
      },
      { mode: "demo" },
    );
    expect(demo).toContain('class="td-amount">$0.00');
  });

  it("offers evidence inspection without promising unavailable live approval actions", () => {
    for (const status of ["review", "held", "rejected"] as const) {
      const markup = render(makeProposal({ status }));

      expect(markup).toContain("Review evidence");
      expect(markup).toContain("Live approval actions are unavailable");
      expect(markup).not.toContain("then approve or return");
      expect(markup).not.toContain("Review &amp; decide");
    }

    const demo = render(makeProposal({ status: "review" }), { mode: "demo" });
    expect(demo).toContain("Review &amp; decide");
    expect(demo).toContain("then approve or return");
  });

  it("shows the supplied bank reference, date, and signed amount", () => {
    const proposal = makeProposal();
    const markup = render({
      ...proposal,
      sourceBank: { ...proposal.sourceBank, signedAmount: -13600 },
    });

    expect(markup).toContain("BANK-HARBOR-REFUND");
    expect(markup).toContain("2026-09-25");
    expect(markup).toContain("-$13,600.00");
  });

  it("keeps each exact citation in native disclosures with an internal source button", () => {
    const markup = render();
    const exactQuote = renderToStaticMarkup(
      createElement("blockquote", null, clauseText),
    );

    expect(markup).toContain(exactQuote);
    expect(markup).toContain('class="td-citation"');
    expect(markup).toContain("harbor-9.4");
    expect(markup).toContain("Retrieval score");
    expect(markup).toContain("0.91");
    expect(markup).toContain("View source excerpt");
    expect(markup).not.toMatch(/href=/);
  });

  it("does not substitute an unrelated whole contract for the cited clause", () => {
    const proposal = makeProposal();
    const markup = render({
      ...proposal,
      contract: {
        ...proposal.contract,
        sourceId: "unrelated-contract-clause",
        text: "UNRELATED WHOLE CONTRACT MUST NOT APPEAR",
      },
    });

    expect(markup).toContain("No matching contract clause was supplied.");
    expect(markup).not.toContain("UNRELATED WHOLE CONTRACT MUST NOT APPEAR");
    expect(markup).toContain("harbor-9.4");
  });

  it("does not treat an approved decision as a confirmed posting", () => {
    const markup = render(
      makeProposal({
        status: "approved",
        reviewer: "human",
        outcome: "approved",
        postedEntryId: undefined,
      }),
    );

    expect(markup).toContain("Approved, awaiting posting.");
    expect(markup).toContain("Human controller");
    expect(markup).toContain("Proposed entry");
    expect(markup).not.toContain("Recorded entry");
  });

  it("requires a ledger entry ID even when a live status and decision say posted", () => {
    const unconfirmed = render(
      makeProposal({ status: "posted", outcome: "posted" }),
    );
    const confirmed = render(
      makeProposal({
        status: "posted",
        outcome: "posted",
        postedEntryId: "JE-harbor-confirmed",
      }),
    );

    expect(unconfirmed).toContain("Waiting for the ledger entry.");
    expect(unconfirmed).toContain("Cleared for posting");
    expect(unconfirmed).not.toContain("The entry is recorded.");
    expect(confirmed).toContain("The entry is recorded.");
    expect(confirmed).toContain("JE-harbor-confirmed");
    expect(confirmed).toContain("Recorded entry");
  });

  it("keeps a payment held when its suspense journal has been posted", () => {
    const markup = render(
      makeProposal({
        status: "held",
        postedEntryId: "JE-payment-suspense",
        lines: [
          {
            account: "1400",
            name: "Payments on hold",
            debit: 42000,
            credit: 0,
          },
          { account: "1000", name: "Operating cash", debit: 0, credit: 42000 },
        ],
      }),
    );

    expect(markup).toContain("This payment stays on hold.");
    expect(markup).toContain("Confirm the vendor");
    expect(markup).toContain("Recorded entry");
    expect(markup).toContain("Payments on hold");
    expect(markup).not.toContain("No further action is needed");
  });

  it("renders each selected revision's own journal and citations", () => {
    const originalText = "Original evidence for the earlier proposal.";
    const original = makeProposal({
      id: "P-harbor-r1",
      revision: 1,
      lines: [
        {
          account: "1250",
          name: "Original proposed receivable",
          debit: 2400,
          credit: 0,
        },
        { account: "1200", name: "Vendor deposits", debit: 0, credit: 2400 },
      ],
      citations: [
        {
          sourceType: "policy",
          sourceId: "original-policy",
          text: originalText,
          score: 0.82,
        },
      ],
    });
    const latest = makeProposal();
    const revisions = [original, latest];
    const latestMarkup = render(latest, { revisions });
    const originalMarkup = render(original, { revisions });

    expect(latestMarkup).toContain("Revision 2 · latest");
    expect(latestMarkup).toContain("Inspection fee expense");
    expect(latestMarkup).not.toContain("Original proposed receivable");
    expect(originalMarkup).toContain("Original proposed receivable");
    expect(originalMarkup).toContain(originalText);
    expect(originalMarkup).not.toContain("Inspection fee expense");
    expect(originalMarkup).not.toContain("harbor-9.4");
    expect(originalMarkup).toMatch(
      /<option[^>]*value="P-harbor-r1"[^>]*selected=""/,
    );
  });

  it("keeps discarded first reads separate from instructions and journal lines", () => {
    const firstRead = "Discarded hypothesis: retain a $2,400 receivable.";
    const markup = render(
      makeProposal({
        firstRead,
        revisionNote: "First read discarded: retain a receivable",
      }),
    );
    const journal = markup.match(
      /<table class="td-journal">[\s\S]*?<\/table>/,
    )?.[0];

    expect(markup).toContain(firstRead);
    expect(markup).toContain("This is not a posted accounting entry.");
    expect(markup).not.toContain("Review instruction");
    expect(journal).toContain("Inspection fee expense");
    expect(journal).not.toContain(firstRead);
    expect(markup).toContain("Debits and credits balance.");
    expect(
      render(makeProposal({ revisionNote: "First read discarded: old idea" })),
    ).not.toContain("Review instruction");
    expect(
      render(
        makeProposal({
          firstRead,
          instruction: "Confirm the bank details first.",
        }),
      ),
    ).toContain("Review instruction");
  });

  it("renders actual audit timestamps, actors, and actions without inventing them", () => {
    const markup = render(
      makeProposal({
        audit: [
          {
            at: 1792810800000,
            time: "",
            actor: "controls",
            action: "post_entry",
            title: "Entry posted",
            detail: "JE-harbor-confirmed",
            kind: "success",
          },
        ],
      }),
    );

    expect(markup).toContain("2026-10-24T03:00:00.000Z");
    expect(markup).toContain("controls");
    expect(markup).toContain("post_entry");
    expect(markup).toContain("JE-harbor-confirmed");
  });

  it("provides retry and explicit empty-evidence states", () => {
    const failed = render(makeProposal(), {
      error: "Connection unavailable",
      onRetry: () => {},
    });
    const empty = render(
      makeProposal({ lines: [], citations: [], audit: [], rules: [] }),
    );

    expect(failed).toContain("Connection unavailable");
    expect(failed).toContain("Try again");
    expect(failed).not.toContain("Harbor Staging");
    expect(empty).toContain("No journal entry has been proposed yet.");
    expect(empty).toContain("No citations have been supplied");
    expect(empty).toContain("No audit events were returned");
    expect(empty).toContain("No control checks were returned.");
  });
});
