import { initialProposals } from "./demo";

export type AskCitation = {
  sourceType: string;
  sourceId: string;
  /** Exact source passage supplied with the answer. */
  text: string;
  score?: number;
};
export type AskAnswer = { text: string; citations: AskCitation[] };

/** Local, labelled explanations use existing fictional records and exact citations. */
export function demoAskAnswer(question: string): AskAnswer {
  const text = question.toLowerCase();
  const id = /field|flame|hold|bank detail/.test(text)
    ? "field-flame-sep"
    : /stripe|processing|payout/.test(text)
      ? "stripe-sep"
      : /soundwave|duplicate|sw-1042/.test(text)
        ? "soundwave-jul"
        : /apex|receivable|deposit|inspection/.test(text)
          ? "apex-sep"
          : null;
  const proposal = initialProposals.find((item) => item.id === id);
  if (!proposal)
    return {
      text: "The demo can explain the Apex deposit, Field & Flame payment hold, Stripe fees, or SoundWave duplicate. Try asking about one of those records.",
      citations: [],
    };
  return {
    text: `In this sample: ${proposal.description} ${proposal.reason} Sources: ${proposal.citations.map((citation) => citation.sourceId).join(", ")}.`,
    citations: proposal.citations.map((citation) => ({ ...citation })),
  };
}
