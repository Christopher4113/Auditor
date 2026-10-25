import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import "./ThemeToggle.css";

type Theme = "light" | "dark";
const storageKey = "auditor-theme";
const isTheme = (value: unknown): value is Theme =>
  value === "light" || value === "dark";

function savedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(storageKey);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}
function systemTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}
function initialTheme(): Theme {
  return savedTheme() ?? systemTheme();
}
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#100e18" : "#f7f7f9");
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const explicitChoice = useRef(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    explicitChoice.current = savedTheme() !== null;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      const value = event.key === null ? null : event.newValue;
      explicitChoice.current = isTheme(value);
      setTheme(isTheme(value) ? value : systemTheme());
    };
    window.addEventListener("storage", onStorage);
    let media: MediaQueryList | undefined;
    const onSystemChange = (event: MediaQueryListEvent) => {
      if (!explicitChoice.current) setTheme(event.matches ? "dark" : "light");
    };
    try {
      media = window.matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener?.("change", onSystemChange);
    } catch {
      // The manual toggle remains available when the browser has no media API.
    }
    return () => {
      window.removeEventListener("storage", onStorage);
      media?.removeEventListener?.("change", onSystemChange);
    };
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    explicitChoice.current = true;
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // Private browsing may block storage; the current session still changes.
    }
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      data-active={theme}
      aria-label="Dark mode"
      aria-pressed={theme === "dark"}
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      onClick={toggle}
    >
      <span className="theme-toggle-option" aria-hidden="true">
        <Sun size={16} />
      </span>
      <span className="theme-toggle-option" aria-hidden="true">
        <Moon size={16} />
      </span>
    </button>
  );
}
