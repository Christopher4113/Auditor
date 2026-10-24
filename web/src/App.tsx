import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Download,
  FileText,
  History,
  Landmark,
  Layers3,
  LockKeyhole,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import WorkspaceDrawer from "./components/WorkspaceDrawer";
import type { DrawerType } from "./components/WorkspaceDrawer";
import { initialProposals, periods } from "./data/demo";
import { LiveProposals, convex, startClose } from "./data/live";
import type { Period, Proposal, ProposalStatus } from "./data/types";

const money = (value: number, cents = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value);
const statusLabel: Record<ProposalStatus, string> = {
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
const simpleSummary: Record<string, string> = {
  "apex-sep":
    "The missing $2,400 is an agreed inspection fee. Auditor recorded it as an expense and cleared the deposit.",
  "field-flame-sep":
    "The vendor changed their bank details. This $42,000 payment is paused until those details are independently confirmed.",
  "stripe-sep":
    "The $1,420 difference is Stripe processing fees. Auditor used a previously approved decision to reconcile the payout.",
  "ironclad-sep":
    "This cost was already recorded in August. The September invoice was matched without counting the expense twice.",
  "soundwave-jul":
    "The same $18,500 invoice arrived twice. Review the duplicate before the correction is finalized.",
  "northern-lines-jul":
    "The artist’s cancellation fee was recorded as a $9,000 expense after controller approval.",
  "brightwater-aug":
    "The sponsorship terms changed. Review the adjustment so the books match the new agreement.",
  "ironclad-aug":
    "The site setup happened in August. Its $9,400 cost belongs in August, even though the invoice arrived later.",
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
      previous?.focus();
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
  const [period, setPeriod] = useState<Period>("September 2026");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerType | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [source, setSource] = useState<{
    title: string;
    text: string;
    id?: string;
  } | null>(null);
  const [signedPeriods, setSignedPeriods] = useState<string[]>([]);
  const [denialCount, setDenialCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("overview");
  const searchRef = useRef<HTMLInputElement>(null);
  const activityRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const periodProposals = proposals.filter((item) => item.period === period);
  const selected = periodProposals.find((item) => item.id === selectedId);
  const attention = periodProposals.filter(
    (item) => item.status === "review" || item.status === "held",
  );
  const pending = periodProposals.filter(
    (item) => item.status !== "posted",
  ).length;
  const posted = periodProposals.filter(
    (item) => item.status === "posted",
  ).length;
  const signed = signedPeriods.includes(period);
  const visible = periodProposals.filter(
    (item) =>
      (filter === "all" || item.status !== "posted") &&
      `${item.vendor} ${item.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDrawer(null);
        setSelectedId(null);
        window.requestAnimationFrame(() => {
          activityRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          searchRef.current?.focus();
        });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!moreOpen) return;
    const onOutside = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [moreOpen]);
  const openDrawer = (value: DrawerType) => {
    setSelectedId(null);
    setDrawer(value);
    setMoreOpen(false);
  };
  const selectProposal = (id: string) => {
    const item = proposals.find((p) => p.id === id);
    if (item) {
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
  };
  const auditTime = () =>
    new Date().toLocaleTimeString("en-US", { hour12: false });
  const approve = (id: string, note: string) => {
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
  const reject = (id: string, instruction: string) => {
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
    if (signed) {
      notify("This period is locked. Choose an open period first.");
      return;
    }
    const id = `injected-${Date.now()}`;
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
      decisionId: `P-${String(Date.now()).slice(-4)}`,
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
  const exportClose = () => {
    const payload = {
      mode: "local frontend demo",
      entity: "Experts Only Festival NYC",
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
    anchor.download = `auditor-${period.toLowerCase().replace(" ", "-")}-demo.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("Demo close exported with evidence and audit history.");
  };
  const goTo = (view: string) => {
    setActiveNav(view);
    if (view === "activity")
      activityRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <div className="app-shell">
      {convex && <LiveProposals onRows={setProposals} />}
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
          <nav className="top-nav" aria-label="Main navigation">
            <button
              className={activeNav === "overview" ? "active" : ""}
              onClick={() => goTo("overview")}
            >
              Overview
            </button>
            <button
              className={activeNav === "activity" ? "active" : ""}
              onClick={() => goTo("activity")}
            >
              Activity
            </button>
            <button onClick={() => openDrawer("memory")}>
              Past decisions
              <ChevronDown size={13} />
            </button>
          </nav>
          <div className="header-actions">
            <span className="demo-tag">Demo</span>
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
              Experts Only<span className="workspace-slash">/</span>
              <strong>Festival NYC</strong>
            </span>
            <span className="currency-tag">USD</span>
          </div>
          <div className="period-tools">
            <div className="period-select-wrap">
              <CalendarDays size={15} />
              <label className="sr-only" htmlFor="period-select">
                Fiscal period
              </label>
              <select
                id="period-select"
                value={period}
                onChange={(event) => changePeriod(event.target.value as Period)}
              >
                {[...periods].reverse().map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <ChevronDown size={13} />
            </div>
            <div className="more-wrap" ref={moreRef}>
              <button
                className="icon-button more-button"
                aria-label="More workspace tools"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen(!moreOpen)}
              >
                <MoreHorizontal size={20} />
              </button>
              {moreOpen && (
                <div className="tools-menu">
                  <span>WORKSPACE TOOLS</span>
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
                      setMoreOpen(false);
                    }}
                  >
                    <Download size={16} />
                    Export records
                  </button>
                  <div />
                  <button
                    onClick={() => {
                      setProposals(initialProposals);
                      setSignedPeriods([]);
                      setDenialCount(0);
                      changePeriod("September 2026");
                      setMoreOpen(false);
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
              The busywork is handled.
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
                {signed ? "Signed off" : "In progress"}
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
                    strokeDashoffset="16.89"
                  />
                </svg>
                <div>
                  <strong>
                    95<span>%</span>
                  </strong>
                  <small>reconciled</small>
                </div>
              </div>
              <div className="progress-message">
                <h2>Looking good.</h2>
                <p>
                  118 of 124 transactions
                  <br />
                  have been reconciled.
                </p>
                <span>
                  <Check size={12} />
                  Sample close progress
                </span>
              </div>
            </div>
            <div className="progress-card-bottom">
              <div>
                <strong>{posted}</strong>
                <span>entries handled</span>
              </div>
              <div>
                <strong>{attention.length}</strong>
                <span>need your review</span>
              </div>
              <button onClick={() => openDrawer("scoreboard")}>
                Full summary
                <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        </section>
        {attention.length > 0 ? (
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
                  ? `${attention[0].vendor} changed their bank details. We’ve paused the ${money(attention[0].amount)} payment.`
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
                  ? "Your instructions are with Auditor."
                  : "You’re all caught up."}
              </h2>
              <p>
                {pending
                  ? "Returned items still need a correction before sign-off."
                  : "All entries have been handled. Your close summary is ready."}
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
                <div className="activity-tabs">
                  <button
                    className={filter === "all" ? "active" : ""}
                    onClick={() => setFilter("all")}
                  >
                    All activity
                  </button>
                  <button
                    className={filter === "review" ? "active" : ""}
                    onClick={() => setFilter("review")}
                  >
                    Needs attention<span>{pending}</span>
                  </button>
                </div>
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
                      {money(item.amount)}
                    </strong>
                    <Status status={item.status} />
                    <ChevronRight size={16} />
                  </button>
                ))}
                {visible.length === 0 && (
                  <div className="empty-state">
                    <Search size={26} />
                    <h3>Nothing here just yet.</h3>
                    <p>Try a different search, or view all activity.</p>
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
            Sample workspace<span>·</span>Fictitious financial data
          </span>
          <button onClick={() => openDrawer("permissions")}>
            <ShieldCheck size={13} />
            You’re in control
          </button>
        </footer>
      </main>
      {selected && !drawer && !source && (
        <Dialog
          title="Transaction details"
          onClose={() => setSelectedId(null)}
          wide
        >
          <div className="record-detail">
            <div className="record-detail-top">
              <span className={`transaction-icon icon-${selected.status}`}>
                {selected.status === "held" ? (
                  <LockKeyhole size={23} />
                ) : (
                  <ArrowDownLeft size={25} />
                )}
              </span>
              <Status status={selected.status} />
            </div>
            <span className="detail-eyebrow">
              {shortCategory[selected.id] ?? selected.category} ·{" "}
              {selected.date}
            </span>
            <h2>{selected.vendor}</h2>
            <div className="detail-amount">
              {money(selected.amount)}
              <span>USD</span>
            </div>
            <div
              className={`outcome-summary ${selected.status === "held" ? "summary-hold" : ""}`}
            >
              <strong>
                {selected.status === "posted"
                  ? "Taken care of."
                  : selected.status === "held"
                    ? "Paused to protect your payment."
                    : selected.status === "rejected"
                      ? "Changes have been requested."
                      : "This one needs your review."}
              </strong>
              <p>{simpleSummary[selected.id] ?? selected.description}</p>
            </div>
            {selected.status === "held" && (
              <div className="detail-next-step">
                <h3>What happens next?</h3>
                <p>
                  Confirm the new bank details directly with the vendor. The
                  payment stays on hold while verification is unavailable.
                </p>
                <button
                  className="primary-button"
                  onClick={() => openDrawer("approvals")}
                >
                  Review this payment
                  <ArrowRight size={15} />
                </button>
              </div>
            )}
            {selected.status === "review" && (
              <button
                className="primary-button detail-review-button"
                onClick={() => openDrawer("approvals")}
              >
                Review & decide
                <ArrowRight size={15} />
              </button>
            )}
            {selected.revisionNote && (
              <div className="controller-note">
                <strong>Your instruction</strong>
                <p>{selected.revisionNote}</p>
              </div>
            )}
            <div className="detail-more-heading">
              A little more context, if you need it.
            </div>
            <details className="detail-disclosure">
              <summary>
                <FileText size={17} />
                <span>Supporting documents</span>
                <span className="disclosure-count">
                  {selected.citations.length}
                </span>
                <ChevronDown size={16} />
              </summary>
              <div className="disclosure-body">
                <div className="evidence-summary-grid">
                  <div>
                    <Landmark size={16} />
                    <span>Bank record</span>
                    <strong>{money(selected.sourceBank.amount, true)}</strong>
                    <small>{selected.sourceBank.label}</small>
                  </div>
                  <div>
                    <BookOpen size={16} />
                    <span>Book balance</span>
                    <strong>{money(selected.sourceLedger.amount, true)}</strong>
                    <small>{selected.sourceLedger.label}</small>
                  </div>
                </div>
                <div className="source-excerpt">
                  <span>
                    {selected.contract.title} · {selected.contract.clause}
                  </span>
                  <p>“{selected.contract.text}”</p>
                </div>
                {selected.citations.map((citation) => (
                  <div className="source-excerpt" key={citation.sourceId}>
                    <span>
                      {citation.sourceType} · {citation.sourceId}
                    </span>
                    <p>“{citation.text}”</p>
                  </div>
                ))}
              </div>
            </details>
            <details className="detail-disclosure">
              <summary>
                <ShieldCheck size={17} />
                <span>Why this decision?</span>
                <ChevronDown size={16} />
              </summary>
              <div className="disclosure-body">
                <p className="drawer-copy">{selected.reason}</p>
                <div className="simple-rules">
                  {selected.rules.map((rule) => (
                    <div key={rule.label}>
                      {rule.passed ? (
                        <Check size={14} />
                      ) : (
                        <LockKeyhole size={14} />
                      )}
                      <span>{rule.label}</span>
                      <span>{rule.passed ? "Passed" : "Needs review"}</span>
                    </div>
                  ))}
                </div>
                <p className="drawer-label">
                  {money(selected.impact)} effect on profit and loss · $5,000
                  approval threshold
                </p>
              </div>
            </details>
            <details className="detail-disclosure">
              <summary>
                <Layers3 size={17} />
                <span>Accounting entry</span>
                <ChevronDown size={16} />
              </summary>
              <div className="disclosure-body">
                <div className="journal-table-wrap">
                  <table className="journal-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Debit</th>
                        <th>Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.lines.map((line) => (
                        <tr key={line.account}>
                          <td>
                            <small>{line.account}</small>
                            {line.name}
                          </td>
                          <td>{line.debit ? money(line.debit, true) : "—"}</td>
                          <td>
                            {line.credit ? money(line.credit, true) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!selected.lines.length && (
                    <p className="drawer-copy">
                      No entry proposed yet. This item needs investigation.
                    </p>
                  )}
                </div>
              </div>
            </details>
            <details className="detail-disclosure">
              <summary>
                <History size={17} />
                <span>Activity history</span>
                <ChevronDown size={16} />
              </summary>
              <div className="disclosure-body">
                <div className="detail-timeline">
                  {selected.audit.map((event, index) => (
                    <div key={`${event.time}-${index}`}>
                      <span
                        className={
                          event.kind === "error" || event.kind === "warning"
                            ? "timeline-dot warning"
                            : "timeline-dot"
                        }
                      />
                      <div>
                        <strong>{event.title}</strong>
                        <p>{event.detail}</p>
                        <time>{event.time}</time>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
            <p className="detail-footnote">
              Demo record · {selected.decisionId}
            </p>
          </div>
        </Dialog>
      )}
      {drawer && (
        <Dialog
          title={drawerLabels[drawer]}
          onClose={() => setDrawer(null)}
          wide
        >
          <WorkspaceDrawer
            type={drawer}
            proposals={periodProposals}
            period={period}
            onClose={() => setDrawer(null)}
            onSelect={selectProposal}
            onApprove={approve}
            onReject={reject}
            onInject={inject}
            onPrepare={() => {
              if (convex) {
                void startClose(period).then(() => notify(`${period} close started; the rail updates as it runs.`));
              } else notify(`${period} demo close is ready to review.`);
            }}
            onSign={() => {
              if (!pending) {
                setSignedPeriods((previous) => [...previous, period]);
                notify(`${period} signed and locked in this demo.`);
              }
            }}
            onDeny={() => {
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
      {source && (
        <Dialog title={source.title} onClose={() => setSource(null)}>
          <span className="eyebrow">DEMO RECORD</span>
          <h2>{source.id ?? source.title}</h2>
          <p className="drawer-copy">{source.text}</p>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={17} />
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
