import { createContext, useContext, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCheck,
  CircleCheck,
  LockKeyhole,
  Plus,
  ShieldCheck,
  ShieldX,
  Sparkles,
} from "lucide-react";
import type { Proposal } from "../data/types";
import type { LiveSnapshot } from "../data/live";
import type { WireCloseSummary } from "../data/contracts";
import {
  canSignPeriod,
  latestProposals,
  needsHumanReview,
  unresolvedProposals,
} from "../data/selectors";
import {
  controlPolicyRules,
  initialProposals,
  permissionGroups,
} from "../data/demo";
import ControllerReview from "./ControllerReview";
import AskDrawer from "./AskDrawer";
import type { AskDrawerProps } from "./AskDrawer";

export type DrawerType =
  | "approvals"
  | "scoreboard"
  | "permissions"
  | "inject"
  | "ask"
  | "memory"
  | "activity";
export type LoadedControlResult = {
  proposalId: string;
  rule: string;
  kind: "preventive" | "detective" | "enabling";
  passed: boolean;
  detail?: string;
};
export interface WorkspaceDrawerProps {
  mode?: "demo" | "live";
  liveSnapshot?: LiveSnapshot | null;
  loading?: boolean;
  error?: string;
  actionsDisabled?: boolean;
  canSign?: boolean;
  canDeny?: boolean;
  controlResults?: LoadedControlResult[];
  onAsk?: AskDrawerProps["onAsk"];
  type: DrawerType;
  proposals: Proposal[];
  period: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onApprove: (id: string, note: string) => void | Promise<void>;
  onReject: (id: string, instruction: string) => void | Promise<void>;
  onInject: (
    kind: string,
    vendor: string,
    amount: number,
    note: string,
  ) => void | Promise<void>;
  onPrepare: () => void | Promise<void>;
  onSign: () => void | Promise<void>;
  onDeny: () => void | Promise<void>;
  signed: boolean;
  denialCount: number;
}
const DataMode = createContext<"demo" | "live">("demo");
const money = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
const cents = (amount: number) => money(amount / 100);
const currentSnapshot = (props: WorkspaceDrawerProps) =>
  props.liveSnapshot?.period === props.period
    ? (props.liveSnapshot as LiveSnapshot & { summary?: WireCloseSummary })
    : undefined;
const blockedActions = (props: WorkspaceDrawerProps) =>
  Boolean(
    props.actionsDisabled ||
      props.loading ||
      props.error ||
      (props.mode === "live" &&
        (!currentSnapshot(props) ||
          currentSnapshot(props)?.loading ||
          !currentSnapshot(props)?.connected)),
  );
const requestMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed. Please try again.";

function Intro({ title, children }: { title: string; children: ReactNode }) {
  const mode = useContext(DataMode);
  return (
    <div className="drawer-section">
      <span className="badge badge-neutral">
        {mode === "live" ? "Live data" : "Demo"}
      </span>
      <h2 className="drawer-title">{title}</h2>
      <p className="drawer-copy">{children}</p>
    </div>
  );
}
function ActionNotice(props: WorkspaceDrawerProps) {
  if (props.mode !== "live" || !blockedActions(props)) return null;
  return (
    <p
      className={props.error ? "warning-notice" : "drawer-copy"}
      role={props.error ? "alert" : "status"}
    >
      {props.error ||
        "Waiting for current workspace data or the action already in progress. Your notes stay here."}
    </p>
  );
}
function Approvals(props: WorkspaceDrawerProps) {
  const pending = latestProposals(props.proposals).filter(needsHumanReview);
  const disabled = blockedActions(props);
  return (
    <>
      <Intro title="Review items">
        {pending.length
          ? `${pending.length} ${pending.length === 1 ? "item needs" : "items need"} your decision.`
          : disabled
            ? "Waiting for the current review queue…"
            : "No current items are awaiting a controller decision."}
      </Intro>
      <ActionNotice {...props} />
      <div className="drawer-list">
        {pending.map((proposal) => (
          <ControllerReview
            key={proposal.id}
            proposal={proposal}
            signed={props.signed}
            disabled={disabled}
            onSelect={props.onSelect}
            onApprove={props.onApprove}
            onReject={props.onReject}
          />
        ))}
        {!pending.length && !disabled && (
          <div className="empty-state">
            <CircleCheck size={27} />
            <h3>No items to review</h3>
            <p>Open a transaction to inspect its sources and decision.</p>
          </div>
        )}
      </div>
    </>
  );
}
interface MemorySource {
  id: string;
  type: string;
  title: string;
  date: string;
  text: string;
  context: string;
  scope: string;
  quote?: string;
}
const apexCitations =
  initialProposals.find((proposal) => proposal.id === "apex-sep")?.citations ??
  [];
