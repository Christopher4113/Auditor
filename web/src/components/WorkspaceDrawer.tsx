import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  CircleCheck,
  FileText,
  LockKeyhole,
  Mic,
  MicOff,
  Plus,
  Send,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { Proposal } from "../data/types";
import {
  controlPolicyRules,
  initialProposals,
  permissionGroups,
} from "../data/demo";

export type DrawerType =
  | "approvals"
  | "scoreboard"
  | "permissions"
  | "inject"
  | "ask"
  | "memory"
  | "activity";
interface WorkspaceDrawerProps {
  type: DrawerType;
  proposals: Proposal[];
  period: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onApprove: (id: string, note: string) => void;
  onReject: (id: string, instruction: string) => void;
  onInject: (
    kind: string,
    vendor: string,
    amount: number,
    note: string,
  ) => void;
  onPrepare: () => void;
  onSign: () => void;
  onDeny: () => void;
  signed: boolean;
  denialCount: number;
}
const money = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
const isApprovalReady = (proposal: Proposal) =>
  proposal.status !== "held" &&
  proposal.citations.length > 0 &&
  proposal.lines.length > 0 &&
  Math.abs(
    proposal.lines.reduce((sum, line) => sum + line.debit - line.credit, 0),
  ) <= 0.005;
const unresolved = (proposal: Proposal) =>
  proposal.status === "review" ||
  proposal.status === "held" ||
  proposal.status === "rejected";

function Intro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="drawer-section">
      <span className="badge badge-neutral">Demo</span>
      <h2 className="drawer-title">{title}</h2>
      <p className="drawer-copy">{children}</p>
    </div>
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

function Approvals({
  proposals,
  onSelect,
  onApprove,
  onReject,
  signed,
}: Pick<
  WorkspaceDrawerProps,
  "proposals" | "onSelect" | "onApprove" | "onReject" | "signed"
>) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pending = proposals.filter(
    (proposal) => proposal.status === "review" || proposal.status === "held",
  );
  const reject = (id: string) => {
    const instruction = notes[id]?.trim();
    if (!instruction) {
      setErrors((previous) => ({
        ...previous,
        [id]: "Add a short instruction before returning this item.",
      }));
      return;
    }
    onReject(id, instruction);
    setErrors((previous) => ({ ...previous, [id]: "" }));
  };
  return (
    <>
      <Intro title="Review payments">
        {pending.length
          ? `${pending.length} ${pending.length === 1 ? "item needs" : "items need"} your decision.`
          : "You’re all caught up."}
      </Intro>
      <div className="drawer-list">
        {pending.length === 0 && (
          <div className="empty-state">
            <CircleCheck size={28} />
            <h3>No items to review</h3>
            <p>Return to the workspace to continue your close.</p>
          </div>
        )}
        {pending.map((proposal) => (
          <article className="drawer-card" key={proposal.id}>
            <div className="drawer-card-head">
              <h3>{proposal.vendor}</h3>
              <strong>{money(proposal.amount)}</strong>
            </div>
            <span
              className={`badge ${proposal.status === "held" ? "badge-amber" : "badge-neutral"}`}
            >
              {proposal.status === "held" ? "Payment held" : "Needs review"}
            </span>
            <p className="drawer-copy">{proposal.description}</p>
            <button
              className="text-button"
              onClick={() => onSelect(proposal.id)}
            >
              Review evidence <ArrowRight size={14} />
            </button>
            <details>
              <summary>Make a decision</summary>
              <label className="form-field">
                <span>Your note</span>
                <textarea
                  className="textarea"
                  rows={2}
                  value={notes[proposal.id] ?? ""}
                  placeholder="Add context or an instruction…"
                  onChange={(event) => {
                    setNotes((previous) => ({
                      ...previous,
                      [proposal.id]: event.target.value,
                    }));
                    setErrors((previous) => ({
                      ...previous,
                      [proposal.id]: "",
                    }));
                  }}
                  aria-invalid={Boolean(errors[proposal.id])}
                  aria-describedby={
                    errors[proposal.id] ? `error-${proposal.id}` : undefined
                  }
                />
              </label>
              {errors[proposal.id] && (
                <p
                  className="warning-notice"
                  role="alert"
                  id={`error-${proposal.id}`}
                >
                  {errors[proposal.id]}
                </p>
              )}
              <div className="drawer-row">
                <button
                  className="primary-button"
                  disabled={signed || !isApprovalReady(proposal)}
                  onClick={() => {
                    if (!signed && isApprovalReady(proposal))
                      onApprove(
                        proposal.id,
                        notes[proposal.id]?.trim() || "Reviewed and approved.",
                      );
                  }}
                >
                  <Check size={15} />
                  {proposal.status === "held"
                    ? "Release unavailable"
                    : isApprovalReady(proposal)
                      ? "Approve"
                      : "Investigation required"}
                </button>
                <button
                  className="secondary-button"
                  disabled={signed}
                  onClick={() => reject(proposal.id)}
                >
                  {proposal.status === "held"
                    ? "Keep hold"
                    : "Return for revision"}
                </button>
              </div>
              {proposal.status === "held" && (
                <p className="drawer-label">
                  Bank verification is unavailable. Keep the payment held until
                  independently confirmed.
                </p>
              )}
              {proposal.status !== "held" && !isApprovalReady(proposal) && (
                <p className="drawer-label">
                  A balanced entry and supporting evidence are needed before
                  approval.
                </p>
              )}
            </details>
          </article>
        ))}
      </div>
    </>
  );
}

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

