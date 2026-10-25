// @vitest-environment jsdom
import { useEffect, useSyncExternalStore } from "react";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { initialProposals } from "./data/demo";
import type { LiveSnapshot } from "./data/live";
import type { Proposal } from "./data/types";
import { controllerError } from "./data/controller";

const transport = vi.hoisted(() => ({
  snapshot: null as LiveSnapshot | null,
  listeners: new Set<() => void>(),
  approve: vi.fn(),
  reject: vi.fn(),
  signPeriod: vi.fn(),
  startClose: vi.fn(),
  checkApproval: vi.fn(),
}));
vi.mock("./data/live", () => ({
  convex: {},
  ENTITY: "eo-festival-nyc",
  configurationError: false,
  approve: transport.approve,
  reject: transport.reject,
  signPeriod: transport.signPeriod,
  startClose: transport.startClose,
  checkApproval: transport.checkApproval,
  reason: (error: unknown) => controllerError(error),
  LiveSelection: () => null,
  LiveWorkspace: ({ onData }: { onData: (value: LiveSnapshot) => void }) => {
    const value = useSyncExternalStore(
      (listener) => {
        transport.listeners.add(listener);
        return () => {
          transport.listeners.delete(listener);
        };
      },
      () => transport.snapshot,
    );
    useEffect(() => {
      if (value) onData(value);
    }, [value, onData]);
    return null;
  },
}));

const proposal = (overrides: Partial<Proposal> = {}): Proposal => ({
  ...initialProposals[0],
  id: "P-rehearsal-r1",
  backendId: "internal-proposal-1",
  breakBackendId: "internal-break",
  entity: "eo-festival-nyc",
  provenance: "live",
  revision: 1,
  vendor: "Rehearsal vendor",
  status: "review",
  backendStatus: "escalated",
  rules: [],
  audit: [],
  ...overrides,
});
const snapshot = (rows = [proposal()]): LiveSnapshot => ({
  proposals: rows,
  period: "September 2026",
  connected: true,
  loading: false,
  feedComplete: true,
  controlResults: [],
  audit: [],
  workflow: { type: "completed" },
  periods: [
    {
      _id: "internal-period",
      _creationTime: 1,
      entity: "eo-festival-nyc",
      period: "2026-09",
      start: "2026-09-01",
      end: "2026-09-30",
      status: "open",
    },
  ],
  score: {
    transactions: 2,
    closedByCode: 1,
    proposals: rows.length,
    posted: 0,
    escalated: 1,
    underReview: 0,
    plantedBreaks: 1,
    caught: 1,
    correct: 1,
  },
  summary: {
    status: "open",
    signedAt: null,
    prepared: { at: 1, unmatched: 1, openBreaks: 1 },
    entriesPosted: 1,
    openItems: 0,
    awaitingController: 0,
    trialBalance: [],
    debits: 1600000,
    credits: 1600000,
  },
});
const publish = async (value: LiveSnapshot) => {
  await act(async () => {
    transport.snapshot = value;
    transport.listeners.forEach((listener) => listener());
  });
};
const openInbox = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Review inbox" }));
  return screen.getByRole("dialog", { name: "Review items" });
};
const openSummary = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: /Full summary/ }));
  return screen.getByRole("dialog", { name: "Close summary" });
};

beforeEach(() => {
  vi.clearAllMocks();
  transport.snapshot = snapshot();
  transport.approve.mockResolvedValue({
    decisionId: "decision",
    entryId: "entry",
  });
  transport.checkApproval.mockResolvedValue(undefined);
  transport.reject.mockResolvedValue({
    decisionId: "decision",
    correctionId: "correction",
  });
  transport.signPeriod.mockResolvedValue({
    entriesPosted: 1,
    openItemsCarried: 0,
    debits: 1600000,
    credits: 1600000,
  });
});
afterEach(() => {
  cleanup();
  transport.listeners.clear();
});