const sourceMemory: MemorySource[] = [
  {
    id: "D-0417",
    type: "Controller decision",
    title: "The headliner cancellation",
    date: "July 2026",
    text: "A $60,000 artist deposit returned as $51,000. The controller cleared the receivable and expensed the $9,000 difference under policy 5.1.",
    context:
      "The relevant precedent for Apex: a withheld portion of a returned deposit, with the contract and policy supporting the expense treatment.",
    scope: "Deposit returns · cancellation deductions",
    quote: apexCitations.find((citation) => citation.sourceId === "D-0417")
      ?.text,
  },
  {
    id: "apex-9.4",
    type: "Contract",
    title: "Apex · clause 9.4",
    date: "September 2026",
    text: "Apex’s $16,000 deposit returned as $13,600 on September 25. The $2,400 deduction is an inspection fee under the contract.",
    context:
      "Read together with the deposit-return precedent and policy 5.1. Under-threshold treatment still requires every control to pass.",
    scope: "Apex · deposit inspection fee",
    quote: apexCitations.find((citation) => citation.sourceId === "apex-9.4")
      ?.text,
  },
  {
    id: "policy-5.1",
    type: "Accounting policy",
    title: "Deposit deductions",
    date: "Policy 5.1",
    text: "The demo applies policy 5.1 to the supported expense portion of a deposit return. Apex’s P&L impact is $2,400, below the $5,000 materiality threshold.",
    context:
      "The controls engine, rather than the proposing agent, is responsible for validating the proposal and deciding whether policy permits posting.",
    scope: "Deposit returns · materiality",
    quote: apexCitations.find((citation) => citation.sourceId === "policy-5.1")
      ?.text,
  },
  {
    id: "policy-4.3",
    type: "Control policy",
    title: "A bank change is a hard stop",
    date: "Policy 4.3",
    text: "Field & Flame changed its bank details on September 10, before a $42,000 payment due September 15. CRS verification is unavailable in this demo. The payment stays on hold while the controller reviews the exception.",
    context:
      "A positive payee check does not override the hold. The controller makes the decision; the proposed payment is parked in account 1400.",
    scope: "Vendor bank changes · payment holds",
  },
  {
    id: "D-0408",
    type: "Learned precedent",
    title: "Stripe fees, asked once",
    date: "July → September",
    text: "A $48,600 gross Stripe payout settles at $47,180. The $1,420 difference is processing fees, initially reviewed by the controller.",
    context:
      "A matching, human-decided precedent can be applied in later periods under policy 8.2, if the scope matches and every control passes.",
    scope: "Stripe · weekly payout fees",
  },
  {
    id: "SW-1042",
    type: "Correction",
    title: "Remember the duplicate",
    date: "July 2026",
    text: "SoundWave invoice SW-1042 for $18,500 arrived twice. The correct treatment is to void the duplicate, with human review for the control exception.",
    context:
      "The correction is retained so a later proposal can be checked for the same mistake before it is accepted.",
    scope: "SoundWave · duplicate invoice",
  },
];

const fixtureScenarios = [
  {
    name: "Stripe",
    amount: "$1,420",
    treatment:
      "Record processing fees; reuse the reviewed precedent for matching payouts.",
  },
  {
    name: "SoundWave",
    amount: "$18,500",
    treatment: "Void the duplicate invoice and retain the original payable.",
  },
  {
    name: "Northern Lines",
    amount: "$9,000",
    treatment:
      "Expense the cancellation fee; clear the $60,000 deposit against the $51,000 refund.",
  },
  {
    name: "Brightwater",
    amount: "$70,000 cap",
    treatment:
      "Apply $30,000 plus $2 per attendee. Record the August catch-up and September variable fee.",
  },
  {
    name: "Field & Flame",
    amount: "$42,000",
    treatment:
      "Hold the payment after the bank change; require independent confirmation and controller review.",
  },
  {
    name: "Ironclad",
    amount: "$9,400",
    treatment:
      "Accrue the August services; reverse the accrual when the September invoice arrives.",
  },
];

