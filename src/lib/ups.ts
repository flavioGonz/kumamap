/**
 * UPS monitoring types, OID maps (APC PowerNet MIB + RFC 1628 UPS-MIB fallback),
 * and helper utilities for the UPS panel feature.
 */

// ── UPS Status Enums ─────────────────────────────────────────────────────────

/** APC upsBasicBatteryStatus values */
export const APC_BATTERY_STATUS: Record<number, string> = {
  1: "unknown",
  2: "batteryNormal",
  3: "batteryLow",
  4: "batteryInFaultCondition",
};

/** APC upsBasicOutputStatus values */
export const APC_OUTPUT_STATUS: Record<number, string> = {
  1: "unknown",
  2: "onLine",
  3: "onBattery",
  4: "onSmartBoost",
  5: "timedSleeping",
  6: "softwareBypass",
  7: "off",
  8: "rebooting",
  9: "switchedBypass",
  10: "hardwareFailureBypass",
  11: "sleepingUntilPowerReturn",
  12: "onSmartTrim",
  13: "ecoMode",
  14: "hotStandby",
  15: "onBatteryTest",
};

/** RFC 1628 upsBatteryStatus values */
export const RFC_BATTERY_STATUS: Record<number, string> = {
  1: "unknown",
  2: "batteryNormal",
  3: "batteryLow",
  4: "batteryDepleted",
};

/** RFC 1628 upsOutputSource values */
export const RFC_OUTPUT_SOURCE: Record<number, string> = {
  1: "other",
  2: "none",
  3: "normal",     // running from mains
  4: "bypass",
  5: "battery",
  6: "booster",
  7: "reducer",
};

// ── OID Maps ─────────────────────────────────────────────────────────────────

/** APC PowerNet-MIB OIDs (enterprise 318) */
export const APC_OID = {
  // Identity
  upsIdentModel:              "1.3.6.1.4.1.318.1.1.1.1.1.1.0",
  upsIdentName:               "1.3.6.1.4.1.318.1.1.1.1.1.2.0",
  upsIdentFirmwareRevision:   "1.3.6.1.4.1.318.1.1.1.1.2.1.0",
  upsIdentSerialNumber:       "1.3.6.1.4.1.318.1.1.1.1.2.3.0",
  upsIdentDateOfManufacture:  "1.3.6.1.4.1.318.1.1.1.1.2.2.0",

  // Battery
  upsBasicBatteryStatus:      "1.3.6.1.4.1.318.1.1.1.2.1.1.0",  // INTEGER (1-4)
  upsAdvBatteryCapacity:      "1.3.6.1.4.1.318.1.1.1.2.2.1.0",  // Gauge (% charge)
  upsAdvBatteryTemperature:   "1.3.6.1.4.1.318.1.1.1.2.2.2.0",  // Gauge (°C)
  upsAdvBatteryRunTimeRemaining: "1.3.6.1.4.1.318.1.1.1.2.2.3.0", // TimeTicks (hundredths sec)
  upsAdvBatteryReplaceIndicator: "1.3.6.1.4.1.318.1.1.1.2.2.4.0", // 1=noBatNeedsRep, 2=batNeedsRep
  upsAdvBatteryActualVoltage: "1.3.6.1.4.1.318.1.1.1.2.2.8.0",  // INTEGER (Vdc)
  upsAdvBatteryCurrent:       "1.3.6.1.4.1.318.1.1.1.2.2.9.0",  // INTEGER (Amps)
  upsAdvBatteryNominalVoltage:"1.3.6.1.4.1.318.1.1.1.2.2.7.0",  // INTEGER (Vdc nom)

  // Input
  upsAdvInputLineVoltage:     "1.3.6.1.4.1.318.1.1.1.3.2.1.0",  // Gauge (VAC)
  upsAdvInputFrequency:       "1.3.6.1.4.1.318.1.1.1.3.2.4.0",  // Gauge (Hz)
  upsAdvInputMaxLineVoltage:  "1.3.6.1.4.1.318.1.1.1.3.2.2.0",  // Gauge (VAC max)
  upsAdvInputMinLineVoltage:  "1.3.6.1.4.1.318.1.1.1.3.2.3.0",  // Gauge (VAC min)

  // Output
  upsBasicOutputStatus:       "1.3.6.1.4.1.318.1.1.1.4.1.1.0",  // INTEGER (1-15)
  upsAdvOutputVoltage:        "1.3.6.1.4.1.318.1.1.1.4.2.1.0",  // Gauge (VAC)
  upsAdvOutputFrequency:      "1.3.6.1.4.1.318.1.1.1.4.2.2.0",  // Gauge (Hz)
  upsAdvOutputLoad:           "1.3.6.1.4.1.318.1.1.1.4.2.3.0",  // Gauge (%)
  upsAdvOutputCurrent:        "1.3.6.1.4.1.318.1.1.1.4.2.4.0",  // Gauge (Amps)
  upsAdvOutputApparentPower:  "1.3.6.1.4.1.318.1.1.1.4.2.8.0",  // INTEGER (VA)

  // Config
  upsAdvConfigRatedOutputVoltage: "1.3.6.1.4.1.318.1.1.1.5.2.1.0", // INTEGER (VAC)
  upsAdvConfigHighTransferVolt:   "1.3.6.1.4.1.318.1.1.1.5.2.2.0", // INTEGER (VAC)
  upsAdvConfigLowTransferVolt:    "1.3.6.1.4.1.318.1.1.1.5.2.3.0", // INTEGER (VAC)

  // Diagnostics
  upsAdvTestDiagnosticsResults:   "1.3.6.1.4.1.318.1.1.1.7.2.3.0", // 1=ok 2=failed 3=invalidTest 4=noTestPerformed
  upsAdvTestLastDiagnosticsDate:  "1.3.6.1.4.1.318.1.1.1.7.2.4.0", // DisplayString
} as const;

