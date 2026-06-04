"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";

type Theme = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: ResolvedTheme;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  resolvedTheme: "dark",
});

const STORAGE_KEY = "kumamap-theme";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") return getSystemTheme();
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const t = saved && ["dark", "light", "system"].includes(saved) ? (saved as Theme) : "dark";
    setThemeState(t);
    const resolved = resolveTheme(t);
    setResolvedTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
  }, []);

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => {
      if (theme === "system") {
        const resolved = getSystemTheme();
        setResolvedTheme(resolved);
        document.documentElement.setAttribute("data-theme", resolved);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    // Add transition class for animated theme switching
    document.body.classList.add("theme-transitioning");
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    transitionTimer.current = setTimeout(() => {
      document.body.classList.remove("theme-transitioning");
    }, 500);

    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    const resolved = resolveTheme(t);
    setResolvedTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
