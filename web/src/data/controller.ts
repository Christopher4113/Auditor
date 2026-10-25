/** Keep a refusal's useful rule/message without Convex request IDs or stack traces. */
export function controllerError(error: unknown): string {
  let message = "The action couldn’t be completed. Please try again.";
  if (typeof error === "string") message = error;
  else if (error instanceof Error) message = error.message;
  else if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  )
    message = error.message;
  message = message
    .replace(/^.*?Uncaught (?:Error|ConvexError):\s*/s, "")
    .replace(/^\[CONVEX[^\]]*\]\s*/, "")
    .replace(/^\[Request ID:[^\]]*\]\s*(?:Server Error\s*)?/, "")
    .replace(/(?:\r?\n|\s{2,})at\s+[\s\S]*$/, "")
    .trim();
  return message || "The action couldn’t be completed. Please try again.";
}
