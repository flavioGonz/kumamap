import { toast } from "sonner";

/**
 * Wraps an async fetch call with error logging and optional toast notification.
 * Returns null on failure instead of throwing.
 */
export async function safeFetch<T = any>(
  url: string,
  options?: RequestInit,
  context?: string
): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const msg = `HTTP ${res.status} ${res.statusText}`;
      console.error(`[${context || "fetch"}] ${msg} — ${url}`);
      if (context) toast.error(`Error: ${context}`, { description: msg, duration: 5000 });
      return null;
    }
    return await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error de red";
    console.error(`[${context || "fetch"}] ${msg} — ${url}`);
    if (context) toast.error(`Error: ${context}`, { description: msg, duration: 5000 });
    return null;
  }
}

/**
 * Safe JSON.parse that returns a fallback on failure instead of throwing.
 */
export function safeJsonParse<T = Record<string, any>>(
  json: string | null | undefined,
  fallback: T = {} as T
): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
