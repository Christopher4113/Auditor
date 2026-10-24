import { useId, useRef, useState } from "react";
import { ArrowRight, Check, LoaderCircle, LockKeyhole } from "lucide-react";
import type { Proposal } from "../data/types";
import { canApproveProposal, canRejectProposal } from "../data/selectors";

export type ReviewCallback = (id: string, note: string) => void | Promise<void>;
export interface ControllerReviewProps {
  proposal: Proposal;
  signed: boolean;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onApprove: ReviewCallback;
  onReject: ReviewCallback;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

export default function ControllerReview({
  proposal,
  signed,
  disabled = false,
  onSelect,
  onApprove,
  onReject,
}: ControllerReviewProps) {
  const id = useId();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [awaitingUpdate, setAwaitingUpdate] = useState(false);
  const inFlight = useRef(false);
  const approveReady = canApproveProposal(proposal);
  const rejectReady = canRejectProposal(proposal);
  const blocked = disabled || signed || busy !== null || awaitingUpdate;

  const submit = async (action: "approve" | "reject") => {
    if (inFlight.current || blocked) return;
    if (action === "approve" && !approveReady) return;
    if (action === "reject" && !rejectReady) return;
    if (action === "reject" && !note.trim()) {
      setError("Add an instruction before returning this item.");
      return;
    }
    inFlight.current = true;
    setBusy(action);
    setError("");
    try {
      await (action === "approve" ? onApprove : onReject)(
        proposal.id,
        note.trim(),
      );
      setAwaitingUpdate(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The request was refused. Your note has been kept.",
      );
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  return (
    <article className="drawer-card" aria-labelledby={`${id}-vendor`}>
      <div className="drawer-card-head">
        <h3 id={`${id}-vendor`}>{proposal.vendor}</h3>
        <strong style={{ fontFamily: "var(--mono)" }}>
          {proposal.sourceBank.available === false
            ? "Amount unavailable"
            : money(proposal.amount)}
        </strong>
      </div>
      <span
        className={`badge ${proposal.status === "held" ? "badge-amber" : "badge-neutral"}`}
      >
        {proposal.status === "held" ? "Payment held" : "Needs review"}
      </span>
      <p className="drawer-copy">
        {proposal.decisionReason || proposal.description}
      </p>
      <button
        className="text-button"
        type="button"
        onClick={() => onSelect(proposal.id)}
      >
        Review evidence
        <ArrowRight size={14} />
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit("approve");
        }}
        aria-busy={busy !== null}
      >
        <label className="form-field" htmlFor={`${id}-note`}>
          <span>Note or return instruction</span>
          <textarea
            id={`${id}-note`}
            className="textarea"
            rows={2}
            value={note}
            maxLength={4000}
            disabled={blocked}
            placeholder="Add context for your decision…"
            onChange={(event) => {
              setNote(event.target.value);
              setError("");
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : `${id}-help`}
          />
        </label>
        <div className="drawer-row">
          <button
            className="primary-button"
            type="submit"
            disabled={blocked || !approveReady}
          >
            {busy === "approve" ? (
              <LoaderCircle size={15} />
            ) : proposal.status === "held" ? (
              <LockKeyhole size={15} />
            ) : (
              <Check size={15} />
            )}
            {busy === "approve"
              ? "Approving…"
              : proposal.status === "held"
                ? "Payment held"
                : approveReady
                  ? "Approve"
                  : "Investigation required"}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={blocked || !rejectReady}
            onClick={() => void submit("reject")}
          >
            {busy === "reject"
              ? "Returning…"
              : proposal.status === "held"
                ? "Keep hold with instruction"
                : "Return for revision"}
          </button>
        </div>
        <p className="drawer-label" id={`${id}-help`}>
          {signed
            ? "This period is signed and locked."
            : disabled
              ? "Wait for the workspace to reconnect or finish its current action."
              : proposal.status === "held"
                ? "The payment stays held until its bank details are independently confirmed."
                : !approveReady
                  ? "Approval needs supporting citations and a balanced entry."
                  : "A return instruction is required so Auditor can revise the proposal."}
        </p>
        {busy && (
          <p className="drawer-label" role="status">
            Sending your decision…
          </p>
        )}
        {awaitingUpdate && (
          <p className="drawer-label" role="status">
            Waiting for the updated record.
          </p>
        )}
        {error && (
          <p className="warning-notice" role="alert" id={`${id}-error`}>
            {error}
          </p>
        )}
      </form>
    </article>
  );
}
