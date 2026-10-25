// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AskDrawer from "./AskDrawer";
import { demoAskAnswer } from "../data/ask-demo";
import type { AskAnswer } from "./AskDrawer";
import { initialProposals } from "../data/demo";

const liveAnswer: AskAnswer = {
  text: "The Harbor contract makes its inspection fee non-refundable. The source passage supports recognizing an expense.",
  citations: [
    {
      sourceType: "contract",
      sourceId: "harbor-7.2",
      text: 'Inspection fee: $350.\nThe fee is non-refundable; preserve the "quoted" terms & source text.',
      score: 0.84,
    },
  ],
};

class MockRecognition {
  static instances: MockRecognition[] = [];
  static startError = false;
  lang = "";
  continuous = true;
  interimResults = false;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn(() => {
    if (MockRecognition.startError) throw new Error("Permission unavailable");
  });
  stop = vi.fn();
  abort = vi.fn();
  constructor() {
    MockRecognition.instances.push(this);
  }
}
class MockUtterance {
  text: string;
  lang = "";
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

beforeEach(() => {
  MockRecognition.instances = [];
  MockRecognition.startError = false;
  vi.stubGlobal("SpeechRecognition", undefined);
  vi.stubGlobal("webkitSpeechRecognition", undefined);
  vi.stubGlobal("speechSynthesis", undefined);
  vi.stubGlobal("SpeechSynthesisUtterance", undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const questionField = () =>
  screen.getByRole("textbox", { name: "Your question" }) as HTMLTextAreaElement;
const sendButton = () =>
  screen.getByRole("button", { name: "Send question" }) as HTMLButtonElement;

describe("source-backed answers and workspace boundaries", () => {
  it("keeps demo explanations tied to the existing fixture passages without creating new precedent", () => {
    const apex = initialProposals.find(
      (proposal) => proposal.id === "apex-sep",
    )!;
    const answer = demoAskAnswer("Why isn’t Apex’s shortfall a receivable?");
    expect(answer.text).toContain(apex.reason);
    expect(answer.text).toContain("Sources: D-0417, apex-9.4, policy-5.1.");
    expect(answer.citations).toEqual(apex.citations);
    expect(answer.citations.map((citation) => citation.sourceId)).toEqual([
      "D-0417",
      "apex-9.4",
      "policy-5.1",
    ]);
    expect(demoAskAnswer("Who won the game?").citations).toEqual([]);
  });

  it("lets a suggestion fill an editable draft, then sends only after an explicit click", async () => {
    const user = userEvent.setup();
    const external = vi.fn().mockResolvedValue(liveAnswer);
    render(<AskDrawer mode="demo" onAsk={external} />);
    await user.click(
      screen.getByRole("button", { name: /Why isn’t the Apex shortfall/ }),
    );
    expect(questionField().value).toBe(
      "Why isn’t the Apex shortfall a receivable?",
    );
    expect(screen.getByRole("log").textContent).not.toContain("sample answer");
    await user.click(sendButton());
    expect(await screen.findByText("Auditor · sample answer")).toBeTruthy();
    expect(external).not.toHaveBeenCalled();
    await user.click(screen.getByText("View 3 sources"));
    const source = initialProposals[0].citations[1];
    expect(screen.getByText(source.sourceId)).toBeTruthy();
    expect(screen.getByText(source.text)).toBeTruthy();
  });

  it("keeps a live question editable but blocks unavailable backend submission, including form submission", async () => {
    const user = userEvent.setup();
    render(
      <AskDrawer
        mode="live"
        backendUnavailable="Live answers will be connected soon."
      />,
    );
    await user.type(questionField(), "Why was this posted?");
    expect(sendButton().disabled).toBe(true);
    fireEvent.submit(questionField().closest("form")!);
    expect(
      screen.getByText("Live answers will be connected soon."),
    ).toBeTruthy();
    expect(questionField().value).toBe("Why was this posted?");
    expect(screen.getByRole("log").textContent).toBe("");
    expect(screen.queryByText(/In this sample:/)).toBeNull();
  });

  it("shows the actual asynchronous answer and preserves every source character", async () => {
    const user = userEvent.setup();
    let resolve: (answer: AskAnswer) => void = () => {};
    const onAsk = vi.fn(
      () =>
        new Promise<AskAnswer>((done) => {
          resolve = done;
        }),
    );
    const { container } = render(<AskDrawer mode="live" onAsk={onAsk} />);
    await user.type(questionField(), "  Why is the Harbor fee expensed?  ");
    const button = sendButton();
    await user.click(button);
    await user.click(button);
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk).toHaveBeenCalledWith("Why is the Harbor fee expensed?");
    expect(screen.getByText("Finding the relevant sources…")).toBeTruthy();
    expect(screen.queryByText(liveAnswer.text)).toBeNull();
    await act(async () => {
      resolve(liveAnswer);
    });
    expect(await screen.findByText(liveAnswer.text)).toBeTruthy();
    await user.click(screen.getByText("View 1 source"));
    expect(container.querySelector("blockquote")?.textContent).toBe(
      liveAnswer.citations[0].text,
    );
    expect(screen.queryByText("D-0417")).toBeNull();
  });

  it("retains the question after a failed live request and never substitutes a demo answer", async () => {
    const user = userEvent.setup();
    const onAsk = vi
      .fn()
      .mockRejectedValue(new Error("Provider internals should not be shown"));
    render(<AskDrawer mode="live" onAsk={onAsk} />);
    await user.type(questionField(), "Explain the Apex entry");
    await user.click(sendButton());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(questionField().value).toBe("Explain the Apex entry");
    expect(screen.getByRole("alert").textContent).toContain(
      "ready to edit and retry",
    );
    expect(screen.queryByText(/In this sample:/)).toBeNull();
    expect(screen.queryByText(/Provider internals/)).toBeNull();
    expect(sendButton().disabled).toBe(false);
  });

  it("rejects malformed response data instead of calling it a successful answer", async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn().mockResolvedValue({ text: "", citations: null });
    render(<AskDrawer mode="live" onAsk={onAsk} />);
    await user.type(questionField(), "Explain this entry");
    await user.click(sendButton());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(within(screen.getByRole("log")).queryByText("Auditor")).toBeNull();
  });

  it("does not present an unsupported live answer when the backend supplies no citations", async () => {
    const user = userEvent.setup();
    const onAsk = vi
      .fn()
      .mockResolvedValue({
        text: "Unsupported accounting advice.",
        citations: [],
      });
    render(<AskDrawer mode="live" onAsk={onAsk} />);
    await user.type(questionField(), "What supports this entry?");
    await user.click(sendButton());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Unsupported accounting advice.")).toBeNull();
    expect(questionField().value).toBe("What supports this entry?");
  });

  it("discards an answer that arrives after the selected period changes", async () => {
    const user = userEvent.setup();
    let resolve: (answer: AskAnswer) => void = () => {};
    const onAsk = vi.fn(
      () =>
        new Promise<AskAnswer>((done) => {
          resolve = done;
        }),
    );
    const { rerender } = render(
      <AskDrawer mode="live" period="July 2026" onAsk={onAsk} />,
    );
    await user.type(questionField(), "Explain July");
    await user.click(sendButton());
    rerender(<AskDrawer mode="live" period="September 2026" onAsk={onAsk} />);
    await act(async () => {
      resolve(liveAnswer);
    });
    expect(screen.queryByText(liveAnswer.text)).toBeNull();
    expect(screen.getByRole("log").textContent).toBe("");
    expect(questionField().value).toBe("");
  });

  it("renders safely without browser globals and always provides a typed fallback", () => {
    vi.stubGlobal("window", undefined);
    try {
      const html = renderToStaticMarkup(<AskDrawer mode="live" />);
      expect(html).toContain("Live answers aren’t connected yet");
      expect(html).toContain("You can type instead");
      expect(html).toContain("textarea");
      expect(html).toContain("Send question");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("explicit voice input", () => {
  it("starts only on click, replaces interim text, and requires sending the reviewed transcript", async () => {
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    const user = userEvent.setup();
    const onAsk = vi.fn().mockResolvedValue(liveAnswer);
    render(<AskDrawer mode="live" onAsk={onAsk} />);
    expect(MockRecognition.instances).toHaveLength(0);
    await user.type(questionField(), "Explain");
    await user.click(screen.getByRole("button", { name: "Start microphone" }));
    const recognition = MockRecognition.instances[0];
    expect(recognition.start).toHaveBeenCalledOnce();
    expect(recognition.lang).toBe("en-US");
    expect(recognition.continuous).toBe(false);
    expect(recognition.interimResults).toBe(true);
    act(() => {
      recognition.onresult?.({ results: [[{ transcript: "the Apex" }]] });
    });
    expect(questionField().value).toBe("Explain the Apex");
    act(() => {
      recognition.onresult?.({
        results: [[{ transcript: "the Apex shortfall" }]],
      });
    });
    expect(questionField().value).toBe("Explain the Apex shortfall");
    expect(sendButton().disabled).toBe(true);
    expect(onAsk).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Stop microphone" }));
    expect(recognition.stop).toHaveBeenCalledOnce();
    act(() => {
      recognition.onend?.();
    });
    expect(screen.getByText(/Transcript ready/)).toBeTruthy();
    expect(onAsk).not.toHaveBeenCalled();
    await user.type(questionField(), " please");
    await user.click(sendButton());
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk).toHaveBeenCalledWith("Explain the Apex shortfall please");
  });

  it("supports the prefixed browser API and can draft voice text while live answers are unavailable", async () => {
    vi.stubGlobal("webkitSpeechRecognition", MockRecognition);
    const user = userEvent.setup();
    render(<AskDrawer mode="live" />);
    await user.click(screen.getByRole("button", { name: "Start microphone" }));
    const recognition = MockRecognition.instances[0];
    act(() => {
      recognition.onresult?.({
        results: [[{ transcript: "Why is this payment held?" }]],
      });
      recognition.onend?.();
    });
    expect(questionField().value).toBe("Why is this payment held?");
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByRole("log").textContent).toBe("");
  });

  it.each([
    ["not-allowed", "Microphone permission was denied"],
    ["audio-capture", "No microphone was found"],
    ["network", "speech service couldn’t connect"],
    ["no-speech", "No speech was detected"],
  ])(
    "handles %s without losing the typed question",
    async (error, expected) => {
      vi.stubGlobal("SpeechRecognition", MockRecognition);
      const user = userEvent.setup();
      render(<AskDrawer mode="demo" />);
      await user.type(questionField(), "Explain Apex");
      await user.click(
        screen.getByRole("button", { name: "Start microphone" }),
      );
      const recognition = MockRecognition.instances[0];
      act(() => {
        recognition.onerror?.({ error });
      });
      expect(screen.getByText(new RegExp(expected))).toBeTruthy();
      expect(questionField().value).toBe("Explain Apex");
      expect(questionField().readOnly).toBe(false);
      expect(recognition.abort).toHaveBeenCalledOnce();
      expect(sendButton().disabled).toBe(false);
    },
  );

  it("recovers when the speech session cannot start", async () => {
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    MockRecognition.startError = true;
    const user = userEvent.setup();
    render(<AskDrawer mode="demo" />);
    await user.click(screen.getByRole("button", { name: "Start microphone" }));
    expect(
      screen.getByText(/Voice input couldn’t start. Check microphone/),
    ).toBeTruthy();
    expect(questionField().readOnly).toBe(false);
    expect(MockRecognition.instances[0].abort).toHaveBeenCalledOnce();
  });

  it("provides text input when recognition is unsupported", async () => {
    const user = userEvent.setup();
    render(<AskDrawer mode="demo" />);
    expect(
      (
        screen.getByRole("button", {
          name: "Start microphone",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.type(questionField(), "Why is Apex expensed?");
    await user.click(sendButton());
    expect(await screen.findByText("Auditor · sample answer")).toBeTruthy();
  });

  it("aborts an active session and detaches its listeners when the drawer closes", async () => {
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    const user = userEvent.setup();
    const { unmount } = render(<AskDrawer mode="demo" />);
    await user.click(screen.getByRole("button", { name: "Start microphone" }));
    const recognition = MockRecognition.instances[0];
    unmount();
    expect(recognition.abort).toHaveBeenCalledOnce();
    expect(recognition.onresult).toBeNull();
    expect(recognition.onerror).toBeNull();
    expect(recognition.onend).toBeNull();
  });
});

describe("optional read-aloud", () => {
  const installSpeech = () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak, cancel });
    vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
    return { speak, cancel };
  };

  it("speaks only on demand, can stop, and always keeps the written answer", async () => {
    const { speak, cancel } = installSpeech();
    const user = userEvent.setup();
    render(
      <AskDrawer mode="live" onAsk={vi.fn().mockResolvedValue(liveAnswer)} />,
    );
    await user.type(questionField(), "Explain Harbor");
    await user.click(sendButton());
    expect(await screen.findByText(liveAnswer.text)).toBeTruthy();
    expect(speak).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Read answer aloud" }));
    const utterance = speak.mock.calls[0][0] as MockUtterance;
    expect(utterance.text).toBe(liveAnswer.text);
    expect(utterance.lang).toBe("en-US");
    const beforeStop = cancel.mock.calls.length;
    await user.click(
      screen.getByRole("button", { name: "Stop reading answer" }),
    );
    expect(cancel.mock.calls.length).toBe(beforeStop + 1);
    expect(screen.getByText(liveAnswer.text)).toBeTruthy();
  });

  it("cancels playback before a newer question, on answer arrival, and when the panel closes", async () => {
    const { speak, cancel } = installSpeech();
    const user = userEvent.setup();
    let resolveNext: (answer: AskAnswer) => void = () => {};
    const onAsk = vi
      .fn()
      .mockResolvedValueOnce(liveAnswer)
      .mockImplementationOnce(
        () =>
          new Promise<AskAnswer>((done) => {
            resolveNext = done;
          }),
      );
    const { unmount } = render(<AskDrawer mode="live" onAsk={onAsk} />);
    await user.type(questionField(), "Explain Harbor");
    await user.click(sendButton());
    await user.click(
      await screen.findByRole("button", { name: "Read answer aloud" }),
    );
    const utterance = speak.mock.calls[0][0] as MockUtterance;
    const beforeNext = cancel.mock.calls.length;
    await user.type(questionField(), "Explain another entry");
    await user.click(sendButton());
    expect(cancel.mock.calls.length).toBeGreaterThan(beforeNext);
    expect(utterance.onend).toBeNull();
    expect(utterance.onerror).toBeNull();
    await user.click(screen.getByRole("button", { name: "Read answer aloud" }));
    const replay = speak.mock.calls[1][0] as MockUtterance;
    const beforeAnswer = cancel.mock.calls.length;
    await act(async () => {
      resolveNext({ ...liveAnswer, text: "The second answer has arrived." });
    });
    expect(cancel.mock.calls.length).toBeGreaterThan(beforeAnswer);
    expect(replay.onend).toBeNull();
    expect(replay.onerror).toBeNull();
    expect(screen.getByText("The second answer has arrived.")).toBeTruthy();
    const beforeClose = cancel.mock.calls.length;
    unmount();
    expect(cancel.mock.calls.length).toBe(beforeClose + 1);
  });

  it("keeps text available and explains a playback failure", async () => {
    const { speak } = installSpeech();
    speak.mockImplementation(() => {
      throw new Error("No audio device");
    });
    const user = userEvent.setup();
    render(
      <AskDrawer mode="live" onAsk={vi.fn().mockResolvedValue(liveAnswer)} />,
    );
    await user.type(questionField(), "Explain Harbor");
    await user.click(sendButton());
    await user.click(
      await screen.findByRole("button", { name: "Read answer aloud" }),
    );
    expect(screen.getByText(/Read-aloud couldn’t start/)).toBeTruthy();
    expect(screen.getByText(liveAnswer.text)).toBeTruthy();
  });
});
