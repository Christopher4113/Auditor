import { useMemo, useRef } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  FileText,
  History,
  Landmark,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type { Citation, Proposal } from "../data/types";
import "./TransactionDetail.css";

export interface TransactionDetailProps {
  proposal: Proposal;
  mode: "demo" | "live";
  loading: boolean;
  error?: string | null;
  revisions?: Proposal[];
  onReview: (id: string) => void;
  onSelectRevision: (id: string) => void;
  onRetry?: () => void;
}

// Optional fields let the detail view stay truthful while data arrives in stages.
type DetailRecord = Proposal & {
  revision?: number;
  firstRead?: string;
  reviewer?: "controls" | "human" | "agent";
  outcome?: string;
  postedEntryId?: string;
  instruction?: string;
  decisionReason?: string;
  sourceBank: Proposal["sourceBank"] & { available?: boolean };
  sourceLedger: Proposal["sourceLedger"] & { available?: boolean };
  contract: Proposal["contract"] & { available?: boolean; sourceId?: string };
};
type DetailAudit = Proposal["audit"][number] & {
  at?: number;
  actor?: string;
  action?: string;
};
type Tone = "posted" | "hold" | "review" | "pending" | "approved";

const money = (value: number) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)
    : "Amount unavailable";
const sourceKey = (citation: Citation) =>
  `${citation.sourceType}:${citation.sourceId}`;
const sourceLabel = (type: string) =>
  type === "precedent" || type === "decision"
    ? "Past decision"
    : type.charAt(0).toUpperCase() + type.slice(1);
const outcomeLabel = (outcome?: string, posted = false) => {
  if (outcome === "posted") return posted ? "Posted" : "Cleared for posting";
  if (outcome === "approved") return "Approved";
  if (outcome === "returned") return "Returned for revision";
  if (outcome === "rejected") return "Rejected";
  if (outcome === "escalated") return "Sent for human review";
  return outcome?.replaceAll("_", " ") || "No decision returned";
};

function presentation(record: DetailRecord, mode: "demo" | "live") {
  const status: string = record.status;
  const posted =
    Boolean(record.postedEntryId?.trim()) ||
    (mode === "demo" && status === "posted");
  if (status === "held")
    return {
      label: "Payment held",
      title: "This payment stays on hold.",
      tone: "hold" as Tone,
      posted,
      next:
        mode === "live"
          ? "Confirm the vendor’s bank details through a trusted channel. Live approval actions are unavailable here; the payment remains held."
          : "Confirm the vendor’s bank details through a trusted channel before releasing the payment.",
      action: mode === "live" ? "Review evidence" : "Review this payment",
    };
  if (posted)
    return {
      label: "Posted",
      title: "The entry is recorded.",
      tone: "posted" as Tone,
      posted,
      next: "No further action is needed for this entry.",
      action: null,
    };
  if (status === "posted" || record.outcome === "posted")
    return {
      label: "Posting not confirmed",
      title: "Waiting for the ledger entry.",
      tone: "pending" as Tone,
      posted,
      next: "A posting decision is available, but a recorded ledger entry has not been confirmed.",
      action: null,
    };
  if (status === "approved" || record.outcome === "approved")
    return {
      label: "Approved",
      title: "Approved, awaiting posting.",
      tone: "approved" as Tone,
      posted,
      next: "Approval is recorded. The entry will show as posted when the ledger confirms it.",
      action: null,
    };
  if (
    status === "rejected" ||
    record.outcome === "returned" ||
    record.outcome === "rejected"
  )
    return {
      label: "Changes requested",
      title: "This proposal needs a revision.",
      tone: "review" as Tone,
      posted,
      next:
        mode === "live"
          ? "Inspect the recorded review instruction and any later revision. Live approval actions are unavailable here."
          : "Follow the review instruction, then check the revised proposal.",
      action: mode === "live" ? "Review evidence" : "View review options",
    };
  if (status === "review" || record.outcome === "escalated")
    return {
      label: "Needs review",
      title:
        mode === "live"
          ? "This item was sent for review."
          : "This one needs your decision.",
      tone: "review" as Tone,
      posted,
      next:
        mode === "live"
          ? "Inspect the evidence and recorded review. Live approval actions are unavailable in this workspace."
          : "Check the evidence and proposed entry, then approve or return it for revision.",
      action: mode === "live" ? "Review evidence" : "Review & decide",
    };
  return {
    label: "In progress",
    title: "The proposal is being prepared.",
    tone: "pending" as Tone,
    posted,
    next: "Sources and control results will appear as they become available.",
    action: null,
  };
}

