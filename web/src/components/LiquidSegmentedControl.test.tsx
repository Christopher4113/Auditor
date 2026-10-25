// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LiquidSegmentedControl from "./LiquidSegmentedControl";

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "touch";
    this.isPrimary = init.isPrimary ?? true;
  }
}

const options = [
  { value: "all", label: "All activity" },
  { value: "attention", label: "Needs attention" },
  { value: "history", label: "Past decisions" },
];
let segmentWidth = 100;
let resizeCallbacks: Array<ResizeObserverCallback> = [];
let captures: Set<number>;
const captureMethods = [
  "setPointerCapture",
  "releasePointerCapture",
  "hasPointerCapture",
] as const;
const originalCaptureMethods = captureMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
);

function rect(left: number, width: number): DOMRect {
  return {
    x: left,
    y: 10,
    left,
    right: left + width,
    top: 10,
    bottom: 54,
    width,
    height: 44,
    toJSON: () => ({}),
  };
}

beforeEach(() => {
  segmentWidth = 100;
  resizeCallbacks = [];
  captures = new Set();
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const group = this.closest('[role="group"]');
      if (!group) return rect(0, 0);
      const buttons = Array.from(group.querySelectorAll("button"));
      if (this === group) return rect(100, buttons.length * segmentWidth);
      const index = buttons.indexOf(this as HTMLButtonElement);
      return index < 0
        ? rect(0, 0)
        : rect(100 + index * segmentWidth, segmentWidth);
    },
  );
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: {
      configurable: true,
      value: (id: number) => captures.add(id),
    },
    releasePointerCapture: {
      configurable: true,
      value: (id: number) => captures.delete(id),
    },
    hasPointerCapture: {
      configurable: true,
      value: (id: number) => captures.has(id),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  captureMethods.forEach((name, index) => {
    const original = originalCaptureMethods[index];
    if (original) Object.defineProperty(HTMLElement.prototype, name, original);
    else
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[
        name
      ];
  });
});

function control(
  overrides: Partial<ComponentProps<typeof LiquidSegmentedControl>> = {},
) {
  const onValueChange = vi.fn();
  const props = {
    options,
    value: "all",
    onValueChange,
    ariaLabel: "Activity filters",
    ...overrides,
  };
  const view = render(<LiquidSegmentedControl {...props} />);
  return {
    ...view,
    props,
    onValueChange,
    group: screen.getByRole("group", { name: "Activity filters" }),
    first: screen.getByRole("button", { name: "All activity" }),
    second: screen.getByRole("button", { name: "Needs attention" }),
    third: screen.getByRole("button", { name: "Past decisions" }),
  };
}

function point(clientX: number, clientY = 30, extra: PointerEventInit = {}) {
  return {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX,
    clientY,
    ...extra,
  };
}