function Scoreboard(props: WorkspaceDrawerProps) {
  const live = props.mode === "live";
  const snapshot = currentSnapshot(props);
  const summary = snapshot?.summary;
  const score = snapshot?.score;
  const workflow = snapshot?.workflow;
  const current = latestProposals(props.proposals);
  const pending = unresolvedProposals(current).length;
  const toReview = current.filter(needsHumanReview).length;
  const signed = props.signed || summary?.status === "signed";
  const running =
    workflow?.type === "inProgress" ||
    Boolean(workflow?.running) ||
    summary?.status === "closing";
  const disabled = blockedActions(props);
  const summaryReady =
    !live || Boolean(summary && summary.status !== "missing");
  const balanced =
    !live ||
    Boolean(
      summary &&
        Number.isFinite(summary.debits) &&
        Number.isFinite(summary.credits) &&
        summary.debits === summary.credits,
    );
  const emptyPeriodComplete =
    live &&
    snapshot?.feedComplete === true &&
    workflow?.type === "completed" &&
    summary?.status === "open" &&
    summary.openItems === 0 &&
    summary.awaitingController === 0;
  const fallbackCanSign = canSignPeriod(props.proposals, {
    status: live ? summary?.status : signed ? "signed" : "open",
    loading: disabled,
    closeRunning: running,
    feedComplete: live ? snapshot?.feedComplete === true : true,
    allowEmpty: emptyPeriodComplete,
  });
  const signAllowed =
    (props.canSign ?? true) &&
    fallbackCanSign &&
    summaryReady &&
    balanced &&
    !running &&
    !signed &&
    !disabled &&
    (!live ||
      (snapshot?.feedComplete === true &&
        (current.length > 0 || emptyPeriodComplete)));
  const [busy, setBusy] = useState<"prepare" | "sign" | null>(null);
  const [accepted, setAccepted] = useState<"prepare" | "sign" | null>(null);
  const [requestError, setRequestError] = useState("");
  const [routineMinutes, setRoutineMinutes] = useState(3);
  const [exceptionMinutes, setExceptionMinutes] = useState(20);
  const [escalationMinutes, setEscalationMinutes] = useState(15);
  const inFlight = useRef(false);
  const routineCount = live ? score?.closedByCode : 106;
  const exceptionCount = live ? current.length : 11;
  const escalationCount = live ? toReview : 1;
  const estimateKnown =
    routineCount !== undefined &&
    (!live || Boolean(snapshot && !snapshot.loading));
  const baselineMinutes = estimateKnown
    ? routineCount * routineMinutes +
      exceptionCount * exceptionMinutes +
      escalationCount * escalationMinutes
    : null;
  const savedHours =
    baselineMinutes === null
      ? null
      : Math.max(
          0,
          (baselineMinutes - escalationCount * escalationMinutes) / 60,
        );
  const request = async (action: "prepare" | "sign") => {
    if (
      inFlight.current ||
      disabled ||
      signed ||
      running ||
      (action === "sign" && !signAllowed)
    )
      return;
    inFlight.current = true;
    setBusy(action);
    setRequestError("");
    try {
      await (action === "prepare" ? props.onPrepare : props.onSign)();
      setAccepted(action);
    } catch (error) {
      setRequestError(requestMessage(error));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };
  const nextStep = signed
    ? "This period is signed and locked."
    : disabled
      ? "Wait for current workspace data before preparing or signing."
      : running
        ? "The close is running. Sign after it finishes."
        : !summaryReady
          ? "The server close summary is not available yet."
          : pending
            ? `${pending} current ${pending === 1 ? "item remains" : "items remain"} unresolved.`
            : !balanced
              ? "The trial balance does not balance. Review it before signing."
              : !signAllowed
                ? "This period is not ready for signing."
                : "Review the trial balance, then sign to lock this period.";
  return (
    <>
      <Intro title="Close summary">
        {live ? "Server records" : "Your progress"} for {props.period}.
      </Intro>
      <ActionNotice {...props} />
      <div className="drawer-stat-grid">
        <div className="drawer-stat">
          <span className="drawer-label">
            {live ? "Bank transactions" : "Completed"}
          </span>
          <strong>
            {live
              ? (score?.transactions ?? "—")
              : current.filter((item) => item.status === "posted").length}
            {!live && <small> / {current.length}</small>}
          </strong>
        </div>
        <div className="drawer-stat">
          <span className="drawer-label">
            {live ? "Journal entries" : "To review"}
          </span>
          <strong>{live ? (summary?.entriesPosted ?? "—") : pending}</strong>
        </div>
        <div className="drawer-stat">
          <span className="drawer-label">
            {live ? "Current review queue" : "Estimated time saved"}
          </span>
          <strong>
            {live ? toReview : (savedHours?.toFixed(1) ?? "—")}
            {!live && <small> hrs</small>}
          </strong>
        </div>
      </div>
      <section className="drawer-card">
        <div className="drawer-card-head">
          <h3>{signed ? "Period signed" : "Finish this close"}</h3>
          <span className="badge badge-neutral">
            {signed
              ? "Locked"
              : running
                ? "Running"
                : live && !summaryReady
                  ? "Not available"
                  : "Open"}
          </span>
        </div>
        <p className="drawer-copy">{nextStep}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void request("sign");
          }}
          aria-busy={busy !== null}
        >
          <div className="drawer-row">
            <button
              className="secondary-button"
              type="button"
              disabled={
                disabled ||
                signed ||
                running ||
                busy !== null ||
                (accepted === "prepare" && workflow?.type !== "failed")
              }
              onClick={() => void request("prepare")}
            >
              <Sparkles size={15} />
              {busy === "prepare"
                ? "Preparing…"
                : running
                  ? "Close running"
                  : accepted === "prepare"
                    ? live
                      ? "Close requested"
                      : "Close prepared"
                    : "Prepare close"}
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={!signAllowed || busy !== null || accepted === "sign"}
            >
              <CheckCheck size={15} />
              {signed
                ? "Signed"
                : busy === "sign"
                  ? "Signing…"
                  : accepted === "sign"
                    ? "Awaiting server update"
                    : "Sign period"}
            </button>
          </div>
        </form>
        {requestError && (
          <p className="warning-notice" role="alert">
            {requestError}
          </p>
        )}
        {accepted === "prepare" && live && (
          <p className="drawer-label" role="status">
            Close request accepted. Follow the server activity as it runs.
          </p>
        )}
        {workflow?.type === "failed" && (
          <p className="warning-notice" role="alert">
            The close stopped before finishing. Review its recorded activity
            before retrying.
          </p>
        )}
      </section>
      {live && (
        <details className="drawer-card">
          <summary>View trial balance and server totals</summary>
          {summary ? (
            <>
              <p className="drawer-copy">
                Debits{" "}
                <strong style={{ fontFamily: "var(--mono)" }}>
                  {cents(summary.debits)}
                </strong>{" "}
                · Credits{" "}
                <strong style={{ fontFamily: "var(--mono)" }}>
                  {cents(summary.credits)}
                </strong>
                <span
                  className={`badge ${balanced ? "badge-green" : "badge-amber"}`}
                >
                  {balanced ? "Balanced" : "Needs review"}
                </span>
              </p>
              {summary.trialBalance.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table aria-label="Server trial balance">
                    <thead>
                      <tr>
                        <th scope="col">Account</th>
                        <th scope="col">Debit</th>
                        <th scope="col">Credit</th>
                        <th scope="col">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.trialBalance.map((row) => (
                        <tr className="permission-row" key={row.code}>
                          <td>
                            <strong>{row.code}</strong>
                            <p className="drawer-label">{row.name}</p>
                          </td>
                          <td style={{ fontFamily: "var(--mono)" }}>
                            {cents(row.debit)}
                          </td>
                          <td style={{ fontFamily: "var(--mono)" }}>
                            {cents(row.credit)}
                          </td>
                          <td style={{ fontFamily: "var(--mono)" }}>
                            {cents(row.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="drawer-copy">
                  No trial-balance rows were returned.
                </p>
              )}
              <p className="drawer-label">
                Server record counts across all revisions: {summary.openItems}{" "}
                open; {summary.awaitingController} awaiting controller. Signing
                uses the latest current proposals.
              </p>
              {summary.signedAt && (
                <p className="drawer-label">
                  Signed{" "}
                  {new Date(summary.signedAt).toLocaleString("en-US", {
                    timeZone: "America/Los_Angeles",
                  })}{" "}
                  PT.
                </p>
              )}
            </>
          ) : (
            <p className="drawer-copy">
              The server close summary has not loaded.
            </p>
          )}
          {score && (
            <p className="drawer-copy">
              {score.closedByCode} matched by code · {score.posted} posted
              proposals · {score.plantedBreaks} answer-key scenarios ·{" "}
              {score.caught} recorded as caught · {score.correct} recorded as
              correct.
            </p>
          )}
          <p className="drawer-label">
            Measured time savings, precision, recall, and repeat-mistake metrics
            have not been supplied.
          </p>
        </details>
      )}
      <details className="drawer-card">
        <summary>View planning assumptions{!live && " and progress"}</summary>
        {!live && (
          <>
            <h3>Human escalations</h3>
            <div
              className="chart-bars"
              aria-label="Illustrative escalations: July five, August two, September one"
            >
              {[
                { month: "July", value: 5 },
                { month: "August", value: 2 },
                { month: "September", value: 1 },
              ].map(({ month, value }) => (
                <div className="chart-column" key={month}>
                  <strong>{value}</strong>
                  <div
                    className="chart-bar"
                    style={{ height: `${value * 20}px` }}
                  />
                  <span>{month}</span>
                </div>
              ))}
            </div>
            <p className="drawer-label">
              Illustrative examples, not measured live performance.
            </p>
          </>
        )}
        <h3>Time calculator</h3>
        <p className="drawer-copy">
          {routineCount ?? "—"} routine transactions, {exceptionCount}{" "}
          proposals, and {escalationCount} current escalations. Edit estimated
          minutes per item.
        </p>
        <div className="drawer-stat-grid">
          {[
            { label: "Routine", value: routineMinutes, set: setRoutineMinutes },
            {
              label: "Exception",
              value: exceptionMinutes,
              set: setExceptionMinutes,
            },
            {
              label: "Escalation",
              value: escalationMinutes,
              set: setEscalationMinutes,
            },
          ].map(({ label, value, set }) => (
            <label className="form-field" key={label}>
              <span>{label} · minutes</span>
              <input
                className="input"
                type="number"
                min="0"
                max="240"
                step="0.5"
                value={value}
                onChange={(event) =>
                  set(Math.min(240, Math.max(0, Number(event.target.value))))
                }
              />
            </label>
          ))}
        </div>
        {baselineMinutes !== null ? (
          <p className="citation-quote">
            ({routineCount} × {routineMinutes} + {exceptionCount} ×{" "}
            {exceptionMinutes} + {escalationCount} × {escalationMinutes}) ÷ 60 ={" "}
            {(baselineMinutes / 60).toFixed(1)} baseline hours. Less{" "}
            {((escalationCount * escalationMinutes) / 60).toFixed(2)} controller
            hours = {savedHours?.toFixed(1)} estimated hours saved.
          </p>
        ) : (
          <p className="drawer-label">
            Load the workload counts to calculate an estimate.
          </p>
        )}
        <p className="drawer-label">
          Planning estimate only; excludes setup and review overhead. This is
          separate from measured results.
        </p>
      </details>
      {!live && (
        <details className="drawer-card">
          <summary>View test scenarios and illustrative impact</summary>
          <p className="drawer-label">Fixture scenarios · expected outcomes</p>
          <table aria-label="Expected fixture outcomes">
            <thead>
              <tr>
                <th scope="col">Scenario</th>
                <th scope="col">Expected treatment</th>
              </tr>
            </thead>
            <tbody>
              {fixtureScenarios.map((scenario) => (
                <tr className="permission-row" key={scenario.name}>
                  <td>
                    <strong>{scenario.name}</strong>
                    <p className="drawer-label">{scenario.amount}</p>
                  </td>
                  <td>{scenario.treatment}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="drawer-copy">
            Precision and recall: Pending live scoring. Repeat mistakes: 0 in
            the seeded example.
          </p>
          <p className="citation-quote">
            $69,500 illustrative dollars protected: $42,000 hold + $18,500
            duplicate + $9,000 misclassification. This is not measured cash
            savings.
          </p>
        </details>
      )}
    </>
  );
}

type ControlCount = {
  rule: string;
  kind?: string;
  checked: number;
  flagged: number;
};
function loadedControlCounts(
  results: readonly LoadedControlResult[],
  proposals: readonly Proposal[] = [],
): ControlCount[] {
  const records: readonly { rule: string; kind?: string; passed: boolean }[] =
    results.length
      ? results
      : proposals.flatMap((proposal) =>
          proposal.rules.map((rule) => ({
            rule: rule.label,
            passed: rule.passed,
          })),
        );
  const counts = new Map<string, ControlCount>();
  for (const record of records) {
    const key = `${record.kind ?? "unknown"}:${record.rule}`;
    const count = counts.get(key) ?? {
      rule: record.rule,
      kind: record.kind,
      checked: 0,
      flagged: 0,
    };
    count.checked += 1;
    if (!record.passed) count.flagged += 1;
    counts.set(key, count);
  }
  return [...counts.values()];
}
function Permissions(props: WorkspaceDrawerProps) {
  const live = props.mode === "live";
  const counts = loadedControlCounts(
    props.controlResults ?? [],
    props.proposals,
  );
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const enabled = (!live || props.canDeny === true) && !blockedActions(props);
  const testPosting = async () => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await props.onDeny();
      setAttempted(true);
    } catch (cause) {
      setError(requestMessage(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const roles = [
    {
      title: "Auditor",
      copy: "Finds mismatches and proposes entries.",
      capability: "Can propose",
      icon: BookOpen,
    },
    {
      title: "Controls",
      copy: "Checks the rules before posting an eligible entry.",
      capability: "Can post",
      icon: ShieldCheck,
    },
    {
      title: "You",
      copy: "Review exceptions and sign the completed close.",
      capability: "Can approve",
      icon: CheckCheck,
    },
  ];
  return (
    <>
      <Intro title="How approvals work">
        Three separate roles keep every entry accountable.
      </Intro>
      <div className="drawer-list">
        {roles.map(({ title, copy, capability, icon: Icon }) => (
          <section className="drawer-card" key={title}>
            <div className="drawer-card-head">
              <h3>
                <Icon size={18} />
                {title}
              </h3>
              <span className="badge badge-neutral">{capability}</span>
            </div>
            <p className="drawer-copy">{copy}</p>
          </section>
        ))}
      </div>
      <details className="drawer-card">
        <summary>View recorded control checks</summary>
        {counts.length ? (
          <table aria-label="Loaded control check counts">
            <thead>
              <tr>
                <th scope="col">Control</th>
                <th scope="col">Type</th>
                <th scope="col">Checked</th>
                <th scope="col">Flagged</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((count) => (
                <tr
                  className="permission-row"
                  key={`${count.kind}-${count.rule}`}
                >
                  <td>{count.rule}</td>
                  <td>
                    {count.kind
                      ? count.kind.charAt(0).toUpperCase() + count.kind.slice(1)
                      : "Not supplied"}
                  </td>
                  <td>{count.checked}</td>
                  <td>{count.flagged}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="drawer-copy">
            No control results were returned in the loaded records.
          </p>
        )}
        <p className="drawer-label">
          Counts cover only the loaded {live ? "server" : "sample"} records,
          including revisions. Flagged means a check did not pass.
        </p>
      </details>
      <details className="drawer-card">
        <summary>View configured tools and policy reference</summary>
        {permissionGroups.map((group) => (
          <section className="drawer-section" key={group.identity}>
            <h3>{group.title}</h3>
            <p className="drawer-label">{group.restriction}</p>
            <p className="drawer-copy">
              {group.tools.map((tool, index) => (
                <span key={tool}>
                  <code>{tool}</code>
                  {index < group.tools.length - 1 ? " · " : ""}
                </span>
              ))}
            </p>
          </section>
        ))}
        {controlPolicyRules.map((rule) => (
          <p className="drawer-copy" key={rule.clause}>
            <strong>
              {rule.clause} · {rule.title}
            </strong>
            <br />
            {rule.description}
          </p>
        ))}
      </details>
      <details className="drawer-card">
        <summary>Advanced: test posting access</summary>
        <p className="drawer-copy">
          {live
            ? props.canDeny
              ? "Run the connected server check using the agent identity."
              : "A server posting test is not connected yet."
            : "Simulate an attempt to post as the proposing agent."}
        </p>
        <button
          className="secondary-button"
          disabled={!enabled || busy}
          onClick={() => void testPosting()}
        >
          <LockKeyhole size={15} />
          {busy
            ? "Testing…"
            : live && !props.canDeny
              ? "Server test unavailable"
              : "Attempt agent post"}
        </button>
        {attempted && !live && (
          <p className="warning-notice" role="status">
            <ShieldX size={15} />
            Simulated permission denial. No entry was posted.
          </p>
        )}
        {!live && (
          <p className="drawer-label">{props.denialCount} simulated denials.</p>
        )}
        {error && (
          <p className="warning-notice" role="alert">
            {error}
          </p>
        )}
      </details>
    </>
  );
}

function Inject(props: WorkspaceDrawerProps) {
  const live = props.mode === "live";
  const [kind, setKind] = useState("bank_transaction");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inFlight = useRef(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess("");
    if (live) {
      setError(
        "Live scenario submission is not connected. You can prepare the fields here or use the demo.",
      );
      return;
    }
    if (props.signed) {
      setError("This period is locked. Choose an open period.");
      return;
    }
    if (inFlight.current || blockedActions(props)) return;
    const value = Number(amount);
    if (!vendor.trim()) {
      setError("Enter a vendor or counterparty.");
      return;
    }
    if (
      !amount.trim() ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > 100000000
    ) {
      setError("Enter an amount between $0.01 and $100,000,000.");
      return;
    }
    if (note.trim().length < 10) {
      setError("Add at least 10 characters of context.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await props.onInject(
        kind,
        vendor.trim(),
        Math.round(value * 100) / 100,
        note.trim(),
      );
      setSuccess("Added to the demo review queue.");
      setVendor("");
      setAmount("");
      setNote("");
    } catch (cause) {
      setError(requestMessage(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <Intro title="Add a test scenario">
        {live
          ? "Prepare a scenario. Live submission is not connected yet."
          : "Try a fictional transaction or change."}
      </Intro>
      <form
        className="drawer-card"
        onSubmit={(event) => void submit(event)}
        aria-busy={busy}
      >
        <label className="form-field">
          <span>Scenario type</span>
          <select
            className="input"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setSuccess("");
              setError("");
            }}
          >
            <option value="bank_transaction">Bank transaction</option>
            <option value="contract_amendment">Contract amendment</option>
            <option value="vendor_bank_change">Vendor bank change</option>
          </select>
        </label>
        <label className="form-field">
          <span>{kind === "bank_transaction" ? "Counterparty" : "Vendor"}</span>
          <input
            className="input"
            required
            maxLength={100}
            value={vendor}
            disabled={busy}
            onChange={(event) => setVendor(event.target.value)}
            placeholder="e.g. Meridian Production"
            autoComplete="off"
          />
        </label>
        <label className="form-field">
          <span>
            {kind === "contract_amendment"
              ? "Updated contract amount"
              : kind === "vendor_bank_change"
                ? "Payment affected"
                : "Transaction amount"}{" "}
            · USD
          </span>
          <input
            className="input"
            required
            type="number"
            min="0.01"
            max="100000000"
            step="0.01"
            value={amount}
            disabled={busy}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
          />
        </label>
        <label className="form-field">
          <span>
            {kind === "contract_amendment"
              ? "New contract terms"
              : kind === "vendor_bank_change"
                ? "Bank change context"
                : "Transaction context"}
          </span>
          <textarea
            className="textarea"
            required
            rows={3}
            minLength={10}
            maxLength={1500}
            value={note}
            disabled={busy}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Describe what changed…"
          />
        </label>
        {kind === "vendor_bank_change" && (
          <p className="drawer-label">
            Use fictional details. Bank changes create a held item for review.
          </p>
        )}
        {error && (
          <p className="warning-notice" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="success-notice" role="status">
            {success}
          </p>
        )}
        {live && (
          <p className="drawer-label">
            These fields are a draft. No live transaction, amendment, or bank
            change will be submitted.
          </p>
        )}
        {props.signed && (
          <p className="drawer-label">This period is signed and locked.</p>
        )}
        <button
          className="primary-button"
          type="submit"
          disabled={live || props.signed || busy || blockedActions(props)}
        >
          {live || props.signed ? (
            <LockKeyhole size={15} />
          ) : (
            <Plus size={15} />
          )}
          {live
            ? "Live submission unavailable"
            : props.signed
              ? "Period locked"
              : busy
                ? "Adding…"
                : "Add scenario"}
        </button>
      </form>
    </>
  );
}
function Memory() {
  const [query, setQuery] = useState("");
  const sources = sourceMemory.filter((source) =>
    `${source.title} ${source.type} ${source.text} ${source.id}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <Intro title="Past decisions">Find the context behind a decision.</Intro>
      <label className="form-field">
        <span className="sr-only">Search past decisions</span>
        <input
          className="input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search vendors, policies, or decisions…"
        />
      </label>
      <div className="drawer-list">
        {sources.map((source) => (
          <details className="drawer-card" key={source.id}>
            <summary>
              <span>{source.title}</span>
              <span className="drawer-label">{source.date}</span>
            </summary>
            <p className="citation-quote">{source.quote ?? source.text}</p>
            <p className="drawer-copy">{source.context}</p>
            <span className="drawer-label">
              {source.id} · {source.quote ? "Source excerpt" : "Source summary"}
            </span>
          </details>
        ))}
        {sources.length === 0 && (
          <div className="empty-state">
            <BookOpen size={26} />
            <h3>No matches found</h3>
            <p>Try a vendor name or policy number.</p>
          </div>
        )}
      </div>
    </>
  );
}

function EvidenceAndActivity(props: WorkspaceDrawerProps) {
  const snapshot = currentSnapshot(props);
  if (props.type === "memory")
    return (
      <>
        <Intro title="Decision evidence">
          Sources attached to the loaded proposals.
        </Intro>
        <ActionNotice {...props} />
        {props.proposals
          .filter((proposal) => proposal.citations.length)
          .map((proposal) => (
            <details className="drawer-card" key={proposal.id}>
              <summary>
                {proposal.vendor}
                <span className="drawer-label">
                  {" "}
                  · {proposal.decisionId || proposal.id}
                </span>
              </summary>
              {proposal.citations.map((citation, index) => (
                <div
                  className="citation-quote"
                  key={`${citation.sourceId}-${index}`}
                >
                  <strong>{citation.sourceId}</strong>
                  <p>{citation.text}</p>
                  <span className="drawer-label">
                    {citation.sourceType} · Retrieval score {citation.score}
                  </span>
                </div>
              ))}
              <button
                className="text-button"
                onClick={() => props.onSelect(proposal.id)}
              >
                Open transaction
                <ArrowRight size={13} />
              </button>
            </details>
          ))}
        {!props.proposals.some((proposal) => proposal.citations.length) && (
          <p className="drawer-copy">No cited sources have been loaded yet.</p>
        )}
      </>
    );
  const events =
    props.mode === "live"
      ? (snapshot?.audit ?? [])
      : props.proposals.flatMap((proposal) => proposal.audit).reverse();
  return (
    <>
      <Intro title="Activity">Recorded updates for {props.period}.</Intro>
      <ActionNotice {...props} />
      {props.loading && (
        <p className="drawer-copy" role="status">
          Loading activity…
        </p>
      )}
      <div className="drawer-list">
        {events.map((event, index) => (
          <details
            className="drawer-card"
            key={`${event.at ?? event.time}-${index}`}
          >
            <summary>
              {event.title}
              <span className="drawer-label">
                {" "}
                · {event.actor || "Actor not supplied"}
              </span>
            </summary>
            <p className="drawer-copy">
              {event.detail || "No additional detail recorded."}
            </p>
            {event.at ? (
              <time
                className="drawer-label"
                dateTime={new Date(event.at).toISOString()}
              >
                {new Intl.DateTimeFormat("en-US", {
                  timeZone: "America/Los_Angeles",
                  dateStyle: "medium",
                  timeStyle: "medium",
                }).format(new Date(event.at))}{" "}
                PT
              </time>
            ) : (
              <span className="drawer-label">
                {event.time || "Timestamp not supplied"}
              </span>
            )}
          </details>
        ))}
      </div>
      {!events.length && !props.loading && (
        <p className="drawer-copy">
          {blockedActions(props)
            ? "Activity will appear when the feed is current."
            : "No activity has been recorded for this period."}
        </p>
      )}
    </>
  );
}
export default function WorkspaceDrawer(props: WorkspaceDrawerProps) {
  let content: ReactNode;
  if (props.type === "ask")
    content = (
      <AskDrawer
        mode={props.mode ?? "demo"}
        period={props.period}
        onAsk={props.onAsk}
      />
    );
  else if (props.type === "approvals") content = <Approvals {...props} />;
  else if (props.type === "scoreboard") content = <Scoreboard {...props} />;
  else if (props.type === "permissions") content = <Permissions {...props} />;
  else if (props.type === "inject") content = <Inject {...props} />;
  else if (props.type === "memory" && props.mode !== "live")
    content = <Memory />;
  else content = <EvidenceAndActivity {...props} />;
  return (
    <DataMode.Provider value={props.mode ?? "demo"}>
      {content}
    </DataMode.Provider>
  );
}
