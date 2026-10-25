import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleAlert,
  Download,
  History,
  Layers3,
  LockKeyhole,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import WorkspaceDrawer from "./components/WorkspaceDrawer";
import SponsorRibbon from "./components/SponsorRibbon";
import ThemeToggle from "./components/ThemeToggle";
import LiquidSegmentedControl from "./components/LiquidSegmentedControl";
import PeriodPicker from "./components/PeriodPicker";
import type { DrawerType } from "./components/WorkspaceDrawer";
import { initialProposals, periods } from "./data/demo";
import {
  LiveWorkspace,
  ENTITY,
  LiveSelection,
  convex,
  startClose,
  configurationError,
  checkApproval,
  approve as approveLive,
  reject as rejectLive,
  signPeriod as signLive,
  reason,
} from "./data/live";
import { injectScenario, attemptAgentPost, askAuditor } from "./data/live";
import type { LiveSnapshot, LiveDetails } from "./data/live";
import {
  latestProposals,
  revisionsFor,
  needsHumanReview,
  proposalProgress,
  unresolvedProposals,
  canSignPeriod,
  canApproveProposal,
  canRejectProposal,
} from "./data/selectors";
import { toPeriodKey } from "./data/adapters";
import QueryBoundary from "./components/QueryBoundary";
import TransactionDetail from "./components/TransactionDetail";
import type { Period, Proposal, ProposalStatus } from "./data/types";

const money = (value: number, cents = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value);
const statusLabel: Record<ProposalStatus, string> = {
  pending: "Checking",
  approved: "Approved",
  posted: "Handled",
  review: "Needs review",
  held: "On hold",
  rejected: "Changes requested",
};
const drawerLabels: Record<DrawerType, string> = {
  approvals: "Review items",
  scoreboard: "Close summary",
  permissions: "How approvals work",
  inject: "Add a test scenario",
  ask: "Ask Auditor",
  memory: "Past decisions",
  activity: "Activity history",
};
const shortCategory: Record<string, string> = {
  "apex-sep": "Deposit refund",
  "field-flame-sep": "Bank details changed",
  "stripe-sep": "Weekly payout",
  "ironclad-sep": "Invoice matched",
  "soundwave-jul": "Possible duplicate",
  "northern-lines-jul": "Deposit refund",
  "brightwater-aug": "Updated agreement",
  "ironclad-aug": "August service costs",
};
const auditTime = () =>
  new Date().toLocaleTimeString("en-US", { hour12: false });
