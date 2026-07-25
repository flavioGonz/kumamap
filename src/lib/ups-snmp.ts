/**
 * SNMP UPS poller — APC PowerNet MIB with an RFC 1628 (standard UPS-MIB) fallback.
 *
 * Extracted from /api/ups/poll so that both the HTTP route AND the server-side
 * background monitor (lib/ups-monitor.ts) can use it. Previously this logic only
 * existed inside the route handler, which meant a UPS was only ever polled while
 * a user had the panel open.
 */

import snmp from "net-snmp";
import {
  APC_OID,
  RFC1628_OID,
  APC_BATTERY_STATUS,
  APC_OUTPUT_STATUS,
  RFC_BATTERY_STATUS,
  RFC_OUTPUT_SOURCE,
  normalizeOutputStatus,
  type UpsResult,
  type UpsIdentity,
  type UpsBattery,
  type UpsInput,
  type UpsOutput,
  type UpsBatteryHealth,
} from "./ups";

// ── SNMP helpers ─────────────────────────────────────────────────────────────

function toNumber(val: any): number {
  if (typeof val === "number") return val;
  if (Buffer.isBuffer(val)) return parseInt(val.toString(), 10) || 0;
  return Number(val) || 0;
}

function toStr(val: any): string {
  if (typeof val === "string") return val;
  if (Buffer.isBuffer(val)) return val.toString("utf8");
  return String(val);
}

function snmpGet(session: any, oids: string[]): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("SNMP get timeout")), 5000);
    session.get(oids, (error: any, varbinds: any[]) => {
      clearTimeout(timeout);
      if (error) return reject(error);
      const result: Record<string, any> = {};
      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) continue;
        result[vb.oid] = vb.value;
      }
      resolve(result);
    });
  });
}

interface UpsReading {
  identity: UpsIdentity;
  battery: UpsBattery;
  input: UpsInput;
  output: UpsOutput;
}

// ── APC PowerNet MIB ─────────────────────────────────────────────────────────

