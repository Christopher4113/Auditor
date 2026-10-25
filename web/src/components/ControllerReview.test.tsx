// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Proposal } from "../data/types";
import type { WireCloseSummary } from "../data/contracts";
import type { LiveSnapshot } from "../data/live";
import { initialProposals } from "../data/demo";
import ControllerReview from "./ControllerReview";
import type { ControllerReviewProps } from "./ControllerReview";
import WorkspaceDrawer from "./WorkspaceDrawer";
import type { WorkspaceDrawerProps } from "./WorkspaceDrawer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    ...initialProposals[0],
    id: "P-review-r1",
    vendor: "Meridian Staging",
    status: "review",
    provenance: "live",
    backendStatus: "escalated",
    backendId: "proposal-internal",
    breakBackendId: "break-internal",
    revision: 1,
    ...overrides,
  };
}
function reviewProps(
  overrides: Partial<ControllerReviewProps> = {},
): ControllerReviewProps {
  return {
    proposal: proposal(),
    signed: false,
    onSelect: vi.fn(),
    onApprove: vi.fn(async () => {}),
    onReject: vi.fn(async () => {}),
    ...overrides,
  };
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
function summary(overrides: Partial<WireCloseSummary> = {}): WireCloseSummary {
  return {
    status: "open",
    signedAt: null,
    prepared: { at: 1792810800000, unmatched: 0, openBreaks: 0 },
    entriesPosted: 17,
    openItems: 4,
    awaitingController: 2,
    trialBalance: [
      { code: "1000", name: "Cash", debit: 240000, credit: 0, balance: 240000 },
      {
        code: "1200",
        name: "Vendor deposits",
        debit: 0,
        credit: 240000,
        balance: -240000,
      },
    ],
    debits: 240000,
    credits: 240000,
    ...overrides,
  };
}
function snapshot(overrides: Partial<LiveSnapshot> = {}): LiveSnapshot {
  return {
    proposals: [],
    periods: [],
    score: {
      transactions: 120,
      closedByCode: 106,
      proposals: 1,
      posted: 1,
      escalated: 0,
      underReview: 0,
      plantedBreaks: 6,
      caught: 0,
      correct: 0,
    },
    summary: summary(),
    controlResults: [],
    feedComplete: true,
    workflow: null,
    audit: [],
    loading: false,
    connected: true,
    period: "September 2026",
    ...overrides,
  };
}
function drawerProps(
  overrides: Partial<WorkspaceDrawerProps> = {},
): WorkspaceDrawerProps {
  const posted = proposal({
    status: "posted",
    backendStatus: "posted",
    postedEntryId: "JE-confirmed",
  });
  return {
    type: "scoreboard",
    mode: "live",
    proposals: [posted],
    period: "September 2026",
    liveSnapshot: snapshot({ proposals: [posted] }),
    onClose: vi.fn(),
    onSelect: vi.fn(),
    onApprove: vi.fn(async () => {}),
    onReject: vi.fn(async () => {}),
    onPrepare: vi.fn(async () => {}),
    onSign: vi.fn(async () => {}),
    onDeny: vi.fn(async () => {}),
    onInject: vi.fn(async () => {}),
    signed: false,
    denialCount: 0,
    canSign: true,
    ...overrides,
  };
}
const disabled = (element: HTMLElement) =>
  (element as HTMLButtonElement).disabled;

describe("ControllerReview server decisions", () => {
  it("awaits approval, prevents duplicate clicks, and waits for the authoritative record", async () => {
    const user = userEvent.setup();
    const request = deferred();
    const onApprove = vi.fn(() => request.promise);
    render(<ControllerReview {...reviewProps({ onApprove })} />);
    await user.type(screen.getByRole("textbox"), "Reviewed the source clause.");
    await user.dblClick(screen.getByRole("button", { name: "Approve" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith(
      "P-review-r1",
      "Reviewed the source clause.",
    );
    expect(disabled(screen.getByRole("button", { name: "Approving…" }))).toBe(
      true,
    );
    expect(
      disabled(screen.getByRole("button", { name: "Return for revision" })),
    ).toBe(true);
    request.resolve();
    await screen.findByText("Waiting for the updated record.");
    expect(disabled(screen.getByRole("button", { name: "Approve" }))).toBe(
      true,
    );
    expect(screen.queryByText("Posted")).toBeNull();
  });

  it("preserves the approval note after a server refusal and allows retry", async () => {
    const user = userEvent.setup();
    const onApprove = vi
      .fn()
      .mockRejectedValueOnce(new Error("The period is locked."))
      .mockResolvedValueOnce(undefined);
    render(<ControllerReview {...reviewProps({ onApprove })} />);
    const note = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.type(note, "Please retain this review context.");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The period is locked.",
    );
    expect(note.value).toBe("Please retain this review context.");
    expect(disabled(screen.getByRole("button", { name: "Approve" }))).toBe(
      false,
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(2));
    expect(note.value).toBe("Please retain this review context.");
  });

  it("requires a return instruction and sends only the user's instruction", async () => {
    const user = userEvent.setup();
    const onReject = vi.fn(async () => {});
    render(<ControllerReview {...reviewProps({ onReject })} />);
    await user.click(
      screen.getByRole("button", { name: "Return for revision" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Add an instruction",
    );
    expect(onReject).not.toHaveBeenCalled();
    await user.type(
      screen.getByRole("textbox"),
      "  Use the August service date.  ",
    );
    await user.click(
      screen.getByRole("button", { name: "Return for revision" }),
    );
    expect(onReject).toHaveBeenCalledWith(
      "P-review-r1",
      "Use the August service date.",
    );
  });

  it("keeps the return instruction when the server refuses it", async () => {
    const user = userEvent.setup();
    const onReject = vi
      .fn()
      .mockRejectedValue(new Error("This version was superseded."));
    render(<ControllerReview {...reviewProps({ onReject })} />);
    const note = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.type(note, "Retain the invoice and revise the offset.");
    await user.click(
      screen.getByRole("button", { name: "Return for revision" }),
    );
    await screen.findByRole("alert");
    expect(note.value).toBe("Retain the invoice and revise the offset.");
    expect(
      disabled(screen.getByRole("button", { name: "Return for revision" })),
    ).toBe(false);
  });

  it.each([
    ["missing citations", { citations: [] }],
    [
      "an unbalanced entry",
      { lines: [{ account: "1000", name: "Cash", debit: 100, credit: 0 }] },
    ],
    ["a held payment", { status: "held" as const }],
  ])("blocks approval for %s", async (_label, changes) => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    render(
      <ControllerReview
        {...reviewProps({ proposal: proposal(changes), onApprove })}
      />,
    );
    const approve = screen.getByRole("button", {
      name:
        "status" in changes && changes.status === "held"
          ? "Payment held"
          : "Investigation required",
    });
    expect(disabled(approve)).toBe(true);
    await user.click(approve);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("allows an instruction to keep an escalated hold, but cannot mutate a posted suspense proposal", async () => {
    const user = userEvent.setup();
    const onReject = vi.fn(async () => {});
    const props = reviewProps({
      proposal: proposal({ status: "held" }),
      onReject,
    });
    const view = render(<ControllerReview {...props} />);
    await user.type(
      screen.getByRole("textbox"),
      "Keep held until independently confirmed.",
    );
    await user.click(
      screen.getByRole("button", { name: "Keep hold with instruction" }),
    );
    expect(onReject).toHaveBeenCalledTimes(1);
    view.unmount();
    render(
      <ControllerReview
        {...reviewProps({
          proposal: proposal({
            status: "held",
            backendStatus: "posted",
            postedEntryId: "JE-hold",
          }),
        })}
      />,
    );
    expect(disabled(screen.getByRole("button", { name: "Payment held" }))).toBe(
      true,
    );
    expect(
      disabled(
        screen.getByRole("button", { name: "Keep hold with instruction" }),
      ),
    ).toBe(true);
  });

  it("locks both decision actions when signed or temporarily disabled", () => {
    const view = render(
      <ControllerReview {...reviewProps({ signed: true })} />,
    );
    expect(disabled(screen.getByRole("button", { name: "Approve" }))).toBe(
      true,
    );
    expect(
      disabled(screen.getByRole("button", { name: "Return for revision" })),
    ).toBe(true);
    expect(screen.getByText("This period is signed and locked.")).toBeTruthy();
    view.rerender(<ControllerReview {...reviewProps({ disabled: true })} />);
    expect(disabled(screen.getByRole("button", { name: "Approve" }))).toBe(
      true,
    );
    expect(
      screen.getByText(/Wait for the workspace to reconnect/),
    ).toBeTruthy();
  });
});

describe("Live drawer capabilities and close summary", () => {
  it("awaits sign-off without inventing a signed state or allowing duplicates", async () => {
    const user = userEvent.setup();
    const request = deferred();
    const onSign = vi.fn(() => request.promise);
    render(<WorkspaceDrawer {...drawerProps({ onSign })} />);
    await user.dblClick(screen.getByRole("button", { name: "Sign period" }));
    expect(onSign).toHaveBeenCalledTimes(1);
    expect(disabled(screen.getByRole("button", { name: "Signing…" }))).toBe(
      true,
    );
    request.resolve();
    await screen.findByRole("button", { name: "Awaiting server update" });
    expect(screen.queryByText("Period signed")).toBeNull();
  });

  it("keeps signing available after a refusal so the user can retry", async () => {
    const user = userEvent.setup();
    const onSign = vi
      .fn()
      .mockRejectedValue(new Error("The close is still running."));
    render(<WorkspaceDrawer {...drawerProps({ onSign })} />);
    await user.click(screen.getByRole("button", { name: "Sign period" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "The close is still running.",
    );
    expect(disabled(screen.getByRole("button", { name: "Sign period" }))).toBe(
      false,
    );
  });

  it("does not use historical server counts as the current signing guard", () => {
    const old = proposal({
      id: "P-review-r1",
      status: "rejected",
      backendStatus: "rejected",
      revision: 1,
    });
    const latest = proposal({
      id: "P-review-r2",
      status: "posted",
      backendStatus: "posted",
      postedEntryId: "JE-latest",
      revision: 2,
    });
    render(
      <WorkspaceDrawer
        {...drawerProps({ proposals: [old, latest], canSign: true })}
      />,
    );
    expect(disabled(screen.getByRole("button", { name: "Sign period" }))).toBe(
      false,
    );
    expect(screen.queryByText(/1 current item remains unresolved/)).toBeNull();
  });

  it("blocks signing without an authoritative summary, while busy, while running, and when unbalanced", () => {
    const view = render(
      <WorkspaceDrawer
        {...drawerProps({ liveSnapshot: snapshot({ summary: undefined }) })}
      />,
    );
    expect(disabled(screen.getByRole("button", { name: "Sign period" }))).toBe(
      true,
    );
    view.rerender(
      <WorkspaceDrawer {...drawerProps({ actionsDisabled: true })} />,
    );
    expect(disabled(screen.getByRole("button", { name: "Sign period" }))).toBe(
      true,
    );
    expect(
      disabled(screen.getByRole("button", { name: "Prepare close" })),
    ).toBe(true);
    view.rerender(
      <WorkspaceDrawer
        {...drawerProps({
          liveSnapshot: snapshot({
            workflow: { type: "inProgress", running: 1 },
          }),
        })}
      />,
    );
    expect(disabled(screen.getByRole("button", { name: "Sign period" }))).toBe(
      true,
    );
    view.rerender(
      <WorkspaceDrawer
        {...drawerProps({
          liveSnapshot: snapshot({ summary: summary({ credits: 230000 }) }),
        })}
      />,
    );
    expect(disabled(screen.getByRole("button", { name: "Sign period" }))).toBe(
      true,
    );
  });

  it("cannot sign an empty unprepared period or an incomplete feed", () => {
    const emptySummary = summary({
      entriesPosted: 0,
      openItems: 0,
      awaitingController: 0,
      debits: 0,
      credits: 0,
      trialBalance: [],
      prepared: null,
    });
    const props = drawerProps({
      proposals: [],
      canSign: undefined,
      liveSnapshot: snapshot({
        proposals: [],
        summary: emptySummary,
        workflow: null,
      }),
    });
    const view = render(<WorkspaceDrawer {...props} />);
    expect(disabled(screen.getByRole("button", { name: "Sign period" }))).toBe(
      true,
    );
    view.rerender(
      <WorkspaceDrawer
        {...props}
        liveSnapshot={snapshot({
          proposals: [],
          summary: emptySummary,
          workflow: { type: "completed" },
        })}
      />,
    );
    expect(disabled(screen.getByRole("button", { name: "Sign period" }))).toBe(
      false,
    );
    view.rerender(
      <WorkspaceDrawer
        {...props}
        canSign={true}
        liveSnapshot={snapshot({
          proposals: [],
          summary: emptySummary,
          workflow: { type: "completed" },
          feedComplete: false,
        })}
      />,
    );
    expect(disabled(screen.getByRole("button", { name: "Sign period" }))).toBe(
      true,
    );
  });

  it("renders server trial balance cents as dollars and keeps estimates separate", async () => {
    const user = userEvent.setup();
    render(<WorkspaceDrawer {...drawerProps()} />);
    await user.click(screen.getByText("View trial balance and server totals"));
    const table = screen.getByRole("table", { name: "Server trial balance" });
    expect(within(table).getAllByText("$2,400.00").length).toBeGreaterThan(0);
    expect(within(table).queryByText("$240,000.00")).toBeNull();
    expect(
      screen.getByText(/Measured time savings, precision, recall/),
    ).toBeTruthy();
    expect(
      screen.queryByText(/\$69,500 illustrative dollars protected/),
    ).toBeNull();
  });

  it("counts only supplied control checks and leaves the unconnected live posting test disabled", async () => {
    const user = userEvent.setup();
    const onDeny = vi.fn();
    render(
      <WorkspaceDrawer
        {...drawerProps({
          type: "permissions",
          onDeny,
          controlResults: [
            {
              proposalId: "P1",
              rule: "balance",
              kind: "preventive",
              passed: true,
            },
            {
              proposalId: "P2",
              rule: "balance",
              kind: "preventive",
              passed: false,
            },
            {
              proposalId: "P2",
              rule: "correction",
              kind: "detective",
              passed: true,
            },
          ],
        })}
      />,
    );
    await user.click(screen.getByText("View recorded control checks"));
    const rows = within(
      screen.getByRole("table", { name: "Loaded control check counts" }),
    ).getAllByRole("row");
    expect(rows[1].textContent).toBe("balancePreventive21");
    expect(rows[2].textContent).toBe("correctionDetective10");
    await user.click(screen.getByText("Advanced: test posting access"));
    const test = screen.getByRole("button", {
      name: "Server test unavailable",
    });
    expect(disabled(test)).toBe(true);
    await user.click(test);
    expect(onDeny).not.toHaveBeenCalled();
  });

  it("submits a live scenario through the wired handler", async () => {
    const user = userEvent.setup();
    const onInject = vi.fn(() => Promise.resolve());
    render(<WorkspaceDrawer {...drawerProps({ type: "inject", onInject })} />);
    await user.type(
      screen.getByRole("textbox", { name: "Counterparty" }),
      "Sample vendor",
    );
    await user.type(screen.getByRole("spinbutton"), "1234.56");
    await user.type(
      screen.getByRole("textbox", { name: "Transaction context" }),
      "A fictional unmatched transaction.",
    );
    const submit = screen.getByRole("button", { name: "Add scenario" });
    expect(disabled(submit)).toBe(false);
    await user.click(submit);
    expect(onInject).toHaveBeenCalledWith(
      "bank_transaction",
      "Sample vendor",
      1234.56,
      "A fictional unmatched transaction.",
    );
    expect(
      await screen.findByText("Submitted. Watch the activity rail."),
    ).toBeTruthy();
  });

  it("awaits a demo injection and acknowledges it only after its callback completes", async () => {
    const user = userEvent.setup();
    const request = deferred();
    const onInject = vi.fn(() => request.promise);
    render(
      <WorkspaceDrawer
        {...drawerProps({ type: "inject", mode: "demo", onInject })}
      />,
    );
    await user.type(
      screen.getByRole("textbox", { name: "Counterparty" }),
      "Sample vendor",
    );
    await user.type(screen.getByRole("spinbutton"), "1234.56");
    await user.type(
      screen.getByRole("textbox", { name: "Transaction context" }),
      "A fictional unmatched transaction.",
    );
    await user.click(screen.getByRole("button", { name: "Add scenario" }));
    expect(onInject).toHaveBeenCalledWith(
      "bank_transaction",
      "Sample vendor",
      1234.56,
      "A fictional unmatched transaction.",
    );
    expect(disabled(screen.getByRole("button", { name: "Adding…" }))).toBe(
      true,
    );
    expect(screen.queryByText("Added to the demo review queue.")).toBeNull();
    request.resolve();
    await screen.findByText("Added to the demo review queue.");
  });
});
