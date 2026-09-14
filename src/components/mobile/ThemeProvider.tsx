"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "auto" | "dark" | "light";
type ResolvedTheme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: ResolvedTheme;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "auto",
  setTheme: () => {},
  resolvedTheme: "dark",
});

const STORAGE_KEY = "kumamap-theme";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "auto") return getSystemTheme();
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("auto");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");

  // Initialize from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const t = saved && ["auto", "dark", "light"].includes(saved) ? saved : "auto";
    setThemeState(t);
    const resolved = resolveTheme(t);
    setResolvedTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
  }, []);

  // Listen for system theme changes when in auto mode
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => {
      if (theme === "auto") {
        const resolved = getSystemTheme();
        setResolvedTheme(resolved);
        document.documentElement.setAttribute("data-theme", resolved);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
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