const demoTimestamp = () => Date.now();
function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M6 25 14 7h5l8 18h-6l-4.5-11L12 25H6Z" fill="currentColor" />
        <path d="M12 20h10v4H12z" fill="currentColor" />
      </svg>
    </span>
  );
}
function Status({ status }: { status: ProposalStatus }) {
  return (
    <span className={`badge status-${status}`}>
      {status === "posted" ? (
        <Check size={12} />
      ) : (
        <span className="status-dot" />
      )}
      {statusLabel[status]}
    </span>
  );
}
function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab" || !panel.current) return;
      const nodes = Array.from(
        panel.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
        ),
      ).filter((node) => node.getClientRects().length > 0);
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panel.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handleKey);
      if (previous?.isConnected) previous.focus();
      else document.querySelector<HTMLButtonElement>(".more-button")?.focus();
    };
  }, []);
  return (
    <div
      className="dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`dialog-panel ${wide ? "drawer-panel" : "source-modal"}`}
      >
        <header className="dialog-header">
          <span>
            <Mark />
            {title}
          </span>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="dialog-content">{children}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [proposals, setProposals] = useState<Proposal[]>(initialProposals);
  const [mode, setMode] = useState<"demo" | "live">(convex ? "live" : "demo");
  const [liveSnapshot, setLiveSnapshot] = useState<LiveSnapshot | null>(null);
  const [liveDetails, setLiveDetails] = useState<LiveDetails | null>(null);
  const [liveFailure, setLiveFailure] = useState(false);
  const [detailFailure, setDetailFailure] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [detailRetryKey, setDetailRetryKey] = useState(0);
  const [revisionFallback, setRevisionFallback] = useState<Proposal | null>(
    null,
  );
  const live = mode === "live";
  const [period, setPeriod] = useState<Period>("September 2026");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerType | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [toastKind, setToastKind] = useState<"success" | "error">("success");
  const [controllerBusy, setControllerBusy] = useState(false);
  const controllerBusyRef = useRef(false);
  const [signedPeriods, setSignedPeriods] = useState<string[]>([]);
  const [denialCount, setDenialCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toolsMenuSpace, setToolsMenuSpace] = useState({
    height: 360,
    above: false,
  });
  const [activeNav, setActiveNav] = useState("overview");
  const searchRef = useRef<HTMLInputElement>(null);
  const activityRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const dataRows = live ? (liveSnapshot?.proposals ?? []) : proposals;
  const latestRows = latestProposals(dataRows);
  const periodProposals = latestRows.filter((item) => item.period === period);
  const selectedBase =
    dataRows.find((item) => item.id === selectedId) ?? revisionFallback;
  const selected =
    live && liveDetails && selectedBase && liveDetails.id === selectedBase.id
      ? liveDetails.proposal
      : selectedBase;
  const attention = periodProposals.filter(needsHumanReview);
  const progress = proposalProgress(periodProposals);
  const pending = unresolvedProposals(dataRows, { period }).length;
  const posted = progress.posted;
  const livePeriod = liveSnapshot?.periods.find(
    (item) => item.period === toPeriodKey(period),
  );
  const signed = live
    ? livePeriod?.status === "signed"
    : signedPeriods.includes(period);
  const liveLoading =
    live &&
    (!liveSnapshot || liveSnapshot.loading || liveSnapshot.period !== period) &&
    !liveFailure;
  const score =
    liveSnapshot?.period === period ? liveSnapshot.score : undefined;
  const workflow =
    liveSnapshot?.period === period ? liveSnapshot.workflow : undefined;
  const summary =
    liveSnapshot?.period === period ? liveSnapshot.summary : undefined;
  const balancedSummary = Boolean(
    summary &&
      Number.isSafeInteger(summary.debits) &&
      Number.isSafeInteger(summary.credits) &&
      summary.debits === summary.credits,
  );
  const liveActionsDisabled =
    live &&
    (liveLoading ||
      liveFailure ||
      !liveSnapshot?.connected ||
      liveSnapshot.period !== period ||
      !liveSnapshot.feedComplete);
  const canSign = canSignPeriod(dataRows, {
    period,
    entity: live ? ENTITY : undefined,
    status: live ? livePeriod?.status : signed ? "signed" : "open",
    loading:
      liveLoading ||
      liveFailure ||
      controllerBusy ||
      liveActionsDisabled ||
      (live && !balancedSummary),
    closeRunning:
      live && (workflow?.type === "inProgress" || Boolean(workflow?.running)),
    feedComplete: live ? liveSnapshot?.feedComplete === true : true,
    allowEmpty:
      live &&
      workflow?.type === "completed" &&
      summary?.status === "open" &&
      summary.openItems === 0 &&
      summary.awaitingController === 0,
  });
  const percent = live ? progress.percent : 95;
  const detailLoading =
    live &&
    (!liveDetails ||
      liveDetails.id !== selectedBase?.id ||
      liveDetails.loading) &&
    !detailFailure;
  const versions =
    selected?.versions?.map(
      (version): Proposal => ({
        ...selected,
        ...version,
        decisionId: "",
        decisionReason: undefined,
        reviewer: undefined,
        postedEntryId: undefined,
        outcome: undefined,
        instruction: undefined,
        revisionNote: undefined,
        audit: [],
        rules: [],
        backendStatus:
          version.status === "pending"
            ? "under_review"
            : version.status === "review" || version.status === "held"
              ? "escalated"
              : version.status,
        detailsState: { sources: "loading", decision: "loading" },
      }),
    ) ?? (selected ? revisionsFor(dataRows, selected) : []);
  const visible = periodProposals.filter(
    (item) =>
      (filter === "all" || item.status !== "posted") &&
      `${item.vendor} ${item.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const notify = (message: string, kind: "success" | "error" = "success") => {
    setToastKind(kind);
    setToast(message);
  };
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  // The close runs for a minute or two. Say so while it runs, and say when it is done.
  const closeRunning = live && workflow?.type === "inProgress";
  const wasRunning = useRef(false);
  useEffect(() => {
    if (closeRunning) wasRunning.current = true;
    else if (wasRunning.current && workflow?.type === "completed") {
      wasRunning.current = false;
      notify(`${period} close finished · ${progress.posted} handled · ${progress.pending} need you`);
    }
  }, [closeRunning, workflow?.type, period, progress.posted, progress.pending]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDrawer(null);
        setSelectedId(null);
        setMoreOpen(false);
        window.requestAnimationFrame(() => {
          activityRef.current?.scrollIntoView({
            behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
              .matches
              ? "auto"
              : "smooth",
            block: "center",
          });
          searchRef.current?.focus();
        });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useLayoutEffect(() => {
    if (!moreOpen) return;
    const viewport = window.visualViewport;
    const measureSpace = () => {
      const bounds = moreRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const below = bottom - bounds.bottom - 20;
      const above = bounds.top - top - 20;
      const useAbove = below < 220 && above > below;
      const height = Math.max(88, Math.floor(useAbove ? above : below));
      setToolsMenuSpace((current) =>
        current.height === height && current.above === useAbove
          ? current
          : { height, above: useAbove },
      );
    };
    measureSpace();
    window.addEventListener("resize", measureSpace);
    window.addEventListener("scroll", measureSpace, true);
    viewport?.addEventListener("resize", measureSpace);
    viewport?.addEventListener("scroll", measureSpace);
    return () => {
      window.removeEventListener("resize", measureSpace);
      window.removeEventListener("scroll", measureSpace, true);
      viewport?.removeEventListener("resize", measureSpace);
      viewport?.removeEventListener("scroll", measureSpace);
    };
  }, [moreOpen]);
  useEffect(() => {
    if (!moreOpen) return;
    const onOutside = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMoreOpen(false);
        moreRef.current
          ?.querySelector<HTMLButtonElement>(".more-button")
          ?.focus();
      }
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [moreOpen]);
  const closeTools = () => {
    moreRef.current
      ?.querySelector<HTMLButtonElement>(".more-button")
      ?.focus({ preventScroll: true });
    setMoreOpen(false);
  };
  const openDrawer = (value: DrawerType) => {
    if (moreOpen) closeTools();
    setSelectedId(null);
    setDrawer(value);
    setMoreOpen(false);
  };
  const selectProposal = (id: string) => {
    const item = dataRows.find((p) => p.id === id);
    if (item) {
      setDetailFailure(false);
      setLiveDetails(null);
      setRevisionFallback(null);
      setPeriod(item.period);
      setSelectedId(id);
      setDrawer(null);
    }
  };
  const changePeriod = (value: Period) => {
    setPeriod(value);
    setSelectedId(null);
    setSearch("");
    setFilter("all");
    setLiveFailure(false);
    setDetailFailure(false);
    setLiveDetails(null);
    setRevisionFallback(null);
  };
  const approveDemo = (id: string, note: string) => {
    const item = proposals.find((p) => p.id === id);
    if (
      !item ||
      signedPeriods.includes(item.period) ||
      item.status === "held" ||
      !item.lines.length ||
      !item.citations.length ||
      Math.abs(
        item.lines.reduce((n, line) => n + line.debit - line.credit, 0),
      ) > 0.005
    )
      return;
    setProposals((previous) =>
      previous.map((p) =>
        p.id === id
          ? {
              ...p,
              status: "posted",
              reason: `${p.reason}\n\nController note: ${note}`,
              audit: [
                ...p.audit,
                {
                  time: auditTime(),
                  title: "Approved by controller · demo",
                  detail: note,
                  kind: "success",
                },
              ],
            }
          : p,
      ),
    );
    notify(
      `${item.vendor} approved. Controller decision recorded in the demo audit trail.`,
    );
  };
  const rejectDemo = (id: string, instruction: string) => {
    const item = proposals.find((p) => p.id === id);
    if (!item || signedPeriods.includes(item.period)) return;
    setProposals((previous) =>
      previous.map((p) =>
        p.id === id
          ? {
              ...p,
              status: p.status === "held" ? "held" : "rejected",
              revisionNote: instruction,
              audit: [
                ...p.audit,
                {
                  time: auditTime(),
                  title:
                    p.status === "held"
                      ? "Controller kept payment hold · demo"
                      : "Returned by controller · demo",
                  detail: instruction,
                  kind: "warning",
                },
              ],
            }
          : p,
      ),
    );
    notify(
      item.status === "held"
        ? "Hold maintained. Your instruction is in the audit trail."
        : "Entry returned. Your correction has been recorded.",
    );
  };
  const inject = (
    kind: string,
    vendor: string,
    amount: number,
    note: string,
  ) => {
    if (live) {
      return controllerAction(
        () => injectScenario(kind, vendor, amount, note, period),
        kind === "vendor_bank_change"
          ? `${vendor} bank change recorded: payments held, payee verification requested, escalated.`
          : kind === "contract_amendment"
            ? `${vendor} contract amended and indexed; the ${period} close is re-running.`
            : `${vendor} transaction injected; the Workflow picks it up within seconds.`,
      );
    }
    if (signed) {
      notify("This period is locked. Choose an open period first.");
      return;
    }
    const injectedAt = demoTimestamp();
    const id = `injected-${injectedAt}`;
    const held = kind === "vendor_bank_change";
    const item: Proposal = {
      id,
      vendor,
      title: held
        ? "Bank change received. Payment held."
        : "A new scenario for your review.",
      amount,
      impact: kind === "contract_amendment" ? amount : 0,
      date: `${period.split(" ")[0].slice(0, 3)} 28, 2026`,
      period,
      status: held ? "held" : "review",
      category: held
        ? "Bank detail change"
        : kind === "contract_amendment"
          ? "Contract amendment"
          : "Bank transaction",
      description: note,
      reason: held
        ? "The local demo applies a preventive hold for a bank-detail change. Independent payee verification and a controller decision are required before any release."
        : "This newly injected demo scenario requires controller review. Evidence and accounting treatment have not been investigated by a live agent.",
      decisionId: `P-${String(injectedAt).slice(-4)}`,
      sourceBank: {
        label: vendor,
        amount,
        date: "Injected just now",
        reference: "LOCAL-DEMO",
      },
      sourceLedger: {
        label: "Unreconciled · pending investigation",
        amount: 0,
        account: "Unassigned",
      },
      contract: {
        title: "Scenario context",
        clause: "User-provided demo input",
        text: note,
      },
      lines: [],
      citations: [],
      rules: [
        {
          label: "Controller review",
          detail:
            "Injected scenario requires investigation and supporting evidence.",
          passed: false,
        },
      ],
      audit: [
        {
          time: auditTime(),
          title: held ? "Bank change held · demo" : "Scenario injected · demo",
          detail: note,
          kind: "warning",
        },
      ],
    };
    setProposals((previous) => [item, ...previous]);
    setSelectedId(id);
    setFilter("all");
    setSearch("");
    notify(
      `${vendor} added to the ${held ? "held payments" : "review"} queue.`,
    );
  };
  const controllerAction = async (
    action: () => Promise<unknown>,
    success: string,
  ) => {
    if (controllerBusyRef.current) {
      const message = "Another decision is being saved. Please wait.";
      notify(message, "error");
      throw new Error(message);
    }
    controllerBusyRef.current = true;
    setControllerBusy(true);
    try {
      if (liveActionsDisabled)
        throw new Error(
          "Wait for the live workspace to reconnect before making a decision.",
        );
      await action();
      notify(success);
    } catch (error) {
      const message = reason(error);
      notify(message, "error");
      throw new Error(message);
    } finally {
      controllerBusyRef.current = false;
      setControllerBusy(false);
    }
  };
  const handleApprove = async (id: string, note: string) => {
    if (!live) {
      approveDemo(id, note);
      return;
    }
    await controllerAction(async () => {
      const item = dataRows.find((row) => row.id === id);
      if (!item || !canApproveProposal(item, { signed, rows: dataRows })) {
        throw new Error(
          "This proposal is not ready for approval. Check its sources, entry, and current status.",
        );
      }
      await checkApproval(item);
      await approveLive(id, note.trim());
    }, "Approved and posted. Your controller decision is recorded.");
  };
  const handleReject = async (id: string, instruction: string) => {
    if (!live) {
      rejectDemo(id, instruction);
      return;
    }
    await controllerAction(async () => {
      const item = dataRows.find((row) => row.id === id);
      if (!instruction.trim())
        throw new Error("Add an instruction before returning this proposal.");
      if (!item || !canRejectProposal(item, { signed, rows: dataRows })) {
        throw new Error(
          "This proposal is no longer awaiting a controller decision.",
        );
      }
      await rejectLive(id, instruction.trim());
    }, "Returned with your instruction. The agent will propose a revision.");
  };
  const handleSign = async () => {
    if (!live) {
      if (canSign) {
        setSignedPeriods((previous) => [...previous, period]);
        notify(`${period} signed and locked in this demo.`);
      }
      return;
    }
    await controllerAction(async () => {
      if (!canSign)
        throw new Error(
          "Resolve the current proposals and wait for the close to finish before signing.",
        );
      await signLive(period);
    }, `${period} signed and locked.`);
  };
  const exportClose = () => {
    const payload = {
      mode,
      entity: "Coachella Valley Music & Arts Festival",
      period,
      signed,
      proposals: periodProposals,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `auditor-${period.toLowerCase().replace(" ", "-")}-${mode}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify(`${live ? "Live" : "Demo"} close records exported.`);
  };
  const goTo = (view: string) => {
    setActiveNav(view);
    const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches
      ? "auto"
      : "smooth";
    if (view === "activity")
      activityRef.current?.scrollIntoView({
        behavior,
        block: "start",
      });
    else window.scrollTo({ top: 0, behavior });
  };
  return (
    <div className="app-shell">
      {live && convex && (
        <QueryBoundary
          key={`workspace-${period}-${retryKey}`}
          onError={() => setLiveFailure(true)}
        >
          <LiveWorkspace period={period} onData={setLiveSnapshot} />
        </QueryBoundary>
      )}
      {live && selectedBase?.backendId && selectedBase.breakBackendId && (
        <QueryBoundary
          key={`details-${selectedBase.backendId}-${detailRetryKey}`}
          onError={() => setDetailFailure(true)}
        >
          <LiveSelection proposal={selectedBase} onData={setLiveDetails} />
        </QueryBoundary>
      )}
      <header className="site-header">
        <div className="header-inner">
          <a
            className="brand"
            href="#"
            onClick={(event) => {
              event.preventDefault();
              goTo("overview");
            }}
          >
            <Mark />
            <span>
              auditor<span className="brand-dot">.</span>
            </span>
          </a>
          <LiquidSegmentedControl
            as="nav"
            className="top-nav"
            ariaLabel="Main navigation"
            value={drawer === "memory" ? "memory" : activeNav}
            onValueChange={(value) =>
              value === "memory" ? openDrawer("memory") : goTo(value)
            }
            options={[
              { value: "overview", label: "Overview" },
              { value: "activity", label: "Activity" },
              {
                value: "memory",
                label: (
                  <>
                    Past decisions
                    <ChevronDown size={13} />
                  </>
                ),
              },
            ]}
          />
          <div className="header-actions">
            <span className={`demo-tag ${live ? "live-mode-tag" : ""}`}>
              {live ? "Live data" : "Demo"}
            </span>
            <ThemeToggle />
            <button className="ask-header" onClick={() => openDrawer("ask")}>
              <Sparkles size={15} />
              Ask Auditor
            </button>
            <span className="user-avatar" title="Christopher · Controller">
              CL
            </span>
          </div>
        </div>
      </header>
      <main className="page-content">
        <div className="workspace-toolbar">
          <div className="workspace-name">
            <span className="entity-icon">
              <Layers3 size={17} />
            </span>
            <span>
              Goldenvoice<span className="workspace-slash">/</span>
              <strong>Coachella</strong>
            </span>
            <span className="currency-tag">USD</span>
          </div>
          <div className="period-tools">
            <PeriodPicker
              value={period}
              options={[...periods].reverse()}
              disabled={controllerBusy}
              onValueChange={(value) => changePeriod(value as Period)}
            />
            <div
              className="more-wrap"
              ref={moreRef}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  setMoreOpen(false);
              }}
            >
              <button
                className="icon-button more-button"
                aria-label="More workspace tools"
                aria-expanded={moreOpen}
                aria-controls="workspace-tools-menu"
                onClick={() => setMoreOpen(!moreOpen)}
              >
                <MoreHorizontal size={20} />
              </button>
              {moreOpen && (
                <div
                  className="tools-menu"
                  id="workspace-tools-menu"
                  data-side={toolsMenuSpace.above ? "top" : "bottom"}
                  style={
                    {
                      "--tools-menu-max-height": `${toolsMenuSpace.height}px`,
                    } as CSSProperties
                  }
                >
                  <span>WORKSPACE TOOLS</span>
                  <button
                    disabled={!convex || controllerBusy}
                    onClick={() => {
                      setMode(live ? "demo" : "live");
                      setSelectedId(null);
                      setRevisionFallback(null);
                      setLiveDetails(null);
                      setLiveSnapshot(null);
                      setLiveFailure(false);
                      setDetailFailure(false);
                      closeTools();
                    }}
                  >
                    <Layers3 size={16} />
                    {live ? "Open demo workspace" : "Open live workspace"}
                  </button>
                  <button onClick={() => openDrawer("scoreboard")}>
                    <CircleCheck size={16} />
                    Close summary
                  </button>
                  <button onClick={() => openDrawer("permissions")}>
                    <ShieldCheck size={16} />
                    How approvals work
                  </button>
                  <button onClick={() => openDrawer("activity")}>
                    <History size={16} />
                    Activity history
                  </button>
                  <button onClick={() => openDrawer("inject")}>
                    <Layers3 size={16} />
                    Add a test scenario
                  </button>
                  <button
                    onClick={() => {
                      exportClose();
                      closeTools();
                    }}
                  >
                    <Download size={16} />
                    Export records
                  </button>
                  <div />
                  <button
                    disabled={live || controllerBusy}
                    onClick={() => {
                      setProposals(initialProposals);
                      setSignedPeriods([]);
                      setDenialCount(0);
                      changePeriod("September 2026");
                      closeTools();
                      notify("Demo workspace reset.");
                    }}
                  >
                    Reset demo
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {configurationError && (
          <div className="connection-banner warning-notice" role="status">
            The live connection URL is invalid. You are viewing demo records.
          </div>
        )}
        {live && (
          <div
            className={`connection-banner ${liveFailure ? "connection-error" : ""}`}
            role="status"
          >
            <span
              className={`connection-dot ${liveSnapshot?.connected && !liveFailure ? "connected" : ""}`}
            />
            <span>
              {liveFailure
                ? "We couldn’t load the live workspace. Retry the connection or open the demo."
                : liveLoading
                  ? "Loading the live close…"
                  : !liveSnapshot?.connected
                    ? "Reconnecting. Showing the last received records."
                    : closeRunning
                      ? "Close running · the agent and the rules are working through the breaks · items appear below as they are decided"
                      : "Connected to live data · controller decisions are recorded"}
            </span>
            {liveFailure && (
              <button
                className="text-button"
                onClick={() => {
                  setLiveFailure(false);
                  setLiveSnapshot(null);
                  setRetryKey((value) => value + 1);
                }}
              >
                Retry
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        )}
        <section className="hero-section">
          <div className="hero-copy">
            <span className="eyebrow">
              <span />A LITTLE LESS MONTH-END STRESS
            </span>
            <h1>
              Your {period.split(" ")[0]} close,
              <br />
              <span>made simple.</span>
            </h1>
            <p>
              {live
                ? "The records, sources, and decisions are connected."
                : "The busywork is handled."}
              <br className="desktop-break" />
              You just take care of the decisions that matter.
            </p>
            <div className="hero-actions">
              <button
                className="primary-button"
                onClick={() =>
                  attention.length
                    ? selectProposal(attention[0].id)
                    : openDrawer("scoreboard")
                }
              >
                {attention.length ? "See what needs you" : "View close summary"}
                <ArrowRight size={16} />
              </button>
              <button
                className="hero-text-button"
                onClick={() => goTo("activity")}
              >
                View all activity
                <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="hero-reassurance">
              <ShieldCheck size={14} />
              <span>Auditor handles the routine. You stay in control.</span>
            </div>
          </div>
          <div className="progress-card">
            <div className="progress-card-top">
              <span>
                <span className="progress-dot" />
                YOUR MONTH AT A GLANCE
              </span>
              <span className="progress-state">
                {signed
                  ? "Signed off"
                  : live && workflow?.type === "inProgress"
                    ? "Closing"
                    : "In progress"}
              </span>
            </div>
            <div className="progress-body">
              <div className="progress-ring">
                <svg viewBox="0 0 136 136" aria-hidden="true">
                  <circle className="ring-track" cx="68" cy="68" r="56" />
                  <circle
                    className="ring-fill"
                    cx="68"
                    cy="68"
                    r="56"
                    strokeDasharray="351.86"
                    strokeDashoffset={String(
                      351.86 * (1 - (percent ?? 0) / 100),
                    )}
                  />
                </svg>
                <div>
                  <strong>
                    {liveLoading || liveFailure || percent === null
                      ? "—"
                      : percent}
                    <span>
                      {liveLoading || liveFailure || percent === null
                        ? ""
                        : "%"}
                    </span>
                  </strong>
                  <small>{live ? "entries handled" : "reconciled"}</small>
                </div>
              </div>
              <div className="progress-message">
                <h2>
                  {liveLoading
                    ? "Loading…"
                    : liveFailure
                      ? "Connection paused."
                      : live
                        ? signed
                          ? "Signed and locked."
                          : attention.length
                            ? "Ready for review."
                            : progress.total
                              ? "Following the close."
                              : "Ready when you are."
                        : "Looking good."}
                </h2>
                <p>
                  {live
                    ? liveLoading || liveFailure
                      ? "Waiting for the latest entries."
                      : `${posted} of ${progress.total} latest entries handled.`
                    : "118 of 124 transactions"}
                  <br />
                  {live
                    ? score
                      ? `${score.transactions} bank transactions in this period.`
                      : "Waiting for period totals."
                    : "have been reconciled."}
                </p>
                <span>
                  <Check size={12} />
                  {live
                    ? "Actual loaded proposal progress"
                    : "Sample close progress"}
                </span>
              </div>
            </div>
            <div className="progress-card-bottom">
              <div>
                <strong>{liveLoading || liveFailure ? "—" : posted}</strong>
                <span>entries handled</span>
              </div>
              <div>
                <strong>
                  {liveLoading || liveFailure ? "—" : attention.length}
                </strong>
                <span>need your review</span>
              </div>
              <button onClick={() => openDrawer("scoreboard")}>
                Full summary
                <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        </section>
        {liveLoading || liveFailure ? (
          <section
            className="attention-banner loading-banner"
            aria-live="polite"
          >
            <span className="attention-symbol">
              <Layers3 size={21} />
            </span>
            <div>
              <h2>
                {liveFailure
                  ? "Your live records couldn’t be loaded."
                  : "Getting the full picture."}
              </h2>
              <p>
                {liveFailure
                  ? "Use Retry above to reconnect, or switch to the demo from the workspace menu."
                  : "Review items and progress will appear when the server responds."}
              </p>
            </div>
          </section>
        ) : attention.length > 0 ? (
          <section className="attention-banner">
            <span className="attention-symbol">
              <LockKeyhole size={21} />
            </span>
            <div>
              <h2>
                {attention.length === 1
                  ? "One thing needs a closer look."
                  : `${attention.length} items need a closer look.`}
              </h2>
              <p>
                {attention[0].status === "held"
                  ? `${attention[0].vendor} has a payment on hold. Check the evidence before taking the next step.`
                  : `${attention[0].vendor} needs your approval before we can finish.`}
              </p>
            </div>
            <button
              className="attention-button"
              onClick={() => selectProposal(attention[0].id)}
            >
              Take a look
              <ArrowRight size={15} />
            </button>
          </section>
        ) : (
          <section className="attention-banner all-clear">
            <span className="attention-symbol">
              <Check size={21} />
            </span>
            <div>
              <h2>
                {pending
                  ? "This close is still in progress."
                  : progress.total
                    ? "You’re all caught up."
                    : "Ready to start this close."}
              </h2>
              <p>
                {pending
                  ? live
                    ? "Follow the entries below as proposals and decisions arrive."
                    : "Returned items still need a correction before sign-off."
                  : progress.total
                    ? "All loaded entries have been handled. Your close summary is ready."
                    : "There are no proposals for this period yet."}
              </p>
            </div>
            <button
              className="attention-button"
              onClick={() => openDrawer("scoreboard")}
            >
              View summary
              <ArrowRight size={15} />
            </button>
          </section>
        )}
        <div className="main-grid">
          <section className="activity-section" ref={activityRef}>
            <div className="section-heading">
              <div>
                <h2>
                  A clear view of your activity
                  <span>{periodProposals.length}</span>
                </h2>
                <p>Everything in one place. Open an item when you need more.</p>
              </div>
              <button
                className="icon-button"
                aria-label="View activity history"
                onClick={() => openDrawer("activity")}
              >
                <History size={18} />
              </button>
            </div>
            <div className="activity-card">
              <div className="activity-toolbar">
                <LiquidSegmentedControl
                  className="activity-tabs"
                  ariaLabel="Activity filters"
                  value={filter}
                  onValueChange={setFilter}
                  options={[
                    { value: "all", label: "All activity" },
                    {
                      value: "review",
                      label: (
                        <>
                          Needs attention
                          <span className="glass-segments__count">
                            {pending}
                          </span>
                        </>
                      ),
                    },
                  ]}
                />
                <div className="search-box">
                  <Search size={15} />
                  <input
                    ref={searchRef}
                    aria-label="Search transactions"
                    placeholder="Find something…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  {search && (
                    <button
                      aria-label="Clear search"
                      onClick={() => setSearch("")}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div className="transaction-labels">
                <span>TRANSACTION</span>
                <span>AMOUNT</span>
                <span>STATUS</span>
                <span />
              </div>
              <div className="transaction-list">
                {visible.map((item, index) => (
                  <button
                    key={item.id}
                    className="transaction-row"
                    style={{ animationDelay: `${index * 45}ms` }}
                    onClick={() => selectProposal(item.id)}
                  >
                    <span className={`transaction-icon icon-${item.status}`}>
                      {item.status === "held" ? (
                        <LockKeyhole size={19} />
                      ) : item.vendor.includes("Stripe") ? (
                        <span className="stripe-letter">s</span>
                      ) : (
                        <ArrowDownLeft size={20} />
                      )}
                    </span>
                    <span className="transaction-name">
                      <strong>{item.vendor}</strong>
                      <small>
                        {shortCategory[item.id] ?? item.category}
                        <span>·</span>
                        {item.date.split(",")[0]}
                      </small>
                    </span>
                    <strong className="transaction-amount">
                      {item.sourceBank.available === false
                        ? "Amount unavailable"
                        : money(item.amount)}
                    </strong>
                    <Status status={item.status} />
                    <ChevronRight size={16} />
                  </button>
                ))}
                {visible.length === 0 && (
                  <div className="empty-state">
                    <Search size={26} />
                    <h3>
                      {liveLoading
                        ? "Loading entries…"
                        : liveFailure
                          ? "Live data is unavailable."
                          : "Nothing here just yet."}
                    </h3>
                    <p>
                      {liveLoading
                        ? "Fetching the latest proposals for this period."
                        : live && !search && filter === "all"
                          ? "Prepare the close from the summary, or select another period."
                          : "Try a different search, or view all activity."}
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        setSearch("");
                        setFilter("all");
                      }}
                    >
                      Clear filters
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="activity-card-footer">
                <span>
                  <CircleCheck size={13} />
                  {posted} handled · {attention.length} awaiting your review
                </span>
                <button onClick={() => openDrawer("approvals")}>
                  Review inbox
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </section>
          <aside className="help-column">
            <section className="assistant-card">
              <div className="assistant-top">
                <span className="assistant-icon">
                  <Sparkles size={21} />
                </span>
                <span>MEET YOUR SECOND SET OF EYES</span>
              </div>
              <h2>
                Questions?
                <br />
                You’re in good company.
              </h2>
              <p>
                Ask about any decision.
                <br />
                Auditor will show you the why.
              </p>
              <button
                className="assistant-question"
                onClick={() => openDrawer("ask")}
              >
                <span>“Why is this payment on hold?”</span>
                <ArrowUpRight size={14} />
              </button>
              <button className="navy-button" onClick={() => openDrawer("ask")}>
                <AudioLines size={17} />
                Ask Auditor
                <ArrowRight size={15} />
              </button>
            </section>
            <button
              className="memory-card"
              onClick={() => openDrawer("memory")}
            >
              <span className="memory-icon">
                <BookOpen size={18} />
              </span>
              <span>
                <strong>Good decisions stick.</strong>
                <small>Past approvals make the next close easier.</small>
                <span>
                  Explore past decisions
                  <ArrowUpRight size={13} />
                </span>
              </span>
            </button>
          </aside>
        </div>
        <SponsorRibbon />
        <footer className="workspace-footer">
          <a
            href="#"
            onClick={(event) => {
              event.preventDefault();
              goTo("overview");
            }}
          >
            <Mark />
            <span>Less busywork. More clarity.</span>
          </a>
          <span>
            {live ? "Live workspace" : "Sample workspace"}
            <span>·</span>Fictitious financial data
          </span>
          <button onClick={() => openDrawer("permissions")}>
            <ShieldCheck size={13} />
            You’re in control
          </button>
        </footer>
      </main>
      {selected && !drawer && (
        <Dialog
          title="Transaction details"
          onClose={() => {
            setSelectedId(null);
            setRevisionFallback(null);
            setLiveDetails(null);
          }}
          wide
        >
          <TransactionDetail
            proposal={selected}
            mode={mode}
            loading={detailLoading}
            error={
              detailFailure
                ? "We couldn’t load the supporting records. Please retry."
                : null
            }
            revisions={versions}
            onReview={(id) => {
              selectProposal(id);
              openDrawer("approvals");
            }}
            onSelectRevision={(id) => {
              const version = versions.find((item) => item.id === id);
              if (version) {
                setSelectedId(id);
                setRevisionFallback(version);
                setLiveDetails(null);
                setDetailFailure(false);
              }
            }}
            onRetry={() => {
              setDetailFailure(false);
              setLiveDetails(null);
              setDetailRetryKey((value) => value + 1);
            }}
          />
        </Dialog>
      )}
      {drawer && (
        <Dialog
          title={drawerLabels[drawer]}
          onClose={() => setDrawer(null)}
          wide
        >
          <WorkspaceDrawer
            key={`${mode}-${period}-${drawer}`}
            type={drawer}
            proposals={periodProposals}
            period={period}
            onClose={() => setDrawer(null)}
            onSelect={selectProposal}
            onApprove={handleApprove}
            onReject={handleReject}
            onInject={inject}
            mode={mode}
            liveSnapshot={liveSnapshot}
            loading={liveLoading}
            error={
              liveFailure
                ? "We couldn’t load the live workspace. Please retry the connection."
                : undefined
            }
            onPrepare={async () => {
              if (live) {
                await controllerAction(
                  () => startClose(period),
                  `${period} close started. New entries will appear as it runs.`,
                );
              } else notify(`${period} demo close is ready to review.`);
            }}
            onSign={handleSign}
            canSign={canSign}
            actionsDisabled={controllerBusy || liveActionsDisabled}
            controlResults={
              liveSnapshot?.period === period
                ? liveSnapshot.controlResults
                : undefined
            }
            canDeny={
              live
                ? periodProposals.some((p) => p.status === "posted")
                : undefined
            }
            onAsk={
              live
                ? (question) => askAuditor(question, period, selected?.id)
                : undefined
            }
            onDeny={() => {
              if (live) {
                const target =
                  (selected?.status === "posted" ? selected : undefined) ??
                  periodProposals.find((p) => p.status === "posted");
                if (!target) {
                  notify(
                    "No posted entry in this period to test against.",
                    "error",
                  );
                  return;
                }
                return controllerAction(async () => {
                  const r = await attemptAgentPost(target.id);
                  if (r.ok)
                    throw new Error(
                      "The agent was allowed to post. That is a bug.",
                    );
                  setDenialCount((count) => count + 1);
                  return r;
                }, "Refused: 8.1, the agent proposed this entry and may not post it. The denial is in the audit log.");
              }
              setDenialCount((count) => count + 1);
              const target = periodProposals[0];
              setProposals((previous) =>
                previous.map((item) =>
                  item.id === target?.id
                    ? {
                        ...item,
                        audit: [
                          ...item.audit,
                          {
                            time: auditTime(),
                            title: "Agent post denied · simulated",
                            detail:
                              "The agent cannot approve its own work. No entry was posted.",
                            kind: "error",
                          },
                        ],
                      }
                    : item,
                ),
              );
              notify("Test complete: posting was blocked.");
            }}
            signed={signed}
            denialCount={denialCount}
          />
        </Dialog>
      )}
      {toast && (
        <div
          className={`toast ${toastKind === "error" ? "toast-error" : ""}`}
          role={toastKind === "error" ? "alert" : "status"}
        >
          {toastKind === "error" ? (
            <CircleAlert size={17} />
          ) : (
            <CircleCheck size={17} />
          )}
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