function Disclosure({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: ReactNode;
  count?: number;
  children: ReactNode;
}) {
  return (
    <details className="td-disclosure">
      <summary>
        {icon}
        <span>{title}</span>
        {count !== undefined && <small>{count}</small>}
        <ChevronDown size={16} />
      </summary>
      <div className="td-disclosure-body">{children}</div>
    </details>
  );
}

function SourceMetadata({ citation }: { citation: Citation }) {
  return (
    <dl className="td-source-metadata">
      <div>
        <dt>Source ID</dt>
        <dd>{citation.sourceId || "Not supplied"}</dd>
      </div>
      <div>
        <dt>Type</dt>
        <dd>{sourceLabel(citation.sourceType)}</dd>
      </div>
      <div>
        <dt>Retrieval score</dt>
        <dd>
          {Number.isFinite(citation.score)
            ? citation.score.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
            : "Not supplied"}
        </dd>
      </div>
    </dl>
  );
}

function AuditTime({ event }: { event: DetailAudit }) {
  if (typeof event.at === "number" && Number.isFinite(event.at)) {
    const date = new Date(event.at);
    if (!Number.isNaN(date.getTime()))
      return (
        <time dateTime={date.toISOString()}>
          {new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium",
            timeStyle: "medium",
            timeZone: "America/Los_Angeles",
          }).format(date)}{" "}
          PT
        </time>
      );
  }
  return <time>{event.time || "Timestamp unavailable"}</time>;
}

