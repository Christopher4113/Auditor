import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  LoaderCircle,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { demoAskAnswer } from "../data/ask-demo";
import type { AskAnswer, AskCitation } from "../data/ask-demo";
import "./AskDrawer.css";

export type { AskAnswer, AskCitation } from "../data/ask-demo";
export interface AskDrawerProps {
  mode: "demo" | "live";
  period?: string;
  onAsk?: (question: string) => Promise<AskAnswer>;
  backendUnavailable?: string;
}

interface RecognitionEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
interface RecognitionConstructor {
  new (): BrowserRecognition;
}
type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};
type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  citations?: AskCitation[];
};

const suggestions = [
  "Why isn’t the Apex shortfall a receivable?",
  "Why is Field & Flame on hold?",
  "What changed with Stripe?",
];
const recognitionErrors: Record<string, string> = {
  "not-allowed":
    "Microphone permission was denied. You can type your question instead.",
  "service-not-allowed":
    "Voice input isn’t available here. You can type your question instead.",
  "audio-capture":
    "No microphone was found. Connect one, or type your question.",
  network:
    "The browser’s speech service couldn’t connect. You can type your question instead.",
  "no-speech": "No speech was detected. Try again, or type your question.",
  aborted: "Voice input stopped. You can edit your question below.",
};

function checkedAnswer(answer: AskAnswer, requireSources: boolean): AskAnswer {
  if (
    !answer ||
    typeof answer.text !== "string" ||
    !answer.text.trim() ||
    !Array.isArray(answer.citations) ||
    (requireSources && answer.citations.length === 0) ||
    !answer.citations.every(
      (citation) =>
        citation &&
        typeof citation.sourceType === "string" &&
        typeof citation.sourceId === "string" &&
        Boolean(citation.sourceId.trim()) &&
        typeof citation.text === "string" &&
        Boolean(citation.text.trim()),
    )
  )
    throw new Error("The answer did not include readable response data.");
  return {
    text: answer.text,
    citations: answer.citations.map((citation) => ({ ...citation })),
  };
}

function detachRecognition(recognition: BrowserRecognition | null) {
  if (!recognition) return;
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
  try {
    recognition.abort();
  } catch {
    // Some browsers throw if an already-ended session is aborted.
  }
}

/** A mode/period change starts a separate session, including its browser resources. */
export default function AskDrawer(props: AskDrawerProps) {
  return <AskSession key={`${props.mode}:${props.period ?? ""}`} {...props} />;
}