async function tryApc(session: any): Promise<UpsReading | null> {
  try {
    // Probe: if the APC model OID answers, this is an APC unit.
    const probe = await snmpGet(session, [APC_OID.upsIdentModel]);
    if (!probe[APC_OID.upsIdentModel]) return null;

    const oids = [
      APC_OID.upsIdentModel, APC_OID.upsIdentName,
      APC_OID.upsIdentFirmwareRevision, APC_OID.upsIdentSerialNumber,
      APC_OID.upsBasicBatteryStatus, APC_OID.upsAdvBatteryCapacity,
      APC_OID.upsAdvBatteryTemperature, APC_OID.upsAdvBatteryRunTimeRemaining,
      APC_OID.upsAdvBatteryReplaceIndicator, APC_OID.upsAdvBatteryActualVoltage,
      APC_OID.upsAdvInputLineVoltage, APC_OID.upsAdvInputFrequency,
      APC_OID.upsAdvInputMaxLineVoltage, APC_OID.upsAdvInputMinLineVoltage,
      APC_OID.upsBasicOutputStatus, APC_OID.upsAdvOutputVoltage,
      APC_OID.upsAdvOutputFrequency, APC_OID.upsAdvOutputLoad,
      APC_OID.upsAdvOutputCurrent, APC_OID.upsAdvOutputApparentPower,
    ];

    const d = await snmpGet(session, oids);
    const v = (oid: string) => d[oid];

    const identity: UpsIdentity = {
      model: v(APC_OID.upsIdentModel) ? toStr(v(APC_OID.upsIdentModel)) : undefined,
      name: v(APC_OID.upsIdentName) ? toStr(v(APC_OID.upsIdentName)) : undefined,
      firmware: v(APC_OID.upsIdentFirmwareRevision) ? toStr(v(APC_OID.upsIdentFirmwareRevision)) : undefined,
      serial: v(APC_OID.upsIdentSerialNumber) ? toStr(v(APC_OID.upsIdentSerialNumber)) : undefined,
      manufacturer: "APC",
    };

    const batStatusRaw = v(APC_OID.upsBasicBatteryStatus) != null ? toNumber(v(APC_OID.upsBasicBatteryStatus)) : 1;
    const batStatus = APC_BATTERY_STATUS[batStatusRaw] || "unknown";
    const replaceIndicator = v(APC_OID.upsAdvBatteryReplaceIndicator) != null ? toNumber(v(APC_OID.upsAdvBatteryReplaceIndicator)) : 1;
    const runtimeTicks = v(APC_OID.upsAdvBatteryRunTimeRemaining) != null ? toNumber(v(APC_OID.upsAdvBatteryRunTimeRemaining)) : 0;

    let health: UpsBatteryHealth = "unknown";
    if (batStatus === "batteryNormal") health = "normal";
    else if (batStatus === "batteryLow") health = "low";
    else if (batStatus === "batteryInFaultCondition") health = "fault";
    if (replaceIndicator === 2) health = "replace";

    const battery: UpsBattery = {
      charge: v(APC_OID.upsAdvBatteryCapacity) != null ? toNumber(v(APC_OID.upsAdvBatteryCapacity)) : 0,
      health,
      temperature: v(APC_OID.upsAdvBatteryTemperature) != null ? toNumber(v(APC_OID.upsAdvBatteryTemperature)) : undefined,
      voltage: v(APC_OID.upsAdvBatteryActualVoltage) != null ? toNumber(v(APC_OID.upsAdvBatteryActualVoltage)) : undefined,
      // APC reports runtime as TimeTicks (hundredths of a second).
      runtimeMinutes: runtimeTicks > 0 ? Math.round(runtimeTicks / 100 / 60) : undefined,
      needsReplacement: replaceIndicator === 2,
    };

    const input: UpsInput = {
      voltage: v(APC_OID.upsAdvInputLineVoltage) != null ? toNumber(v(APC_OID.upsAdvInputLineVoltage)) : undefined,
      frequency: v(APC_OID.upsAdvInputFrequency) != null ? toNumber(v(APC_OID.upsAdvInputFrequency)) : undefined,
      voltageMax: v(APC_OID.upsAdvInputMaxLineVoltage) != null ? toNumber(v(APC_OID.upsAdvInputMaxLineVoltage)) : undefined,
      voltageMin: v(APC_OID.upsAdvInputMinLineVoltage) != null ? toNumber(v(APC_OID.upsAdvInputMinLineVoltage)) : undefined,
    };

    const outStatusRaw = v(APC_OID.upsBasicOutputStatus) != null ? toNumber(v(APC_OID.upsBasicOutputStatus)) : 1;
    const outStatusStr = APC_OUTPUT_STATUS[outStatusRaw] || "unknown";

    const output: UpsOutput = {
      status: normalizeOutputStatus(outStatusStr),
      statusRaw: outStatusStr,
      voltage: v(APC_OID.upsAdvOutputVoltage) != null ? toNumber(v(APC_OID.upsAdvOutputVoltage)) : undefined,
      frequency: v(APC_OID.upsAdvOutputFrequency) != null ? toNumber(v(APC_OID.upsAdvOutputFrequency)) : undefined,
      loadPercent: v(APC_OID.upsAdvOutputLoad) != null ? toNumber(v(APC_OID.upsAdvOutputLoad)) : undefined,
      current: v(APC_OID.upsAdvOutputCurrent) != null ? toNumber(v(APC_OID.upsAdvOutputCurrent)) : undefined,
      power: v(APC_OID.upsAdvOutputApparentPower) != null ? toNumber(v(APC_OID.upsAdvOutputApparentPower)) : undefined,
    };

    return { identity, battery, input, output };
  } catch {
    return null;
  }
}

// ── RFC 1628 UPS-MIB (vendor-neutral) ────────────────────────────────────────

