import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "terrevolt-theme";

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(KEY);
  return stored === "dark" || stored === "light" ? stored : "light";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  // Keep shadcn `.dark` class behaviour in sync (some primitives target it).
  root.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return {
    theme,
    setTheme: setThemeState,
    toggle: () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
  };
}
