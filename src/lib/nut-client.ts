/**
 * NUT (Network UPS Tools) client — speaks the upsd protocol over TCP/3493.
 *
 * NUT is the right integration for UPSes that have no SNMP card: a Linux/BSD box
 * (often the Proxmox host itself) talks to the UPS over USB/serial and exposes
 * it on the network via `upsd`. KumaMap previously only supported SNMP, which
 * left USB-attached UPSes invisible.
 *
 * Protocol (RFC-ish, text over TCP — see nut(8) / NUT_PROTOCOL):
 *   > LIST UPS
 *   < BEGIN LIST UPS
 *   < UPS apc "APC Back-UPS 1500"
 *   < END LIST UPS
 *
 *   > LIST VAR apc
 *   < BEGIN LIST VAR apc
 *   < VAR apc battery.charge "100"
 *   < VAR apc ups.status "OL"
 *   < END LIST VAR apc
 *
 * We deliberately implement the handful of commands we need rather than pulling
 * in a dependency: the protocol is small, and this keeps the supply chain lean.
 */

import net from "net";
import {
  normalizeOutputStatus,
  type UpsResult,
  type UpsBatteryHealth,
  type UpsOutputStatus,
} from "./ups";

const DEFAULT_PORT = 3493;
const TIMEOUT_MS = 5000;

export interface NutOptions {
  host: string;
  port?: number;
  /** UPS name as configured in ups.conf (the `[name]` section). */
  upsName?: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
}

/** Raw NUT variables, e.g. { "battery.charge": "100", "ups.status": "OL" } */
export type NutVars = Record<string, string>;

// ── Low-level connection ─────────────────────────────────────────────────────

class NutConnection {
  private socket: net.Socket;
  private buffer = "";
  private pending: ((lines: string[]) => void) | null = null;
  private collecting: string[] = [];
  private endMarker: string | null = null;
  private rejectPending: ((err: Error) => void) | null = null;

  constructor(private opts: NutOptions) {
    this.socket = new net.Socket();
  }

  connect(): Promise<void> {
    const timeout = this.opts.timeoutMs ?? TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.destroy();
        reject(new Error(`Timeout conectando a NUT ${this.opts.host}:${this.opts.port ?? DEFAULT_PORT}`));
      }, timeout);

      this.socket.setTimeout(timeout);
      this.socket.on("data", (chunk) => this.onData(chunk.toString("utf8")));
      this.socket.on("error", (err) => {
        clearTimeout(timer);
        this.rejectPending?.(err);
        reject(err);
      });
      this.socket.on("timeout", () => {
        const err = new Error("Timeout de socket NUT");
        this.rejectPending?.(err);
        this.socket.destroy();
      });

      this.socket.connect(this.opts.port ?? DEFAULT_PORT, this.opts.host, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, "");
      this.buffer = this.buffer.slice(idx + 1);
      this.handleLine(line);
    }
  }

  private handleLine(line: string) {
    if (!this.pending) return;

    if (line.startsWith("ERR ")) {
      const err = new Error(`NUT: ${line.slice(4)}`);
      const reject = this.rejectPending;
      this.pending = null;
      this.rejectPending = null;
      this.endMarker = null;
      this.collecting = [];
      reject?.(err);
      return;
    }

    // Single-line responses (OK, etc.)
    if (this.endMarker === null) {
      const done = this.pending;
      this.pending = null;
      this.rejectPending = null;
      done([line]);
      return;
    }

    // Multi-line list responses
    if (line.startsWith("BEGIN ")) return;
    if (line.startsWith(this.endMarker)) {
      const done = this.pending;
      const lines = this.collecting;
      this.pending = null;
      this.rejectPending = null;
      this.endMarker = null;
      this.collecting = [];
      done(lines);
      return;
    }
    this.collecting.push(line);
  }

  /** Send a command. `endMarker` set → collect lines until it appears. */
  private send(command: string, endMarker: string | null): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.pending = resolve;
      this.rejectPending = reject;
      this.endMarker = endMarker;
      this.collecting = [];
      this.socket.write(`${command}\n`);
    });
  }

  async login(): Promise<void> {
    if (!this.opts.username || !this.opts.password) return; // upsd allows anon reads by default
    await this.send(`USERNAME ${this.opts.username}`, null);
    await this.send(`PASSWORD ${this.opts.password}`, null);
  }

  /** Names of the UPSes this upsd serves. */
  async listUps(): Promise<{ name: string; description: string }[]> {
    const lines = await this.send("LIST UPS", "END LIST UPS");
    return lines
      .map((l) => l.match(/^UPS\s+(\S+)\s+"(.*)"$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => ({ name: m[1], description: m[2] }));
  }

  /** All variables for one UPS. */
  async listVars(upsName: string): Promise<NutVars> {
    const lines = await this.send(`LIST VAR ${upsName}`, `END LIST VAR ${upsName}`);
    const vars: NutVars = {};
    for (const line of lines) {
      // VAR <ups> <name> "<value>"
      const m = line.match(/^VAR\s+\S+\s+(\S+)\s+"(.*)"$/);
      if (m) vars[m[1]] = m[2];
    }
    return vars;
  }

  close() {
    try {
      this.socket.write("LOGOUT\n");
    } catch {}
    this.socket.destroy();
  }
}

