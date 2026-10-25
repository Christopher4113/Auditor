// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PeriodPicker from "./PeriodPicker";

const periods = ["July 2026", "August 2026", "September 2026"];
const scrollDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (scrollDescriptor)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      scrollDescriptor,
    );
  else
    delete (HTMLElement.prototype as { scrollIntoView?: unknown })
      .scrollIntoView;
});

function ControlledPicker({
  onChange = vi.fn(),
}: {
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState("August 2026");
  return (
    <>
      <PeriodPicker
        value={value}
        options={periods}
        onValueChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
      <button type="button">Outside action</button>
    </>
  );
}

const trigger = () => screen.getByRole("combobox", { name: "Fiscal period" });

describe("glass fiscal period picker", () => {
  it("has one named combobox and opens a custom selected-option list", async () => {
    const user = userEvent.setup();
    const { container } = render(<ControlledPicker />);
    expect(trigger().textContent).toContain("August 2026");
    expect(container.querySelector("select")).toBeNull();
    await user.click(trigger());
    const list = await screen.findByRole("listbox");
    expect(container.contains(list)).toBe(false);
    expect(
      screen
        .getByRole("option", { name: "August 2026" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("selects an option by pointer and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledPicker onChange={onChange} />);
    await user.click(trigger());
    await user.click(
      await screen.findByRole("option", { name: "September 2026" }),
    );
    expect(onChange.mock.calls).toEqual([["September 2026"]]);
    expect(trigger().textContent).toContain("September 2026");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(document.activeElement).toBe(trigger());
  });

  it("supports arrows, Home, End, Enter, and keyboard focus return", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledPicker onChange={onChange} />);
    await user.tab();
    expect(document.activeElement).toBe(trigger());
    await user.keyboard("{ArrowDown}");
    await screen.findByRole("listbox");
    await user.keyboard("{End}{ArrowUp}{Home}{Enter}");
    expect(onChange.mock.calls).toEqual([["July 2026"]]);
    expect(trigger().textContent).toContain("July 2026");
    await waitFor(() => expect(document.activeElement).toBe(trigger()));
  });

  it("supports typing to a month without committing a browsed option until Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledPicker onChange={onChange} />);
    await user.tab();
    await user.keyboard("{ArrowDown}");
    await screen.findByRole("listbox");
    await user.keyboard("Sep");
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onChange.mock.calls).toEqual([["September 2026"]]);
  });

  it("Escape cancels browsing and returns focus without changing the month", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledPicker onChange={onChange} />);
    await user.tab();
    await user.keyboard("{ArrowDown}");
    await screen.findByRole("listbox");
    await user.keyboard("{End}{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger().textContent).toContain("August 2026");
    expect(document.activeElement).toBe(trigger());
  });

  it("dismisses on an outside action without stealing its focus or changing the month", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledPicker onChange={onChange} />);
    await user.click(trigger());
    await screen.findByRole("listbox");
    const outside = screen.getByRole("button", { name: "Outside action" });
    await user.click(outside);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(document.activeElement).toBe(outside);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reflects a controlled month update and avoids submitting the current month again", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <PeriodPicker
        value="July 2026"
        options={periods}
        onValueChange={onChange}
      />,
    );
    rerender(
      <PeriodPicker
        value="September 2026"
        options={periods}
        onValueChange={onChange}
      />,
    );
    expect(trigger().textContent).toContain("September 2026");
    await user.click(trigger());
    await user.click(
      await screen.findByRole("option", { name: "September 2026" }),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes and blocks changes when the workspace disables the picker during an action", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <PeriodPicker
        value="August 2026"
        options={periods}
        onValueChange={onChange}
      />,
    );
    await user.click(trigger());
    await screen.findByRole("listbox");
    rerender(
      <PeriodPicker
        value="August 2026"
        options={periods}
        onValueChange={onChange}
        disabled
      />,
    );
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect((trigger() as HTMLButtonElement).disabled).toBe(true);
    await user.click(trigger());
    await user.keyboard("{ArrowDown}{End}{Enter}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