function Scoreboard({
  proposals,
  period,
  onPrepare,
  onSign,
  signed,
}: Pick<
  WorkspaceDrawerProps,
  "proposals" | "period" | "onPrepare" | "onSign" | "signed"
>) {
  const [routineMinutes, setRoutineMinutes] = useState(3);
  const [exceptionMinutes, setExceptionMinutes] = useState(20);
  const [escalationMinutes, setEscalationMinutes] = useState(15);
  const [prepared, setPrepared] = useState(false);
  const pending = proposals.filter(unresolved).length;
  const posted = proposals.filter(
    (proposal) => proposal.status === "posted",
  ).length;
  const baselineMinutes =
    106 * routineMinutes + 11 * exceptionMinutes + escalationMinutes;
  const savedHours = Math.max(0, (baselineMinutes - escalationMinutes) / 60);
  return (
    <>
      <Intro title="Close summary">Your progress for {period}.</Intro>
      <div className="drawer-stat-grid">
        <div className="drawer-stat">
          <span className="drawer-label">Completed</span>
          <strong>
            {posted}
            <small> / {proposals.length}</small>
          </strong>
        </div>
        <div className="drawer-stat">
          <span className="drawer-label">To review</span>
          <strong>{pending}</strong>
        </div>
        <div className="drawer-stat">
          <span className="drawer-label">Est. time saved</span>
          <strong>
            {savedHours.toFixed(1)}
            <small> hrs</small>
          </strong>
        </div>
      </div>
      <section className="drawer-card">
        <div className="drawer-card-head">
          <h3>{signed ? "Period signed" : "Finish this close"}</h3>
          {signed ? <CircleCheck size={22} /> : <LockKeyhole size={22} />}
        </div>
        <p className="drawer-copy">
          {signed
            ? "This period is locked."
            : pending
              ? `${pending} unresolved ${pending === 1 ? "item remains" : "items remain"} before you can sign.`
              : "Everything is reviewed. You can sign this period."}
        </p>
        <div className="drawer-row">
          <button
            className="secondary-button"
            disabled={signed || prepared}
            onClick={() => {
              onPrepare();
              setPrepared(true);
            }}
          >
            <Sparkles size={15} />
            {prepared ? "Close prepared" : "Prepare close"}
          </button>
          <button
            className="primary-button"
            disabled={signed || pending > 0}
            onClick={onSign}
          >
            <CheckCheck size={15} />
            {signed ? "Signed" : "Sign period"}
          </button>
        </div>
        {prepared && (
          <p className="success-notice" role="status">
            Close prepared. Review any remaining items in the workspace.
          </p>
        )}
      </section>
      <details className="drawer-card">
        <summary>View calculations and progress</summary>
        <h3>Fewer questions each month</h3>
        <div
          className="chart-bars"
          aria-label="Example escalations: July five, August two, September one"
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
          Illustrative monthly escalations · July–September 2026
        </p>
        <h3>Time saved assumptions</h3>
        <p className="drawer-copy">
          106 routine transactions, 11 exceptions, and 1 escalation. Edit
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
        <p className="citation-quote">
          Manual time: (106 × {routineMinutes} + 11 × {exceptionMinutes} +{" "}
          {escalationMinutes}) ÷ 60 = {(baselineMinutes / 60).toFixed(1)} hours.
          Less {(escalationMinutes / 60).toFixed(2)} hours of controller time ={" "}
          {savedHours.toFixed(1)} estimated hours saved.
        </p>
        <p className="drawer-label">
          Planning estimate; excludes setup and review overhead.
        </p>
      </details>
      <details className="drawer-card">
        <summary>View test scenarios and impact</summary>
        <p className="drawer-label">Fixture scenarios · expected outcomes</p>
        <table aria-label="Expected test scenario outcomes">
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
          Precision and recall: <strong>Pending live scoring.</strong>
        </p>
        <p className="drawer-copy">
          Repeat mistakes: <strong>0</strong> in the seeded example.
        </p>
        <p className="citation-quote">
          <strong>$69,500</strong> illustrative dollars protected: $42,000
          payment hold + $18,500 duplicate invoice + $9,000 misclassification.
        </p>
        <p className="drawer-label">
          Expected outcomes and illustrative impact, not measured cash savings.
        </p>
      </details>
    </>
  );
}