describe("live controller rehearsal from the workspace", () => {
  it("sends the external proposal code and note, then shows a success toast without inventing a posted record", async () => {
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openInbox(user);
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Note or return instruction",
      }),
      "  Supported by the contract.  ",
    );
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(transport.approve).toHaveBeenCalledWith(
        "P-rehearsal-r1",
        "Supported by the contract.",
      ),
    );
    expect(
      screen.getByText(
        "Approved and posted. Your controller decision is recorded.",
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("Waiting for the updated record."),
    ).toBeTruthy();
    expect(transport.snapshot?.proposals[0].status).toBe("review");
  });

  it("shows a real refusal in the toast and keeps the controller's instruction editable", async () => {
    transport.reject.mockRejectedValue(
      new Error(
        "[Request ID: abc] Server Error\nUncaught Error: 3.0: period 2026-09 is signed and locked\n    at handler (human.ts:1)",
      ),
    );
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openInbox(user);
    const input = within(dialog).getByRole("textbox", {
      name: "Note or return instruction",
    }) as HTMLTextAreaElement;
    await user.type(input, "Expense the non-refundable fee.");
    await user.click(
      within(dialog).getByRole("button", { name: "Return for revision" }),
    );
    await waitFor(() =>
      expect(transport.reject).toHaveBeenCalledWith(
        "P-rehearsal-r1",
        "Expense the non-refundable fee.",
      ),
    );
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("alert")
          .some(
            (item) =>
              item.className.includes("toast-error") &&
              item.textContent?.includes("signed and locked"),
          ),
      ).toBe(true),
    );
    expect(input.value).toBe("Expense the non-refundable fee.");
    expect(input.disabled).toBe(false);
    expect(dialog.textContent).not.toContain("Request ID");
    expect(
      within(dialog)
        .getByRole("button", { name: "Return for revision" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("keeps Sign disabled until the returned proposal's actual revision posts, then signs the selected period", async () => {
    const user = userEvent.setup();
    render(<App />);
    const inbox = await openInbox(user);
    await user.type(
      within(inbox).getByRole("textbox"),
      "Use the cancellation fee expense account.",
    );
    await user.click(
      within(inbox).getByRole("button", { name: "Return for revision" }),
    );
    await waitFor(() => expect(transport.reject).toHaveBeenCalledTimes(1));
    const rejected = proposal({
      status: "rejected",
      backendStatus: "rejected",
    });
    await publish(snapshot([rejected]));
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    const summary = await openSummary(user);
    expect(
      within(summary)
        .getByRole("button", { name: "Sign period" })
        .hasAttribute("disabled"),
    ).toBe(true);
    const revision = proposal({
      id: "P-rehearsal-r2",
      backendId: "internal-proposal-2",
      revisionOf: rejected.backendId,
      revision: 2,
      status: "pending",
      backendStatus: "under_review",
    });
    await publish(snapshot([rejected, revision]));
    expect(
      within(summary)
        .getByRole("button", { name: "Sign period" })
        .hasAttribute("disabled"),
    ).toBe(true);
    const posted = {
      ...revision,
      status: "posted" as const,
      backendStatus: "posted" as const,
      postedEntryId: "JE-rehearsal",
    };
    const completed = snapshot([rejected, posted]);
    completed.summary!.openItems = 1; // Historical server count must not re-block a resolved chain.
    completed.summary!.awaitingController = 1;
    await publish(completed);
    const sign = within(summary).getByRole("button", { name: "Sign period" });
    await waitFor(() => expect(sign.hasAttribute("disabled")).toBe(false));
    await user.click(sign);
    await waitFor(() =>
      expect(transport.signPeriod).toHaveBeenCalledWith("September 2026"),
    );
    expect(screen.getByText("September 2026 signed and locked.")).toBeTruthy();
    expect(
      within(summary).getByRole("button", { name: "Awaiting server update" }),
    ).toBeTruthy();
    expect(transport.snapshot?.periods[0].status).toBe("open");
    await publish({
      ...completed,
      periods: completed.periods.map((item) => ({ ...item, status: "signed" })),
      summary: { ...completed.summary!, status: "signed" },
    });
    expect(
      within(summary)
        .getByRole("button", { name: "Signed" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("locks duplicate actions and period changes until the server responds", async () => {
    let resolve: (value: unknown) => void = () => {};
    transport.approve.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openInbox(user);
    const button = within(dialog).getByRole("button", { name: "Approve" });
    await user.click(button);
    await user.click(button);
    expect(transport.approve).toHaveBeenCalledTimes(1);
    expect(
      (
        screen.getByRole("combobox", {
          name: "Fiscal period",
        }) as HTMLSelectElement
      ).disabled,
    ).toBe(true);
    expect(
      within(dialog)
        .getByRole("button", { name: "Return for revision" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await act(async () => {
      resolve({ decisionId: "decision", entryId: "entry" });
    });
  });

  it("refuses approval when fresh source checks find a new payment hold", async () => {
    transport.checkApproval.mockRejectedValue(
      new Error("This payment is now on hold. Review its latest bank details."),
    );
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openInbox(user);
    await user.type(
      within(dialog).getByRole("textbox"),
      "Checked the original proposal.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toContain(
        "now on hold",
      ),
    );
    expect(transport.checkApproval).toHaveBeenCalledWith(
      transport.snapshot?.proposals[0],
    );
    expect(transport.approve).not.toHaveBeenCalled();
    expect(
      (within(dialog).getByRole("textbox") as HTMLTextAreaElement).value,
    ).toBe("Checked the original proposal.");
  });

  it("does not sign a fresh empty period, a disconnected feed, or an unbalanced summary", async () => {
    const empty = snapshot([]);
    empty.workflow = null;
    empty.summary!.prepared = null;
    transport.snapshot = empty;
    const user = userEvent.setup();
    render(<App />);
    const dialog = await openSummary(user);
    const sign = () =>
      within(dialog).getByRole("button", { name: "Sign period" });
    expect(sign().hasAttribute("disabled")).toBe(true);
    await publish({ ...empty, workflow: { type: "completed" } });
    expect(sign().hasAttribute("disabled")).toBe(false);
    await publish({
      ...empty,
      workflow: { type: "completed" },
      connected: false,
    });
    expect(sign().hasAttribute("disabled")).toBe(true);
    await publish({
      ...empty,
      workflow: { type: "completed" },
      summary: { ...empty.summary!, credits: 1 },
    });
    expect(sign().hasAttribute("disabled")).toBe(true);
    expect(transport.signPeriod).not.toHaveBeenCalled();
  });
});
