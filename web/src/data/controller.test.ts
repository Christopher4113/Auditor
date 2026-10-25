import { describe, expect, it } from "vitest";
import { controllerError } from "./controller";

describe("controller refusal messages", () => {
  it("preserves the server's reason while removing the request wrapper and stack", () => {
    expect(
      controllerError(
        new Error(
          "[Request ID: abc] Server Error\nUncaught Error: 3.0: period 2026-09 is signed and locked\n    at handler (convex/human.ts:25)",
        ),
      ),
    ).toBe("3.0: period 2026-09 is signed and locked");
  });
  it("handles a Convex mutation prefix and structured errors", () => {
    expect(
      controllerError(
        new Error(
          "[CONVEX M(api:approve)] [Request ID: abc] Server Error\nUncaught ConvexError: No citations supplied\n    at approve (x.ts:1)",
        ),
      ),
    ).toBe("No citations supplied");
    expect(controllerError({ message: "The close is still running" })).toBe(
      "The close is still running",
    );
  });
  it("keeps normal language containing 'at' and handles unknown failures", () => {
    expect(controllerError("Add at least one citation")).toBe(
      "Add at least one citation",
    );
    expect(controllerError(undefined)).toMatch(/couldn’t be completed/);
    expect(controllerError(new Error(""))).toMatch(/couldn’t be completed/);
  });
});