describe("liquid segmented control", () => {
  it("retains native click selection before layout can be measured", async () => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue(
      new DOMRect(),
    );
    const user = userEvent.setup();
    const { second, onValueChange } = control();
    await user.click(second);
    expect(onValueChange.mock.calls).toEqual([["attention"]]);
  });

  it("preserves a named navigation landmark when used for page navigation", () => {
    render(
      <LiquidSegmentedControl
        as="nav"
        ariaLabel="Page navigation"
        options={options}
        value="all"
        onValueChange={vi.fn()}
      />,
    );
    expect(
      screen
        .getByRole("navigation", { name: "Page navigation" })
        .contains(
          screen.getByRole("button", { name: "All activity", pressed: true }),
        ),
    ).toBe(true);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("exposes the controlled selection and supports an ordinary click", async () => {
    const user = userEvent.setup();
    const { first, second, onValueChange } = control();
    expect(first.getAttribute("aria-pressed")).toBe("true");
    expect(second.getAttribute("aria-pressed")).toBe("false");
    expect(first.tabIndex).toBe(0);
    expect(second.tabIndex).toBe(-1);
    await user.pointer({
      target: second,
      coords: { clientX: 250, clientY: 30 },
      keys: "[MouseLeft]",
    });
    expect(onValueChange.mock.calls).toEqual([["attention"]]);
  });

  it("previews a horizontal drag and commits once on release", () => {
    const { group, first, third, onValueChange } = control();
    fireEvent.pointerDown(first, point(150));
    fireEvent.pointerMove(group, point(250, 31));
    fireEvent.pointerMove(group, point(350, 32));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(first.getAttribute("aria-pressed")).toBe("true");
    fireEvent.pointerUp(group, point(350, 32, { buttons: 0 }));
    expect(onValueChange.mock.calls).toEqual([["history"]]);
    fireEvent.click(third, { detail: 1 });
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it("taps a new segment once and ignores a tap on the current segment", () => {
    const { group, first, second, onValueChange } = control();
    fireEvent.pointerDown(first, point(150));
    fireEvent.pointerUp(group, point(150, 30, { buttons: 0 }));
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(second, point(250));
    fireEvent.pointerUp(group, point(250, 30, { buttons: 0 }));
    fireEvent.click(second, { detail: 1 });
    expect(onValueChange.mock.calls).toEqual([["attention"]]);
  });

  it.each(["pointerCancel", "lostPointerCapture"] as const)(
    "cancels without changing the value after %s",
    (event) => {
      const { group, first, onValueChange } = control();
      fireEvent.pointerDown(first, point(150));
      fireEvent.pointerMove(group, point(350));
      fireEvent[event](group, point(350));
      fireEvent.pointerUp(group, point(350, 30, { buttons: 0 }));
      expect(onValueChange).not.toHaveBeenCalled();
    },
  );

  it("lets a vertical touch gesture scroll without switching filters", () => {
    const { group, first, onValueChange } = control();
    fireEvent.pointerDown(first, point(150));
    fireEvent.pointerMove(group, point(165, 90));
    fireEvent.pointerMove(group, point(350, 130));
    fireEvent.pointerUp(group, point(350, 130, { buttons: 0 }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("ignores a second pointer until the original drag is released", () => {
    const { group, first, third, onValueChange } = control();
    fireEvent.pointerDown(first, point(150));
    fireEvent.pointerMove(group, point(250));
    fireEvent.pointerDown(
      third,
      point(350, 30, { pointerId: 2, isPrimary: false }),
    );
    fireEvent.pointerMove(
      group,
      point(350, 30, { pointerId: 2, isPrimary: false }),
    );
    fireEvent.pointerUp(
      group,
      point(350, 30, { pointerId: 2, isPrimary: false }),
    );
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(group, point(250, 30, { buttons: 0 }));
    expect(onValueChange.mock.calls).toEqual([["attention"]]);
  });

  it("ignores right mouse buttons and nonprimary touch starts", () => {
    const { group, third, onValueChange } = control();
    fireEvent.pointerDown(
      third,
      point(350, 30, { pointerType: "mouse", button: 2 }),
    );
    fireEvent.pointerUp(
      group,
      point(350, 30, { pointerType: "mouse", button: 2 }),
    );
    fireEvent.pointerDown(third, point(350, 30, { isPrimary: false }));
    fireEvent.pointerUp(group, point(350, 30, { isPrimary: false }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("skips disabled segments during a drag", () => {
    const { group, first, second, onValueChange } = control({
      options: options.map((option, index) => ({
        ...option,
        disabled: index === 1,
      })),
    });
    expect((second as HTMLButtonElement).disabled).toBe(true);
    fireEvent.pointerDown(first, point(150));
    fireEvent.pointerMove(group, point(340));
    fireEvent.pointerUp(group, point(340, 30, { buttons: 0 }));
    expect(onValueChange.mock.calls).toEqual([["history"]]);
  });

  it("supports arrows, Home and End while skipping disabled choices", () => {
    const { first, third, onValueChange, props, rerender } = control({
      options: options.map((option, index) => ({
        ...option,
        disabled: index === 1,
      })),
    });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(onValueChange).toHaveBeenLastCalledWith("history");
    expect(document.activeElement).toBe(third);
    rerender(<LiquidSegmentedControl {...props} value="history" />);
    fireEvent.keyDown(third, { key: "Home" });
    expect(onValueChange).toHaveBeenLastCalledWith("all");
    expect(document.activeElement).toBe(first);
    rerender(<LiquidSegmentedControl {...props} value="all" />);
    fireEvent.keyDown(first, { key: "End" });
    expect(onValueChange).toHaveBeenLastCalledWith("history");
    expect(document.activeElement).toBe(third);
  });

  it("follows right-to-left arrow direction", () => {
    const { group, first, third, onValueChange } = control();
    group.style.direction = "rtl";
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(onValueChange).toHaveBeenLastCalledWith("history");
    expect(document.activeElement).toBe(third);
  });

  it("updates its selected button when the parent changes the value", () => {
    const { rerender, props, first, third, onValueChange } = control();
    rerender(<LiquidSegmentedControl {...props} value="history" />);
    expect(first.getAttribute("aria-pressed")).toBe("false");
    expect(third.getAttribute("aria-pressed")).toBe("true");
    expect(third.tabIndex).toBe(0);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("uses resized hit areas for the next drag", () => {
    const { group, first, onValueChange } = control();
    segmentWidth = 60;
    resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver));
    fireEvent(window, new Event("resize"));
    fireEvent.pointerDown(first, point(130));
    fireEvent.pointerMove(group, point(250));
    fireEvent.pointerUp(group, point(250, 30, { buttons: 0 }));
    expect(onValueChange.mock.calls).toEqual([["history"]]);
  });

  it("still accepts a keyboard click immediately after a drag", () => {
    const { group, first, second, onValueChange } = control();
    fireEvent.pointerDown(first, point(150));
    fireEvent.pointerMove(group, point(350));
    fireEvent.pointerUp(group, point(350, 30, { buttons: 0 }));
    fireEvent.click(second, { detail: 0 });
    expect(onValueChange.mock.calls).toEqual([["history"], ["attention"]]);
  });

  it("does nothing when all options are disabled", () => {
    const { group, first, third, onValueChange } = control({
      options: options.map((option) => ({ ...option, disabled: true })),
    });
    fireEvent.pointerDown(first, point(150));
    fireEvent.pointerMove(group, point(350));
    fireEvent.pointerUp(group, point(350, 30, { buttons: 0 }));
    fireEvent.click(third);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
