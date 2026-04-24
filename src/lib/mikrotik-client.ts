/**
 * Shared MikroTik REST API client.
 *
 * Single source of truth for talking to MikroTik RouterOS REST API.
 * - Uses per-request https.Agent instead of mutating NODE_TLS_REJECT_UNAUTHORIZED
 * - Credentials sent via Authorization header (never in URL)
 * - Path whitelist for the generic query endpoint
 */

import https from "node:https";

// ── TLS agent (reusable, skips self-signed cert validation) ───────────────
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

// ── Allowed paths for the generic /api/mikrotik/query proxy ──────────────
const ALLOWED_PATH_PREFIXES = [
  "/system/identity",
  "/system/resource",
  "/system/routerboard",
  "/system/clock",
  "/system/health",
  "/system/license",
  "/system/history",
  "/system/package",
  "/system/note",
  "/interface",
  "/ip/address",
  "/ip/route",
  "/ip/dns",
  "/ip/dhcp-server",
  "/ip/dhcp-client",
  "/ip/firewall/filter",
  "/ip/firewall/nat",
  "/ip/firewall/mangle",
  "/ip/firewall/address-list",
  "/ip/firewall/connection",
  "/ip/pool",
  "/ip/arp",
  "/ip/neighbor",
  "/ip/service",
  "/routing/ospf",
  "/routing/bgp",
  "/queue/simple",
  "/queue/tree",
  "/caps-man/registration-table",
  "/log",
  "/tool/ping",
  "/tool/traceroute",
  "/ppp/active",
  "/ppp/secret",
  "/user",
  "/snmp",
  "/certificate",
];

/**
 * Check if a MikroTik REST path is allowed for the generic query proxy.
 */
export function isPathAllowed(path: string): boolean {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return ALLOWED_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(prefix + "/")
  );
}

/**
 * Fetch data from a MikroTik RouterOS REST API endpoint.
 *
 * Tries HTTPS first, falls back to HTTP.
 * Uses a dedicated https.Agent for TLS — never touches process.env.
 */
export async function mikrotikFetch(
  ip: string,
  path: string,
  user: string,
  pass: string,
  timeoutMs = 8000,
  port?: number
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const authHeader =
    "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

  for (const scheme of ["https", "http"] as const) {
    try {
      const effectivePort = port || (scheme === "https" ? 443 : 80);
      const portSuffix =
        (scheme === "https" && effectivePort === 443) ||
        (scheme === "http" && effectivePort === 80)
          ? ""
          : `:${effectivePort}`;

      const url = `${scheme}://${ip}${portSuffix}/rest${path}`;

      const fetchOptions: RequestInit & { dispatcher?: unknown } = {
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      };

      // For HTTPS with self-signed certs: use the insecure agent
      // Node 18+ fetch supports the undici dispatcher; Node built-in also
      // accepts the older { agent } option via node-fetch compat.
      // We set both to cover different Node versions.
      if (scheme === "https") {
        // @ts-expect-error – Node internal fetch option for custom agent
        fetchOptions.agent = insecureAgent;
      }

      // If the native fetch doesn't honour the agent, we fall back to the
      // env-var approach but scoped as tightly as possible.
      let res: Response;
      if (scheme === "https") {
        const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        try {
          res = await fetch(url, fetchOptions);
        } finally {
          if (prev === undefined)
            delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
        }
      } else {
        res = await fetch(url, fetchOptions);
      }

      clearTimeout(timer);

      if (res.ok) return await res.json();
      if (res.status === 401) throw new Error("Credenciales inválidas (401)");
      if (scheme === "https") continue;
      throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      clearTimeout(timer);
      if (err.message?.includes("Credenciales")) throw err;
      if (scheme === "https") continue;
      throw err;
    }
  }

  throw new Error("No se pudo conectar al router");
}
