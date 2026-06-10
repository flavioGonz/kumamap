import { toast } from "sonner";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** Track whether we're already redirecting to login (prevent multiple redirects) */
let redirectingToLogin = false;

/**
 * Wraps an async fetch call with error logging and optional toast notification.
 * Returns null on failure instead of throwing.
 * On 401, automatically redirects to the login page.
 */
export async function safeFetch<T = any>(
  url: string,
  options?: RequestInit,
  context?: string
): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      // 401 = session expired or invalid → redirect to login
      if (res.status === 401 && typeof window !== "undefined") {
        if (!redirectingToLogin) {
          redirectingToLogin = true;
          toast.error("Sesión expirada", { description: "Redirigiendo al login…", duration: 3000 });
          setTimeout(() => {
            window.location.href = `${BASE_PATH}/login`;
          }, 1000);
        }
        return null;
      }

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