// ── Mapping NUT vars → the shared UpsResult shape ─────────────────────────────

/**
 * `ups.status` is a space-separated flag list. The ones that matter:
 *   OL      on line (mains)      OB   on battery
 *   LB      low battery          HB   high battery
 *   RB      replace battery      CHRG charging
 *   DISCHRG discharging          BYPASS bypass active
 *   OFF     output off           OVER overload
 *   TRIM    trimming voltage     BOOST boosting voltage
 */
function parseNutStatus(raw: string | undefined): {
  output: UpsOutputStatus;
  health: UpsBatteryHealth;
  needsReplacement: boolean;
} {
  const flags = new Set((raw || "").toUpperCase().split(/\s+/).filter(Boolean));

  let output: UpsOutputStatus = "unknown";
  if (flags.has("OFF")) output = "off";
  else if (flags.has("BYPASS")) output = "bypass";
  else if (flags.has("OB") || flags.has("DISCHRG")) output = "onBattery";
  else if (flags.has("BOOST")) output = "onSmartBoost";
  else if (flags.has("TRIM")) output = "onSmartTrim";
  else if (flags.has("OL")) output = "onLine";

  let health: UpsBatteryHealth = "unknown";
  if (flags.has("RB")) health = "replace";
  else if (flags.has("LB")) health = "low";
  else if (flags.has("OL") || flags.has("OB") || flags.has("CHRG")) health = "normal";

  return { output, health, needsReplacement: flags.has("RB") };
}

function num(vars: NutVars, key: string): number | undefined {
  const v = vars[key];
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Convert raw NUT variables into the same UpsResult the SNMP poller returns. */
export function nutVarsToResult(ip: string, vars: NutVars): UpsResult {
  const status = parseNutStatus(vars["ups.status"]);
  const charge = num(vars, "battery.charge") ?? 0;

  // battery.runtime is in SECONDS in NUT; the UI works in minutes.
  const runtimeSec = num(vars, "battery.runtime");

  return {
    ip,
    timestamp: Date.now(),
    reachable: true,
    vendor: "nut",
    identity: {
      manufacturer: vars["device.mfr"] || vars["ups.mfr"],
      model: vars["device.model"] || vars["ups.model"],
      serial: vars["device.serial"] || vars["ups.serial"],
      firmware: vars["ups.firmware"],
      name: vars["ups.id"] || vars["device.model"],
    },
    battery: {
      charge,
      health:
        status.health !== "unknown"
          ? status.health
          : charge > 0
            ? charge < 25
              ? "low"
              : "normal"
            : "unknown",
      temperature: num(vars, "battery.temperature"),
      voltage: num(vars, "battery.voltage"),
      current: num(vars, "battery.current"),
      runtimeMinutes: runtimeSec != null ? Math.round(runtimeSec / 60) : undefined,
      needsReplacement: status.needsReplacement,
    },
    input: {
      voltage: num(vars, "input.voltage"),
      frequency: num(vars, "input.frequency"),
      voltageMin: num(vars, "input.voltage.minimum"),
      voltageMax: num(vars, "input.voltage.maximum"),
    },
    output: {
      status:
        status.output !== "unknown"
          ? status.output
          : normalizeOutputStatus(vars["ups.status"]),
      statusRaw: vars["ups.status"],
      voltage: num(vars, "output.voltage"),
      frequency: num(vars, "output.frequency"),
      loadPercent: num(vars, "ups.load"),
      current: num(vars, "output.current"),
      power: num(vars, "ups.realpower") ?? num(vars, "ups.power"),
    },
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Poll a UPS through a NUT server. Never throws — errors land in `.error`. */
export async function pollNut(opts: NutOptions): Promise<UpsResult> {
  const conn = new NutConnection(opts);
  const ip = opts.host;

  try {
    await conn.connect();
    await conn.login();

    // If no UPS name was configured, use the first one upsd reports.
    let upsName = opts.upsName;
    if (!upsName) {
      const list = await conn.listUps();
      if (list.length === 0) {
        return {
          ip,
          timestamp: Date.now(),
          reachable: false,
          vendor: "nut",
          error: "El servidor NUT no expone ningún UPS",
        };
      }
      upsName = list[0].name;
    }

    const vars = await conn.listVars(upsName);
    if (Object.keys(vars).length === 0) {
      return {
        ip,
        timestamp: Date.now(),
        reachable: false,
        vendor: "nut",
        error: `El UPS "${upsName}" no devolvió variables`,
      };
    }

    return nutVarsToResult(ip, vars);
  } catch (err: any) {
    return {
      ip,
      timestamp: Date.now(),
      reachable: false,
      vendor: "nut",
      error: err?.message || "Error desconocido consultando NUT",
    };
  } finally {
    conn.close();
  }
}

/** List the UPS names a NUT server exposes (used by the config modal). */
export async function discoverNutUps(
  opts: NutOptions
): Promise<{ ok: boolean; ups?: { name: string; description: string }[]; error?: string }> {
  const conn = new NutConnection(opts);
  try {
    await conn.connect();
    await conn.login();
    const ups = await conn.listUps();
    return { ok: true, ups };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo conectar al servidor NUT" };
  } finally {
    conn.close();
  }
}
