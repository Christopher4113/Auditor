// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThemeToggle from "./ThemeToggle";

const preferenceKey = "auditor-theme";
let systemDark = false;
const listeners = new Set<(event: MediaQueryListEvent) => void>();
let addMediaListener: ReturnType<typeof vi.fn>;
let removeMediaListener: ReturnType<typeof vi.fn>;

function changeSystemTheme(dark: boolean) {
  act(() => {
    systemDark = dark;
    listeners.forEach((listener) =>
      listener({ matches: dark } as MediaQueryListEvent),
    );
  });
}

function otherTabPreference(value: string | null, key = preferenceKey) {
  act(() => {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key,
        newValue: value,
        storageArea: localStorage,
      }),
    );
  });
}

function expectTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  expect(root.dataset.theme).toBe(theme);
  expect(root.classList.contains(theme)).toBe(true);
  expect(root.classList.contains(theme === "dark" ? "light" : "dark")).toBe(
    false,
  );
  expect(root.style.colorScheme).toBe(theme);
  expect(
    screen
      .getByRole("button", { name: "Dark mode" })
      .getAttribute("aria-pressed"),
  ).toBe(String(theme === "dark"));
}

beforeEach(() => {
  systemDark = false;
  listeners.clear();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.className = "light";
  document.documentElement.style.removeProperty("color-scheme");
  document.head.insertAdjacentHTML(
    "beforeend",
    '<meta name="theme-color" content="#f7f7f9" data-test-theme-meta>',
  );
  addMediaListener = vi.fn(
    (_name: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
  );
  removeMediaListener = vi.fn(
    (_name: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return systemDark;
      },
      media: query,
      onchange: null,
      addEventListener: addMediaListener,
      removeEventListener: removeMediaListener,
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document
    .querySelectorAll("[data-test-theme-meta]")
    .forEach((node) => node.remove());
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.className = "light";
  document.documentElement.style.removeProperty("color-scheme");
});

describe("workspace color theme", () => {
  it("uses the system preference until the user makes a choice", () => {
    systemDark = true;
    render(<ThemeToggle />);
    expectTheme("dark");
    expect(localStorage.getItem(preferenceKey)).toBeNull();
    changeSystemTheme(false);
    expectTheme("light");
    expect(localStorage.getItem(preferenceKey)).toBeNull();
  });

  it("respects an explicitly saved light theme on a dark system", () => {
    systemDark = true;
    localStorage.setItem(preferenceKey, "light");
    render(<ThemeToggle />);
    expectTheme("light");
  });

  it("toggles with the keyboard, persists the choice, and updates the browser chrome", async () => {
    const user = userEvent.setup();
    const view = render(<ThemeToggle />);
    expectTheme("light");
    const lightChrome = document
      .querySelector('meta[name="theme-color"]')
      ?.getAttribute("content");
    const button = screen.getByRole("button", { name: "Dark mode" });
    button.focus();
    await user.keyboard("[Space]");
    expectTheme("dark");
    expect(localStorage.getItem(preferenceKey)).toBe("dark");
    expect(
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute("content"),
    ).not.toBe(lightChrome);
    expect(button.title).toBe("Switch to light mode");
    view.unmount();
    render(<ThemeToggle />);
    expectTheme("dark");
    await user.click(screen.getByRole("button", { name: "Dark mode" }));
    expectTheme("light");
    expect(localStorage.getItem(preferenceKey)).toBe("light");
  });

  it("keeps the user's choice when the system theme changes later", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Dark mode" }));
    expectTheme("dark");
    changeSystemTheme(true);
    changeSystemTheme(false);
    expectTheme("dark");
  });

  it("continues to work when the browser blocks preference storage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });
    const user = userEvent.setup();
    render(<ThemeToggle />);
    expectTheme("light");
    await user.click(screen.getByRole("button", { name: "Dark mode" }));
    expectTheme("dark");
    changeSystemTheme(false);
    expectTheme("dark");
  });

  it("synchronizes a choice from another tab and ignores unrelated storage", () => {
    render(<ThemeToggle />);
    otherTabPreference("dark");
    expectTheme("dark");
    otherTabPreference("light", "another-setting");
    expectTheme("dark");
    changeSystemTheme(false);
    expectTheme("dark");
  });

  it("returns to the system preference if another tab clears the saved choice", () => {
    localStorage.setItem(preferenceKey, "light");
    systemDark = true;
    render(<ThemeToggle />);
    expectTheme("light");
    otherTabPreference(null);
    expectTheme("dark");
    changeSystemTheme(false);
    expectTheme("light");
  });

  it("falls back to the system for an invalid saved value", () => {
    localStorage.setItem(preferenceKey, "invalid");
    systemDark = true;
    render(<ThemeToggle />);
    expectTheme("dark");
  });

  it("detaches theme listeners when the control unmounts", () => {
    const view = render(<ThemeToggle />);
    expect(addMediaListener).toHaveBeenCalled();
    expect(listeners.size).toBe(1);
    view.unmount();
    expect(removeMediaListener).toHaveBeenCalled();
    expect(listeners.size).toBe(0);
    const previousTheme = document.documentElement.dataset.theme;
    otherTabPreference("dark");
    expect(document.documentElement.dataset.theme).toBe(previousTheme);
  });
});