export default function TransactionDetail({
  proposal,
  mode,
  loading,
  error,
  revisions = [],
  onReview,
  onSelectRevision,
  onRetry,
}: TransactionDetailProps) {
  const record = proposal as DetailRecord;
  const sourcesRef = useRef<HTMLDetailsElement>(null);
  const sourceRefs = useRef(new Map<string, HTMLDetailsElement>());
  const versions = useMemo(() => {
    const unique = new Map<string, DetailRecord>();
    for (const version of revisions)
      unique.set(version.id, version as DetailRecord);
    unique.set(record.id, record);
    return [...unique.values()].sort(
      (a, b) => (b.revision ?? 1) - (a.revision ?? 1),
    );
  }, [record, revisions]);
  const citations = record.citations ?? [];
  const lines = record.lines ?? [];
  const rules = record.rules ?? [];
  const audit: DetailAudit[] = record.audit ?? [];
  const result = presentation(record, mode);
  const decisionExists = Boolean(
    record.reviewer || record.outcome || record.decisionReason,
  );
  const bankAvailable =
    record.sourceBank?.available ??
    (mode === "demo" && Boolean(record.sourceBank?.label));
  const ledgerAvailable =
    record.sourceLedger?.available ??
    (mode === "demo" && Boolean(record.sourceLedger?.label));
  const contractAvailable = record.contract?.available !== false;
  const matchedContract = contractAvailable
    ? citations.find(
        (citation) =>
          citation.sourceType === "contract" &&
          (Boolean(
            record.contract?.sourceId &&
              citation.sourceId === record.contract.sourceId,
          ) ||
            Boolean(
              record.contract?.text?.trim() &&
                citation.text.trim() === record.contract.text.trim(),
            )),
      )
    : undefined;
  const uniqueSources = [
    ...new Map(
      citations.map((citation) => [sourceKey(citation), citation]),
    ).values(),
  ];
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  const balanced =
    lines.length > 0 &&
    Number.isFinite(debit) &&
    Number.isFinite(credit) &&
    Math.abs(debit - credit) <= 0.005;
  const instruction =
    record.instruction ||
    (!record.firstRead &&
    !/^First read discarded:/i.test(record.revisionNote ?? "")
      ? record.revisionNote
      : undefined);
  const latest = versions[0];

  const openSource = (key: string) => {
    if (sourcesRef.current) sourcesRef.current.open = true;
    const source = sourceRefs.current.get(key);
    if (!source) return;
    source.open = true;
    requestAnimationFrame(() => {
      source.querySelector("summary")?.focus({ preventScroll: true });
      source.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  if (loading)
    return (
      <div
        className="transaction-detail td-state"
        role="status"
        aria-live="polite"
      >
        <LoaderCircle className="td-spinner" size={25} />
        <h2>Loading transaction details</h2>
        <p>Getting the latest sources and decision.</p>
      </div>
    );
  if (error)
    return (
      <div className="transaction-detail td-state" role="alert">
        <CircleAlert size={27} />
        <h2>Details couldn’t be loaded</h2>
        <p>{error}</p>
        {onRetry && (
          <button className="secondary-button" onClick={onRetry}>
            <RotateCcw size={15} />
            Try again
          </button>
        )}
      </div>
    );

  return (
    <div className="transaction-detail">
      <div className="td-topline">
        <span className="td-transaction-icon">
          {record.status === "held" ? (
            <LockKeyhole size={21} />
          ) : (
            <ArrowDownLeft size={23} />
          )}
        </span>
        <div className="td-topline-badges">
          {mode === "demo" && <span className="td-mode">Demo</span>}
          <span className={`td-status td-status-${result.tone}`}>
            {result.label}
          </span>
        </div>
      </div>
      <p className="td-eyebrow">
        {record.category || "Transaction"}
        {record.date ? ` · ${record.date}` : ""}
      </p>
      <h2>{record.vendor || "Transaction details"}</h2>
      <div className="td-amount">
        {record.sourceBank?.available === false ? (
          "Amount unavailable"
        ) : (
          <>
            {money(record.amount)}
            <span>USD</span>
          </>
        )}
      </div>
      <section
        className={`td-outcome td-outcome-${result.tone}`}
        aria-label="Current outcome"
      >
        <strong>{result.title}</strong>
        <p>
          {record.description || "No transaction description was supplied."}
        </p>
        {mode === "live" && record.postedEntryId && (
          <span className="td-record-id">
            Ledger entry · {record.postedEntryId}
          </span>
        )}
      </section>
      <section className="td-next-step">
        <h3>What happens next?</h3>
        <p>{result.next}</p>
        {result.action && (
          <button
            className="primary-button"
            onClick={() => onReview(record.id)}
          >
            {result.action}
            <ArrowRight size={15} />
          </button>
        )}
      </section>
      {instruction && (
        <aside className="td-instruction">
          <strong>Review instruction</strong>
          <p>{instruction}</p>
        </aside>
      )}

      <div className="td-section-label">More details</div>
      <details className="td-disclosure" ref={sourcesRef}>
        <summary>
          <FileText size={17} />
          <span>Supporting documents</span>
          <ChevronDown size={16} />
        </summary>
        <div className="td-disclosure-body">
          <div className="td-source-grid">
            <section className="td-source-card">
              <h3>
                <Landmark size={16} />
                Bank record
              </h3>
              {bankAvailable ? (
                <>
                  <strong className="td-source-amount">
                    {money(
                      record.sourceBank.signedAmount ??
                        record.sourceBank.amount,
                    )}
                  </strong>
                  <p>{record.sourceBank.label}</p>
                  <dl>
                    <div>
                      <dt>Date</dt>
                      <dd>{record.sourceBank.date || "Not supplied"}</dd>
                    </div>
                    <div>
                      <dt>Reference</dt>
                      <dd>{record.sourceBank.reference || "Not supplied"}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className="td-empty">Bank source not provided.</p>
              )}
            </section>
            <section className="td-source-card">
              <h3>
                <BookOpen size={16} />
                {record.sourceLedger.evidenceKind === "posted_entry"
                  ? "Recorded journal entry"
                  : "Book balance"}
              </h3>
              {ledgerAvailable ? (
                <>
                  <strong className="td-source-amount">
                    {money(record.sourceLedger.amount)}
                  </strong>
                  <p>{record.sourceLedger.label}</p>
                  <dl>
                    <div>
                      <dt>Account</dt>
                      <dd>{record.sourceLedger.account || "Not supplied"}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className="td-empty">
                  Ledger source not provided. A proposed entry is not evidence
                  of an existing book balance.
                </p>
              )}
            </section>
          </div>
          {matchedContract ? (
            <details
              className="td-source-detail"
              ref={(node) => {
                if (node)
                  sourceRefs.current.set(sourceKey(matchedContract), node);
                else sourceRefs.current.delete(sourceKey(matchedContract));
              }}
            >
              <summary>
                <span>{record.contract.title || "Contract clause"}</span>
                <small>
                  {record.contract.clause || matchedContract.sourceId}
                </small>
                <ChevronDown size={14} />
              </summary>
              <blockquote>{matchedContract.text}</blockquote>
              <SourceMetadata citation={matchedContract} />
            </details>
          ) : (
            <div className="td-source-card">
              <h3>Contract clause</h3>
              <p className="td-empty">
                No matching contract clause was supplied.
              </p>
            </div>
          )}
          {uniqueSources
            .filter(
              (citation) =>
                !matchedContract ||
                sourceKey(citation) !== sourceKey(matchedContract),
            )
            .map((citation) => (
              <details
                className="td-source-detail"
                key={sourceKey(citation)}
                ref={(node) => {
                  if (node) sourceRefs.current.set(sourceKey(citation), node);
                  else sourceRefs.current.delete(sourceKey(citation));
                }}
              >
                <summary>
                  <span>
                    {sourceLabel(citation.sourceType)} · {citation.sourceId}
                  </span>
                  <ChevronDown size={14} />
                </summary>
                <blockquote>{citation.text}</blockquote>
                <SourceMetadata citation={citation} />
                <p className="td-fine-print">
                  Supplied source excerpt. The full document was not returned.
                </p>
              </details>
            ))}
        </div>
      </details>

      <Disclosure title="Decision and checks" icon={<ShieldCheck size={17} />}>
        {decisionExists ? (
          <>
            <dl className="td-decision-meta">
              <div>
                <dt>Reviewed by</dt>
                <dd>
                  {record.reviewer === "controls"
                    ? "Controls engine"
                    : record.reviewer === "human"
                      ? "Human controller"
                      : record.reviewer === "agent"
                        ? "Staff accountant agent"
                        : "Not supplied"}
                </dd>
              </div>
              <div>
                <dt>Decision</dt>
                <dd>{outcomeLabel(record.outcome, result.posted)}</dd>
              </div>
              {record.decisionId && (
                <div>
                  <dt>Decision ID</dt>
                  <dd>{record.decisionId}</dd>
                </div>
              )}
            </dl>
            <p className="td-explanation">
              {record.decisionReason || "No decision explanation was returned."}
            </p>
          </>
        ) : (
          <p className="td-empty">
            No reviewer decision has been returned yet.
          </p>
        )}
        {rules.length > 0 ? (
          <ul className="td-rules">
            {rules.map((rule, index) => (
              <li key={`${rule.label}-${index}`}>
                <span
                  className={rule.passed ? "td-rule-pass" : "td-rule-review"}
                >
                  {rule.passed ? (
                    <Check size={14} />
                  ) : (
                    <CircleAlert size={14} />
                  )}
                </span>
                <div>
                  <strong>{rule.label}</strong>
                  {rule.detail && <p>{rule.detail}</p>}
                </div>
                <small>{rule.passed ? "Passed" : "Needs review"}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="td-empty">No control checks were returned.</p>
        )}
        {Number.isFinite(record.impact) && (
          <p className="td-fine-print">
            {money(record.impact)} effect on profit and loss.
          </p>
        )}
      </Disclosure>

      <Disclosure
        title="Citations"
        icon={<BookOpen size={17} />}
        count={citations.length}
      >
        {citations.length ? (
          <div className="td-citations">
            {citations.map((citation, index) => (
              <details
                className="td-citation"
                key={`${sourceKey(citation)}-${index}`}
              >
                <summary>
                  <FileText size={15} />
                  <span>{citation.sourceId || `Source ${index + 1}`}</span>
                  <small>{sourceLabel(citation.sourceType)}</small>
                  <ChevronDown size={14} />
                </summary>
                <blockquote>{citation.text}</blockquote>
                <SourceMetadata citation={citation} />
                <button
                  className="text-button"
                  onClick={() => openSource(sourceKey(citation))}
                >
                  View source excerpt
                  <ArrowRight size={13} />
                </button>
              </details>
            ))}
          </div>
        ) : (
          <p className="td-empty">
            No citations have been supplied for this proposal.
          </p>
        )}
      </Disclosure>

      <Disclosure title="Accounting entry" icon={<Layers3 size={17} />}>
        <div className="td-entry-head">
          <div>
            <h3>{result.posted ? "Recorded entry" : "Proposed entry"}</h3>
            <p>
              {record.revision
                ? `Revision ${record.revision}`
                : "Current proposal"}
              {record.id === latest?.id ? " · latest" : ""}
            </p>
          </div>
          {versions.length > 1 && (
            <label className="td-version-select">
              <span>Version</span>
              <select
                value={record.id}
                onChange={(event) => onSelectRevision(event.target.value)}
                aria-label="Select proposal revision"
              >
                {versions.map((version, index) => (
                  <option key={version.id} value={version.id}>
                    {version.revision
                      ? `Revision ${version.revision}`
                      : `Version ${versions.length - index}`}
                    {index === 0 ? " · latest" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {lines.length ? (
          <>
            <div className="td-journal-wrap">
              <table className="td-journal">
                <caption className="sr-only">
                  {result.posted ? "Recorded" : "Proposed"} accounting entry
                  with debit and credit totals
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">Debit</th>
                    <th scope="col">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={`${line.account}-${index}`}>
                      <td>
                        <span>{line.account}</span>
                        {line.name || "Account name not supplied"}
                      </td>
                      <td>{line.debit ? money(line.debit) : "—"}</td>
                      <td>{line.credit ? money(line.credit) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td>{money(debit)}</td>
                    <td>{money(credit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p
              className={`td-balance ${balanced ? "td-rule-pass" : "td-rule-review"}`}
            >
              {balanced ? <CircleCheck size={14} /> : <CircleAlert size={14} />}
              {balanced
                ? "Debits and credits balance."
                : "Debits and credits do not balance."}
            </p>
          </>
        ) : (
          <p className="td-empty">No journal entry has been proposed yet.</p>
        )}
        {record.firstRead?.trim() && (
          <details className="td-first-read">
            <summary>
              View original first read
              <ChevronDown size={14} />
            </summary>
            <p className="td-fine-print">
              Discarded hypothesis. This is not a posted accounting entry.
            </p>
            <blockquote>{record.firstRead}</blockquote>
          </details>
        )}
        {record.reason && (
          <details className="td-first-read">
            <summary>
              View proposal reasoning
              <ChevronDown size={14} />
            </summary>
            <p className="td-explanation">{record.reason}</p>
          </details>
        )}
      </Disclosure>

      <Disclosure
        title="Activity history"
        icon={<History size={17} />}
        count={audit.length}
      >
        {audit.length ? (
          <ol className="td-timeline">
            {audit.map((event, index) => (
              <li key={`${event.at ?? event.time}-${index}`}>
                <span
                  className={`td-timeline-dot ${event.kind === "warning" || event.kind === "error" ? "td-timeline-warning" : ""}`}
                />
                <div>
                  <strong>
                    {event.title || event.action || "Activity recorded"}
                  </strong>
                  {event.detail && <p>{event.detail}</p>}
                  <div className="td-audit-meta">
                    <AuditTime event={event} />
                    <span>{event.actor || "Actor not supplied"}</span>
                    {event.action && <code>{event.action}</code>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="td-empty">
            No audit events were returned for this proposal.
          </p>
        )}
      </Disclosure>
      <p className="td-footnote">
        {mode === "demo" ? "Sample record" : "Live record"} ·{" "}
        {record.id || "ID unavailable"}
      </p>
    </div>
  );
}