function Permissions({
  onDeny,
  denialCount,
}: Pick<WorkspaceDrawerProps, "onDeny" | "denialCount">) {
  const [attempted, setAttempted] = useState(false);
  const seats = [
    {
      title: "Auditor",
      description: "Finds mismatches and suggests what to do.",
      badge: "Can propose",
      icon: BookOpen,
    },
    {
      title: "Controls",
      description: "Checks the rules before recording an entry.",
      badge: "Can post",
      icon: ShieldCheck,
    },
    {
      title: "You",
      description: "Review exceptions and sign the completed close.",
      badge: "Can approve",
      icon: CheckCheck,
    },
  ];
  return (
    <>
      <Intro title="How approvals work">
        Auditor prepares the work. You make the final decisions.
      </Intro>
      <div className="drawer-list">
        {seats.map(({ title, description, badge, icon: Icon }) => (
          <section className="drawer-card" key={title}>
            <div className="drawer-card-head">
              <h3>
                <Icon size={18} />
                {title}
              </h3>
              <span className="badge badge-neutral">{badge}</span>
            </div>
            <p className="drawer-copy">{description}</p>
          </section>
        ))}
      </div>
      <details className="drawer-card">
        <summary>View permissions and policies</summary>
        {permissionGroups.map((group) => (
          <section className="drawer-section" key={group.identity}>
            <h3>{group.title}</h3>
            <p className="drawer-label">{group.restriction}</p>
            <table aria-label={`${group.title} tools`}>
              <thead>
                <tr>
                  <th scope="col">Allowed tool</th>
                  <th scope="col">Access</th>
                </tr>
              </thead>
              <tbody>
                {group.tools.map((tool) => (
                  <tr className="permission-row" key={tool}>
                    <td>
                      <code>{tool}</code>
                    </td>
                    <td>
                      <Check size={13} aria-label="Allowed" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <h3>Control policies</h3>
        <table aria-label="Control policies">
          <thead>
            <tr>
              <th scope="col">Rule</th>
              <th scope="col">What it checks</th>
              <th scope="col">Example count</th>
            </tr>
          </thead>
          <tbody>
            {controlPolicyRules.map((rule, index) => (
              <tr className="permission-row" key={rule.clause}>
                <td>{rule.clause}</td>
                <td>
                  <strong>{rule.title}</strong>
                  <p className="drawer-label">{rule.description}</p>
                </td>
                <td>{[1, 2, 2, 0, 2][index]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="drawer-label">Firing counts are illustrative.</p>
      </details>
      <details className="drawer-card">
        <summary>Advanced: test posting access</summary>
        <p className="drawer-copy">
          Try posting as the proposing agent. The simulated check should refuse
          it.
        </p>
        <button
          className="secondary-button"
          onClick={() => {
            setAttempted(true);
            onDeny();
          }}
        >
          <LockKeyhole size={15} />
          Attempt agent post
        </button>
        {attempted && (
          <p className="warning-notice" role="status">
            <ShieldX size={16} />
            Permission denied. Simulated test; no entry was posted.
          </p>
        )}
        <p className="drawer-label">
          {denialCount} simulated {denialCount === 1 ? "denial" : "denials"}.
        </p>
      </details>
    </>
  );
}

function Inject({
  onInject,
  signed,
}: Pick<WorkspaceDrawerProps, "onInject" | "signed">) {
  const [kind, setKind] = useState("bank_transaction");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess("");
    if (signed) {
      setError("This period is locked. Choose an open period.");
      return;
    }
    if (!vendor.trim()) {
      setError("Enter a vendor or counterparty.");
      return;
    }
    const value = Number(amount);
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
    onInject(kind, vendor.trim(), Math.round(value * 100) / 100, note.trim());
    setError("");
    setSuccess("Added to the review queue.");
    setVendor("");
    setAmount("");
    setNote("");
  };
  return (
    <>
      <Intro title="Add a test scenario">
        Try a new transaction or change. Use fictional information.
      </Intro>
      <form className="drawer-card" onSubmit={submit}>
        <label className="form-field">
          <span>Scenario type</span>
          <select
            className="input"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setSuccess("");
            }}
          >
            <option value="bank_transaction">Bank transaction</option>
            <option value="contract_amendment">Contract amendment</option>
            <option value="vendor_bank_change">Vendor bank change</option>
          </select>
        </label>
        <label className="form-field">
          <span>Vendor or counterparty</span>
          <input
            className="input"
            required
            maxLength={100}
            value={vendor}
            onChange={(event) => setVendor(event.target.value)}
            placeholder="e.g. Meridian Production"
            autoComplete="off"
          />
        </label>
        <label className="form-field">
          <span>Amount · USD</span>
          <input
            className="input"
            required
            type="number"
            min="0.01"
            max="100000000"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
          />
        </label>
        <label className="form-field">
          <span>What changed?</span>
          <textarea
            className="textarea"
            required
            rows={3}
            minLength={10}
            maxLength={1500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Describe the transaction or change…"
          />
        </label>
        {kind === "vendor_bank_change" && (
          <p className="drawer-label">
            Bank changes require review. Don’t enter real account details.
          </p>
        )}
        {error && (
          <p className="warning-notice" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="success-notice" role="status">
            <CircleCheck size={15} />
            {success}
          </p>
        )}
        {signed && (
          <p className="warning-notice" role="status">
            This period is locked. Choose an open period.
          </p>
        )}
        <button className="primary-button" type="submit" disabled={signed}>
          {signed ? <LockKeyhole size={15} /> : <Plus size={15} />}
          {signed ? "Period locked" : "Add scenario"}
        </button>
      </form>
    </>
  );
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  sources?: string[];
}
interface SpeechAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechResult {
  readonly length: number;
  readonly isFinal: boolean;
  readonly [index: number]: SpeechAlternative;
}
interface SpeechResultList {
  readonly length: number;
  readonly [index: number]: SpeechResult;
}
interface RecognitionResultEvent {
  readonly resultIndex: number;
  readonly results: SpeechResultList;
}
interface RecognitionErrorEvent {
  readonly error: string;
  readonly message?: string;
}
interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
interface SpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition;
}
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const suggestedQuestions = [
  "Why was Apex expensed?",
  "Why is Field & Flame on hold?",
  "What changed with Stripe?",
];
function answerQuestion(
  question: string,
): Pick<ChatMessage, "text" | "sources"> {
  const text = question.toLowerCase();
  if (/field|flame|hold|bank/.test(text))
    return {
      text: "Field & Flame changed its bank details before a $42,000 payment. Policy 4.3 requires a hold and controller review. Bank verification is unavailable, so the payment remains held in account 1400.",
      sources: ["policy-4.3"],
    };
  if (
    /stripe|learn|precedent/.test(text) &&
    !/apex|deposit|inspection/.test(text)
  )
    return {
      text: "The $1,420 difference between Stripe’s gross receipts and net deposit is processing fees. July’s reviewed decision can be reused for matching payouts when all controls pass.",
      sources: ["D-0408"],
    };
  if (/sound|duplicate|mistake|correction/.test(text))
    return {
      text: "SoundWave invoice SW-1042 was recorded twice. Void the duplicate $18,500 entry and keep the original payable. This exception needs controller approval.",
      sources: ["SW-1042"],
    };
  if (/apex|deposit|inspection|fee|2400|2,400/.test(text))
    return {
      text: "Apex returned $13,600 of a $16,000 deposit. Its contract makes the $2,400 inspection fee non-recoverable, so it is expensed under policy 5.1, following decision D-0417.",
      sources: ["apex-9.4", "policy-5.1", "D-0417"],
    };
  if (/post|permission|agent|approve/.test(text))
    return {
      text: "Auditor proposes entries, controls check and post eligible entries, and you approve exceptions. The proposing agent cannot post its own work.",
    };
  return {
    text: "I can help with the sample Apex deposit, Field & Flame hold, Stripe fees, and SoundWave duplicate. Ask about one of these to explore its supporting context.",
  };
}
function Ask() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const sequence = useRef(0);
  const speechAvailable =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const speechWindow =
    typeof window !== "undefined" ? (window as SpeechWindow) : undefined;
  const Recognition =
    speechWindow?.SpeechRecognition ?? speechWindow?.webkitSpeechRecognition;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);
  useEffect(
    () => () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
      }
    },
    [],
  );
  const toggleMicrophone = () => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    if (!Recognition) {
      setVoiceStatus(
        "Voice input is unavailable in this browser. Type your question instead.",
      );
      return;
    }
    const previousRecognition = recognitionRef.current;
    if (previousRecognition) {
      previousRecognition.onresult = null;
      previousRecognition.onerror = null;
      previousRecognition.onend = null;
      previousRecognition.abort();
    }
    if (speechAvailable) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    const prefix = question.trim();
    let receivedTranscript = false;
    let failed = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(
        { length: event.results.length },
        (_, index) => event.results[index][0]?.transcript ?? "",
      )
        .join(" ")
        .trim();
      receivedTranscript = receivedTranscript || Boolean(transcript);
      setQuestion(
        [prefix, transcript].filter(Boolean).join(" ").slice(0, 1000),
      );
      setVoiceStatus(
        "Listening… your transcript is appearing in the question field.",
      );
    };
    recognition.onerror = (event) => {
      failed = true;
      setListening(false);
      const errors: Record<string, string> = {
        "not-allowed":
          "Microphone permission was denied. Allow microphone access in your browser or type your question.",
        "service-not-allowed":
          "Your browser does not allow speech recognition here. Type your question instead.",
        "audio-capture":
          "No microphone is available. Connect one or type your question.",
        network:
          "The browser speech service is unavailable. Try again or type your question.",
        "no-speech": "No speech was detected. Try again or type your question.",
        aborted:
          "Voice input stopped. You can edit the transcript or type your question.",
      };
      setVoiceStatus(
        errors[event.error] ??
          "Voice input could not finish. Try again or type your question.",
      );
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setListening(false);
      if (!failed)
        setVoiceStatus(
          receivedTranscript
            ? "Transcript ready. Review it, then select Ask Auditor to send."
            : "No transcript captured. Try again or type your question.",
        );
    };
    try {
      recognition.start();
      setListening(true);
      setVoiceStatus(
        "Listening… speak your question. Select Stop listening when you’re done.",
      );
    } catch {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognitionRef.current = null;
      setListening(false);
      setVoiceStatus(
        "Voice input could not start. Check your browser microphone permission or type your question.",
      );
    }
  };
  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    }
    setListening(false);
    setVoiceStatus("");
    const answer = answerQuestion(trimmed);
    const id = sequence.current++;
    setMessages((previous) => [
      ...previous,
      { id: id * 2, role: "user", text: trimmed },
      { id: id * 2 + 1, role: "assistant", ...answer },
    ]);
    setQuestion("");
  };
  const read = (text: string) => {
    if (!speechAvailable) return;
    window.speechSynthesis.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };
  return (
    <>
      <Intro title="Ask Auditor">Ask about a payment or a past decision.</Intro>
      {messages.length === 0 && (
        <div className="drawer-list">
          {suggestedQuestions.map((suggestion) => (
            <button
              className="suggestion-button"
              key={suggestion}
              onClick={() => send(suggestion)}
            >
              {suggestion}
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
      )}
      <div
        className="drawer-list"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
      >
        {messages.map((message) => (
          <article className={`chat-message ${message.role}`} key={message.id}>
            <span className="drawer-kicker">
              {message.role === "user" ? "You" : "Auditor"}
            </span>
            <p>{message.text}</p>
            {message.sources && (
              <details>
                <summary>
                  View {message.sources.length}{" "}
                  {message.sources.length === 1 ? "source" : "sources"}
                </summary>
                {message.sources.map((id) => {
                  const source = sourceMemory.find((item) => item.id === id);
                  return source ? (
                    <div className="citation-quote" key={id}>
                      <strong>{source.title}</strong>
                      <p>{source.quote ?? source.text}</p>
                      <span className="drawer-label">
                        {id} ·{" "}
                        {source.quote ? "Source excerpt" : "Source summary"}
                      </span>
                    </div>
                  ) : null;
                })}
              </details>
            )}
            {message.role === "assistant" && speechAvailable && (
              <button
                className="text-button"
                aria-label={
                  speaking ? "Stop reading answer" : "Read answer aloud"
                }
                onClick={() => read(message.text)}
              >
                {speaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                {speaking ? "Stop" : "Read aloud"}
              </button>
            )}
          </article>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="drawer-card"
        onSubmit={(event) => {
          event.preventDefault();
          send(question);
        }}
      >
        <label className="form-field">
          <span>Your question</span>
          <textarea
            className="textarea"
            rows={3}
            maxLength={1000}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What would you like to know?"
            aria-describedby="voice-input-status"
          />
        </label>
        <div className="drawer-row">
          <button
            className="secondary-button"
            type="button"
            disabled={!Recognition}
            onClick={toggleMicrophone}
            aria-pressed={listening}
          >
            {listening ? <MicOff size={15} /> : <Mic size={15} />}
            {!Recognition
              ? "Voice unavailable"
              : listening
                ? "Stop listening"
                : "Speak"}
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={!question.trim() || listening}
          >
            <Send size={15} />
            Ask Auditor
          </button>
        </div>
        <p className="drawer-label" role="status" id="voice-input-status">
          {!Recognition
            ? "Voice isn’t available in this browser. You can type instead."
            : voiceStatus || "Review your transcript before sending."}
        </p>
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

function Activity({
  proposals,
  period,
  signed,
  denialCount,
}: Pick<
  WorkspaceDrawerProps,
  "proposals" | "period" | "signed" | "denialCount"
>) {
  const events = proposals
    .flatMap((proposal) =>
      proposal.audit.map((event, index) => ({
        ...event,
        proposal,
        key: `${proposal.id}-${index}`,
      })),
    )
    .reverse();
  const renderEvents = (items: typeof events) =>
    items.map((event) => (
      <details className="drawer-card" key={event.key}>
        <summary>
          <span>{event.title}</span>
          <span className="drawer-label">
            {event.proposal.vendor} · {event.time}
          </span>
        </summary>
        <p className="drawer-copy">{event.detail}</p>
        <span className="drawer-label">
          {event.proposal.decisionId} · {event.proposal.status}
        </span>
      </details>
    ));
  return (
    <>
      <Intro title="Activity">Recent updates for {period}.</Intro>
      {signed && (
        <p className="success-notice">
          <CheckCheck size={16} />
          Period signed and locked.
        </p>
      )}
      {denialCount > 0 && (
        <p className="drawer-label">
          {denialCount} simulated agent posting{" "}
          {denialCount === 1 ? "attempt denied" : "attempts denied"}.
        </p>
      )}
      <div className="drawer-list">{renderEvents(events.slice(0, 6))}</div>
      {events.length > 6 && (
        <details className="drawer-card">
          <summary>View {events.length - 6} earlier updates</summary>
          <div className="drawer-list">{renderEvents(events.slice(6))}</div>
        </details>
      )}
      {events.length === 0 && (
        <div className="empty-state">
          <FileText size={26} />
          <h3>No updates yet</h3>
        </div>
      )}
    </>
  );
}

export default function WorkspaceDrawer(props: WorkspaceDrawerProps) {
  if (props.type === "approvals") return <Approvals {...props} />;
  if (props.type === "scoreboard") return <Scoreboard {...props} />;
  if (props.type === "permissions") return <Permissions {...props} />;
  if (props.type === "inject") return <Inject {...props} />;
  if (props.type === "ask") return <Ask />;
  if (props.type === "memory") return <Memory />;
  return <Activity {...props} />;
}