function AskSession({
  mode,
  period,
  onAsk,
  backendUnavailable,
}: AskDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [audioStatus, setAudioStatus] = useState("");
  const resourcesRef = useRef<{
    recognition: BrowserRecognition | null;
    utterance: SpeechSynthesisUtterance | null;
  }>({ recognition: null, utterance: null });
  const requestRef = useRef(0);
  const sequenceRef = useRef(0);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const questionId = useId();
  const voiceId = useId();
  const speechWindow =
    typeof window === "undefined" ? undefined : (window as SpeechWindow);
  const Recognition =
    speechWindow?.SpeechRecognition ?? speechWindow?.webkitSpeechRecognition;
  const synthesis = speechWindow?.speechSynthesis;
  const Utterance =
    typeof SpeechSynthesisUtterance === "undefined"
      ? undefined
      : SpeechSynthesisUtterance;
  const speechAvailable = Boolean(synthesis && Utterance);
  const unavailable =
    mode === "live"
      ? backendUnavailable ||
        (!onAsk
          ? "Live answers aren’t connected yet. You can draft a question below, or explore the sources in a transaction."
          : "")
      : "";

  const cancelSpeech = () => {
    if (resourcesRef.current.utterance) {
      resourcesRef.current.utterance.onend = null;
      resourcesRef.current.utterance.onerror = null;
      resourcesRef.current.utterance = null;
    }
    synthesis?.cancel();
    setSpeakingId(null);
  };

  useEffect(() => {
    const resources = resourcesRef.current;
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      detachRecognition(resources.recognition);
      resources.recognition = null;
      if (resources.utterance) {
        resources.utterance.onend = null;
        resources.utterance.onerror = null;
        resources.utterance = null;
      }
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);

  const toggleMicrophone = () => {
    if (busyRef.current) return;
    if (listening && resourcesRef.current.recognition) {
      try {
        resourcesRef.current.recognition.stop();
      } catch {
        detachRecognition(resourcesRef.current.recognition);
        resourcesRef.current.recognition = null;
        setListening(false);
        setVoiceStatus(
          "Voice input stopped. Review and edit your question below.",
        );
      }
      return;
    }
    if (!Recognition) {
      setVoiceStatus(
        "Voice input isn’t available in this browser. You can type instead.",
      );
      return;
    }
    detachRecognition(resourcesRef.current.recognition);
    cancelSpeech();
    setAudioStatus("");
    let recognition: BrowserRecognition;
    try {
      recognition = new Recognition();
    } catch {
      setVoiceStatus(
        "Voice input couldn’t start. You can type your question instead.",
      );
      return;
    }
    resourcesRef.current.recognition = recognition;
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    const prefix = question.trim();
    let receivedTranscript = false;
    recognition.onresult = (event) => {
      if (resourcesRef.current.recognition !== recognition) return;
      const transcript = Array.from(
        event.results,
        (result) => result[0]?.transcript ?? "",
      )
        .join(" ")
        .trim();
      receivedTranscript ||= Boolean(transcript);
      setQuestion(
        [prefix, transcript].filter(Boolean).join(" ").slice(0, 1000),
      );
      setVoiceStatus(
        "Listening… your words are appearing in the question field.",
      );
    };
    recognition.onerror = (event) => {
      if (resourcesRef.current.recognition !== recognition) return;
      resourcesRef.current.recognition = null;
      detachRecognition(recognition);
      setListening(false);
      setVoiceStatus(
        recognitionErrors[event.error] ??
          "Voice input couldn’t finish. You can edit your question or type instead.",
      );
    };
    recognition.onend = () => {
      if (resourcesRef.current.recognition !== recognition) return;
      resourcesRef.current.recognition = null;
      setListening(false);
      setVoiceStatus(
        receivedTranscript
          ? "Transcript ready. Review it, then select Send question."
          : "No transcript captured. Try again, or type your question.",
      );
    };
    try {
      recognition.start();
      setListening(true);
      setVoiceStatus(
        "Listening… select Stop when you’re done. Nothing is sent until you choose Send question.",
      );
    } catch {
      resourcesRef.current.recognition = null;
      detachRecognition(recognition);
      setListening(false);
      setVoiceStatus(
        "Voice input couldn’t start. Check microphone access, or type your question instead.",
      );
    }
  };

  const sendQuestion = async () => {
    const trimmed = question.trim();
    if (
      !trimmed ||
      busyRef.current ||
      listening ||
      unavailable ||
      (mode === "live" && !onAsk)
    )
      return;
    detachRecognition(resourcesRef.current.recognition);
    resourcesRef.current.recognition = null;
    cancelSpeech();
    setAudioStatus("");
    setError("");
    setVoiceStatus("");
    const request = ++requestRef.current;
    const questionMessage: Message = {
      id: sequenceRef.current++,
      role: "user",
      text: trimmed,
    };
    setMessages((previous) => [...previous, questionMessage]);
    setQuestion("");
    busyRef.current = true;
    setBusy(true);
    try {
      const answer = checkedAnswer(
        mode === "demo" ? demoAskAnswer(trimmed) : await onAsk!(trimmed),
        mode === "live",
      );
      if (!aliveRef.current || request !== requestRef.current) return;
      cancelSpeech();
      setAudioStatus("");
      setMessages((previous) => [
        ...previous,
        { id: sequenceRef.current++, role: "assistant", ...answer },
      ]);
    } catch {
      if (!aliveRef.current || request !== requestRef.current) return;
      setQuestion(trimmed);
      setError(
        "We couldn’t get an answer. Your question is ready to edit and retry.",
      );
    } finally {
      if (aliveRef.current && request === requestRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const readAnswer = (message: Message) => {
    if (!synthesis || !Utterance) return;
    const stopping = speakingId === message.id;
    cancelSpeech();
    setAudioStatus("");
    if (stopping) return;
    const wasListening = Boolean(resourcesRef.current.recognition);
    detachRecognition(resourcesRef.current.recognition);
    resourcesRef.current.recognition = null;
    setListening(false);
    if (wasListening)
      setVoiceStatus(
        "Voice input stopped. Review your question before sending.",
      );
    try {
      const utterance = new Utterance(message.text);
      utterance.lang = "en-US";
      resourcesRef.current.utterance = utterance;
      const finish = () => {
        if (resourcesRef.current.utterance !== utterance) return;
        resourcesRef.current.utterance = null;
        setSpeakingId(null);
      };
      utterance.onend = finish;
      utterance.onerror = () => {
        finish();
        setAudioStatus(
          "Read-aloud couldn’t finish. The written answer is still available above.",
        );
      };
      synthesis!.speak(utterance);
      setSpeakingId(message.id);
    } catch {
      cancelSpeech();
      setAudioStatus(
        "Read-aloud couldn’t start. The written answer is still available above.",
      );
    }
  };

  return (
    <div className="ask-drawer">
      <header className="ask-intro">
        <div className="ask-intro-meta">
          <span
            className={`ask-mode ${mode === "live" ? "ask-mode-live" : ""}`}
          >
            {mode === "demo" ? "Demo" : "Live workspace"}
          </span>
          {period && <span>{period}</span>}
        </div>
        <h2>Ask Auditor</h2>
        <p>
          A little context goes a long way. Ask about a payment, a source, or a
          decision.
        </p>
      </header>

      {unavailable && (
        <div className="ask-unavailable" role="status">
          <Sparkles size={17} />
          <p>{unavailable}</p>
        </div>
      )}
      {mode === "demo" && (
        <p className="ask-demo-note">
          Sample answers from fictional records. Source passages stay exactly as
          written.
        </p>
      )}

      {messages.length === 0 && (
        <section className="ask-suggestions" aria-label="Suggested questions">
          <span>Try a question</span>
          {suggestions.map((suggestion) => (
            <button
              type="button"
              key={suggestion}
              disabled={busy || listening}
              onClick={() => {
                setQuestion(suggestion);
                setError("");
                questionRef.current?.focus();
              }}
            >
              {suggestion}
              <ArrowUpRight size={15} />
            </button>
          ))}
        </section>
      )}

      <div
        className="ask-conversation"
        role="log"
        aria-label="Ask Auditor conversation"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.map((message) => (
          <article
            className={`ask-message ask-message-${message.role}`}
            key={message.id}
          >
            <span className="ask-message-author">
              {message.role === "user"
                ? "You"
                : mode === "demo"
                  ? "Auditor · sample answer"
                  : "Auditor"}
            </span>
            <p>{message.text}</p>
            {message.role === "assistant" && (
              <>
                {message.citations?.length ? (
                  <details className="ask-sources">
                    <summary>
                      <BookOpen size={14} />
                      <span>
                        View {message.citations.length}{" "}
                        {message.citations.length === 1 ? "source" : "sources"}
                      </span>
                      <ChevronDown size={14} />
                    </summary>
                    <div>
                      {message.citations.map((citation, index) => (
                        <article
                          className="ask-source"
                          key={`${citation.sourceType}:${citation.sourceId}:${index}`}
                        >
                          <span>
                            {citation.sourceType.replaceAll("_", " ")} ·{" "}
                            <strong>{citation.sourceId}</strong>
                          </span>
                          <blockquote>{citation.text}</blockquote>
                        </article>
                      ))}
                    </div>
                  </details>
                ) : (
                  <p className="ask-source-empty">
                    No source passages were supplied for this answer.
                  </p>
                )}
                {speechAvailable && (
                  <button
                    className="ask-read-button"
                    type="button"
                    aria-label={
                      speakingId === message.id
                        ? "Stop reading answer"
                        : "Read answer aloud"
                    }
                    aria-pressed={speakingId === message.id}
                    onClick={() => readAnswer(message)}
                  >
                    {speakingId === message.id ? (
                      <VolumeX size={14} />
                    ) : (
                      <Volume2 size={14} />
                    )}
                    {speakingId === message.id ? "Stop reading" : "Read aloud"}
                  </button>
                )}
              </>
            )}
          </article>
        ))}
        {busy && (
          <p className="ask-waiting" role="status">
            <LoaderCircle size={15} />
            Finding the relevant sources…
          </p>
        )}
        <div ref={endRef} />
      </div>
      {audioStatus && (
        <p className="ask-feedback" role="status">
          {audioStatus}
        </p>
      )}

      <form
        className="ask-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void sendQuestion();
        }}
      >
        <label htmlFor={questionId}>Your question</label>
        <textarea
          ref={questionRef}
          id={questionId}
          rows={3}
          maxLength={1000}
          value={question}
          readOnly={listening || busy}
          onChange={(event) => {
            setQuestion(event.target.value);
            setError("");
          }}
          placeholder="Why isn’t the Apex shortfall a receivable?"
          aria-describedby={voiceId}
        />
        <div className="ask-composer-actions">
          <button
            className={`ask-mic ${listening ? "ask-mic-active" : ""}`}
            type="button"
            disabled={!Recognition || busy}
            aria-label={listening ? "Stop microphone" : "Start microphone"}
            aria-pressed={listening}
            onClick={toggleMicrophone}
          >
            {listening ? <MicOff size={16} /> : <Mic size={16} />}
            {!Recognition ? "Voice unavailable" : listening ? "Stop" : "Speak"}
          </button>
          <button
            className="ask-submit"
            type="submit"
            disabled={
              !question.trim() || busy || listening || Boolean(unavailable)
            }
          >
            {busy ? (
              <LoaderCircle className="ask-spinner" size={15} />
            ) : (
              <Send size={15} />
            )}
            {busy ? "Asking…" : "Send question"}
          </button>
        </div>
        <p id={voiceId} className="ask-voice-status" role="status">
          {!Recognition
            ? "Voice input isn’t available in this browser. You can type instead."
            : voiceStatus ||
              "Voice fills this field. Review your words before sending."}
        </p>
        {error && (
          <p className="ask-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