async function tryRfc1628(session: any): Promise<UpsReading | null> {
  try {
    const oids = [
      RFC1628_OID.upsIdentManufacturer, RFC1628_OID.upsIdentModel,
      RFC1628_OID.upsIdentUPSSoftwareVersion, RFC1628_OID.upsIdentName,
      RFC1628_OID.upsBatteryStatus, RFC1628_OID.upsEstimatedChargeRemaining,
      RFC1628_OID.upsEstimatedMinutesRemaining, RFC1628_OID.upsBatteryVoltage,
      RFC1628_OID.upsBatteryTemperature,
      RFC1628_OID.upsInputVoltage, RFC1628_OID.upsInputFrequency,
      RFC1628_OID.upsOutputSource, RFC1628_OID.upsOutputVoltage,
      RFC1628_OID.upsOutputFrequency, RFC1628_OID.upsOutputPercentLoad,
      RFC1628_OID.upsOutputCurrent, RFC1628_OID.upsOutputPower,
      RFC1628_OID.upsAlarmsPresent,
    ];

    const d = await snmpGet(session, oids);
    const v = (oid: string) => d[oid];

    if (!Object.values(d).some((val) => val != null)) return null;

    const identity: UpsIdentity = {
      manufacturer: v(RFC1628_OID.upsIdentManufacturer) ? toStr(v(RFC1628_OID.upsIdentManufacturer)) : undefined,
      model: v(RFC1628_OID.upsIdentModel) ? toStr(v(RFC1628_OID.upsIdentModel)) : undefined,
      firmware: v(RFC1628_OID.upsIdentUPSSoftwareVersion) ? toStr(v(RFC1628_OID.upsIdentUPSSoftwareVersion)) : undefined,
      name: v(RFC1628_OID.upsIdentName) ? toStr(v(RFC1628_OID.upsIdentName)) : undefined,
    };

    const batStatusRaw = v(RFC1628_OID.upsBatteryStatus) != null ? toNumber(v(RFC1628_OID.upsBatteryStatus)) : 1;
    const batStatusStr = RFC_BATTERY_STATUS[batStatusRaw] || "unknown";

    let health: UpsBatteryHealth = "unknown";
    if (batStatusStr === "batteryNormal") health = "normal";
    else if (batStatusStr === "batteryLow") health = "low";
    else if (batStatusStr === "batteryDepleted") health = "depleted";

    const batVoltageRaw = v(RFC1628_OID.upsBatteryVoltage) != null ? toNumber(v(RFC1628_OID.upsBatteryVoltage)) : undefined;

    const battery: UpsBattery = {
      charge: v(RFC1628_OID.upsEstimatedChargeRemaining) != null ? toNumber(v(RFC1628_OID.upsEstimatedChargeRemaining)) : 0,
      health,
      temperature: v(RFC1628_OID.upsBatteryTemperature) != null ? toNumber(v(RFC1628_OID.upsBatteryTemperature)) : undefined,
      voltage: batVoltageRaw != null ? batVoltageRaw / 10 : undefined, // 0.1 Vdc
      runtimeMinutes: v(RFC1628_OID.upsEstimatedMinutesRemaining) != null ? toNumber(v(RFC1628_OID.upsEstimatedMinutesRemaining)) : undefined,
    };

    const inFreqRaw = v(RFC1628_OID.upsInputFrequency) != null ? toNumber(v(RFC1628_OID.upsInputFrequency)) : undefined;
    const input: UpsInput = {
      voltage: v(RFC1628_OID.upsInputVoltage) != null ? toNumber(v(RFC1628_OID.upsInputVoltage)) : undefined,
      frequency: inFreqRaw != null ? inFreqRaw / 10 : undefined, // 0.1 Hz
    };

    const outSourceRaw = v(RFC1628_OID.upsOutputSource) != null ? toNumber(v(RFC1628_OID.upsOutputSource)) : 1;
    const outSourceStr = RFC_OUTPUT_SOURCE[outSourceRaw] || "unknown";
    const outFreqRaw = v(RFC1628_OID.upsOutputFrequency) != null ? toNumber(v(RFC1628_OID.upsOutputFrequency)) : undefined;
    const outCurrentRaw = v(RFC1628_OID.upsOutputCurrent) != null ? toNumber(v(RFC1628_OID.upsOutputCurrent)) : undefined;

    const output: UpsOutput = {
      status: normalizeOutputStatus(outSourceStr),
      statusRaw: outSourceStr,
      voltage: v(RFC1628_OID.upsOutputVoltage) != null ? toNumber(v(RFC1628_OID.upsOutputVoltage)) : undefined,
      frequency: outFreqRaw != null ? outFreqRaw / 10 : undefined,   // 0.1 Hz
      loadPercent: v(RFC1628_OID.upsOutputPercentLoad) != null ? toNumber(v(RFC1628_OID.upsOutputPercentLoad)) : undefined,
      current: outCurrentRaw != null ? outCurrentRaw / 10 : undefined, // 0.1 A
      power: v(RFC1628_OID.upsOutputPower) != null ? toNumber(v(RFC1628_OID.upsOutputPower)) : undefined,
    };

    return { identity, battery, input, output };
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Poll a UPS over SNMP. Tries APC first, then RFC 1628. Never throws. */
export async function pollSnmpUps(ip: string, community: string): Promise<UpsResult> {
  const result: UpsResult = { ip, timestamp: Date.now(), reachable: false, vendor: "unknown" };

  const session = snmp.createSession(ip, community, {
    timeout: 4000,
    retries: 1,
    version: snmp.Version2c,
  });

  try {
    const apc = await tryApc(session);
    if (apc) {
      return { ...result, reachable: true, vendor: "apc", ...apc };
    }

    const rfc = await tryRfc1628(session);
    if (rfc) {
      return { ...result, reachable: true, vendor: "rfc1628", ...rfc };
    }

    result.error = "UPS no respondió a OIDs APC ni RFC 1628";
  } catch (err: any) {
    result.error = err?.message || "SNMP error";
  } finally {
    try {
      session.close();
    } catch {}
  }

  return result;
}
