# Phase 3 frontend rehearsal

This is a storyboard and rehearsal guide. **No demo video was recorded for this change.**

Use the clearly labelled **Demo** workspace for the sequence below. Its answers and decisions are fictional fixtures. Keep the mode badge visible; do not present sample precedent `D-0417` as actual shared-deployment memory.

| Time    | Screen and action                                                                        | Suggested narration                                                                                                           |
| ------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 0–8 s   | Open September’s Apex record; show the shortfall and supporting documents.               | “A deposit came back short. Auditor brings the treatment and its sources together.”                                           |
| 8–18 s  | Open Ask Auditor, click **Speak**, and ask: “Why isn’t the Apex shortfall a receivable?” | “Ask in your own words, or type the same question.”                                                                           |
| 18–25 s | Click **Stop**. Review and edit the transcript before sending.                           | “The microphone fills a draft. You choose when to send.”                                                                      |
| 25–40 s | Click **Send question**. Read the visible answer and expand its three source cards.      | “This sample explains the inspection fee using `D-0417`, `apex-9.4`, and `policy-5.1`. The source passages remain unchanged.” |
| 40–50 s | Click **Read aloud**, then **Stop reading**. Leave the written answer visible.           | “Listen when useful. The answer and its evidence stay on screen.”                                                             |
| 50–60 s | Open the Live workspace’s Ask panel and show its current connection status.              | “Live question answering will use the connected workspace when the backend is ready.”                                         |

Before capture, rehearse microphone permission, transcript editing, and audio volume in the recording browser. If voice input or playback is unavailable, use the typed question and visible answer; the story still works. Close the panel once to check that recording and playback stop.

## Backend dependencies

- **B6:** the current backend has no Ask Auditor action. Live sending stays disabled until an actual `onAsk` callback returns an answer with source IDs and exact citation passages. The frontend does not substitute sample answers in live mode.
- **C3:** live approvals, returns, and signing use the existing server mutations and reactive results. Approval rereads current sources, revisions, and holds before sending. The server must also enforce payment holds inside its approval mutation to cover changes between that read and the mutation. A successful frontend rehearsal does not prove that a real controller action was executed.
- **C5/C6:** live scenario injection and the forbidden agent-post test need their actual backend functions before those scenes can be presented as live. Their current unavailable states should stay visible.
- **A5/A6:** distinguish measured scoring, retrieval statistics, and payee verification from illustrative estimates. Unavailable verification cannot release a held payment.

For a later live recording, verify the intended deployment and real source/decision memory first. Show the recorded outcome accurately; a proposed or returned entry must not be narrated as posted. Record no credentials, environment-file contents, or unrelated browser tabs.

Browser behavior follows the Web Speech API: [stop recognition while retaining captured results](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/stop), [abort recognition on close](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/abort), and [cancel speech playback](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/cancel). [Recognition availability varies by browser](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), so keep the text fallback ready.