/** RFC 1628 UPS-MIB OIDs (standard, vendor-neutral) */
export const RFC1628_OID = {
  // Identity
  upsIdentManufacturer:   "1.3.6.1.2.1.33.1.1.1.0",
  upsIdentModel:          "1.3.6.1.2.1.33.1.1.2.0",
  upsIdentUPSSoftwareVersion: "1.3.6.1.2.1.33.1.1.3.0",
  upsIdentAgentSoftwareVersion: "1.3.6.1.2.1.33.1.1.4.0",
  upsIdentName:           "1.3.6.1.2.1.33.1.1.5.0",

  // Battery
  upsBatteryStatus:        "1.3.6.1.2.1.33.1.2.1.0",  // INTEGER (1-4)
  upsSecondsOnBattery:     "1.3.6.1.2.1.33.1.2.2.0",  // NonNegativeInteger (seconds)
  upsEstimatedMinutesRemaining: "1.3.6.1.2.1.33.1.2.3.0", // PositiveInteger (minutes)
  upsEstimatedChargeRemaining:  "1.3.6.1.2.1.33.1.2.4.0", // INTEGER (%)
  upsBatteryVoltage:       "1.3.6.1.2.1.33.1.2.5.0",  // NonNegativeInteger (0.1 Vdc)
  upsBatteryCurrent:       "1.3.6.1.2.1.33.1.2.6.0",  // INTEGER (0.1 Adc)
  upsBatteryTemperature:   "1.3.6.1.2.1.33.1.2.7.0",  // INTEGER (°C)

  // Input (table — index 1 for single phase)
  upsInputLineBads:        "1.3.6.1.2.1.33.1.3.1.0",  // Counter32
  upsInputNumLines:        "1.3.6.1.2.1.33.1.3.2.0",  // NonNegativeInteger
  upsInputFrequency:       "1.3.6.1.2.1.33.1.3.3.1.2.1", // NonNegativeInteger (0.1 Hz)
  upsInputVoltage:         "1.3.6.1.2.1.33.1.3.3.1.3.1", // NonNegativeInteger (RMS Volts)
  upsInputCurrent:         "1.3.6.1.2.1.33.1.3.3.1.4.1", // NonNegativeInteger (0.1 Amps)
  upsInputTruePower:       "1.3.6.1.2.1.33.1.3.3.1.5.1", // NonNegativeInteger (Watts)

  // Output
  upsOutputSource:         "1.3.6.1.2.1.33.1.4.1.0",  // INTEGER (1-7)
  upsOutputFrequency:      "1.3.6.1.2.1.33.1.4.2.0",  // NonNegativeInteger (0.1 Hz)
  upsOutputNumLines:       "1.3.6.1.2.1.33.1.4.3.0",  // NonNegativeInteger
  upsOutputVoltage:        "1.3.6.1.2.1.33.1.4.4.1.2.1", // NonNegativeInteger (RMS Volts)
  upsOutputCurrent:        "1.3.6.1.2.1.33.1.4.4.1.3.1", // NonNegativeInteger (0.1 Amps)
  upsOutputPower:          "1.3.6.1.2.1.33.1.4.4.1.4.1", // NonNegativeInteger (Watts)
  upsOutputPercentLoad:    "1.3.6.1.2.1.33.1.4.4.1.5.1", // INTEGER (%)

  // Alarms
  upsAlarmsPresent:        "1.3.6.1.2.1.33.1.6.1.0",  // Gauge32
} as const;

// ── Result Types ─────────────────────────────────────────────────────────────

export type UpsVendor = "apc" | "rfc1628" | "nut" | "unknown";

/** How KumaMap reaches a given UPS. */
export type UpsProtocol = "snmp" | "nut";

/**
 * Per-node UPS configuration, stored inside `network_map_nodes.custom_data`.
 * Secrets (`snmpCommunity`, `nutPassword`) are redacted before being sent to
 * unauthenticated clients — see src/lib/redact.ts.
 */
export interface UpsConfig {
  protocol?: UpsProtocol;      // default "snmp"
  ip?: string;
  // SNMP
  snmpCommunity?: string;      // default "public"
  // NUT
  nutPort?: number;            // default 3493
  nutUpsName?: string;         // ups.conf section name; auto-detected if empty
  nutUser?: string;
  nutPassword?: string;
  // Uptime Kuma linkage
  kumaMonitorId?: number | null;
  // Alert thresholds (percent / minutes)
  alertChargeBelow?: number;   // default 30
  alertLoadAbove?: number;     // default 90
  alertRuntimeBelow?: number;  // default 5
}

export type UpsOutputStatus =
  | "onLine" | "onBattery" | "onSmartBoost" | "onSmartTrim"
  | "bypass" | "off" | "ecoMode" | "unknown";

export type UpsBatteryHealth =
  | "normal" | "low" | "depleted" | "replace" | "fault" | "unknown";

export interface UpsIdentity {
  model?: string;
  name?: string;
  firmware?: string;
  serial?: string;
  manufacturer?: string;
}

export interface UpsBattery {
  charge: number;          // 0-100 %
  health: UpsBatteryHealth;
  temperature?: number;    // °C
  voltage?: number;        // Vdc
  current?: number;        // Amps
  runtimeMinutes?: number; // estimated runtime in minutes
  needsReplacement?: boolean;
}

export interface UpsInput {
  voltage?: number;        // VAC
  frequency?: number;      // Hz
  voltageMax?: number;     // VAC max observed
  voltageMin?: number;     // VAC min observed
}

export interface UpsOutput {
  status: UpsOutputStatus;
  statusRaw?: string;      // human-readable status
  voltage?: number;        // VAC
  frequency?: number;      // Hz
  loadPercent?: number;    // 0-100 %
  current?: number;        // Amps
  power?: number;          // Watts or VA
}

export interface UpsResult {
  ip: string;
  timestamp: number;
  reachable: boolean;
  error?: string;
  cached?: boolean;
  vendor: UpsVendor;
  identity?: UpsIdentity;
  battery?: UpsBattery;
  input?: UpsInput;
  output?: UpsOutput;
}

/** Single data point stored in the history ring buffer */
export interface UpsHistoryPoint {
  t: number;               // unix ms
  charge: number;          // battery %
  load: number;            // output load %
  inputV?: number;         // input voltage
  outputV?: number;        // output voltage
  temp?: number;           // battery temperature
  runtime?: number;        // minutes remaining
  status: string;          // output status
}

// ── Helper Utilities ─────────────────────────────────────────────────────────

export function normalizeOutputStatus(raw: string | undefined): UpsOutputStatus {
  if (!raw) return "unknown";
  const lower = raw.toLowerCase();
  if (lower.includes("online") || lower === "normal") return "onLine";
  if (lower.includes("battery")) return "onBattery";
  if (lower.includes("smartboost") || lower === "booster") return "onSmartBoost";
  if (lower.includes("smarttrim") || lower === "reducer") return "onSmartTrim";
  if (lower.includes("bypass")) return "bypass";
  if (lower.includes("off") || lower === "none") return "off";
  if (lower.includes("eco")) return "ecoMode";
  return "unknown";
}

export function statusColor(status: UpsOutputStatus): string {
  switch (status) {
    case "onLine": return "#22c55e";
    case "onBattery": return "#f59e0b";
    case "onSmartBoost":
    case "onSmartTrim": return "#3b82f6";
    case "bypass": return "#8b5cf6";
    case "off": return "#ef4444";
    case "ecoMode": return "#10b981";
    default: return "#6b7280";
  }
}

export function statusLabel(status: UpsOutputStatus): string {
  switch (status) {
    case "onLine": return "En línea";
    case "onBattery": return "En batería";
    case "onSmartBoost": return "Smart Boost";
    case "onSmartTrim": return "Smart Trim";
    case "bypass": return "Bypass";
    case "off": return "Apagado";
    case "ecoMode": return "Eco Mode";
    default: return "Desconocido";
  }
}

export function batteryColor(charge: number): string {
  if (charge >= 80) return "#22c55e";
  if (charge >= 50) return "#f59e0b";
  if (charge >= 25) return "#f97316";
  return "#ef4444";
}

export function loadColor(load: number): string {
  if (load >= 90) return "#ef4444";
  if (load >= 75) return "#f97316";
  if (load >= 50) return "#f59e0b";
  return "#22c55e";
}

export function runtimeStr(minutes: number | undefined): string {
  if (minutes == null || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
