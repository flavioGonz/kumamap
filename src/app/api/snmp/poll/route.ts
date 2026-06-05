import { NextRequest, NextResponse } from "next/server";
import snmp from "net-snmp";

// ── In-memory cache (TTL-based) ──────────────────────────────────────────────

interface CacheEntry {
  data: SnmpResult;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30_000; // 30 seconds

function getCached(key: string): SnmpResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: SnmpResult) {
  cache.set(key, { data, ts: Date.now() });
  // Evict old entries periodically
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.ts > CACHE_TTL) cache.delete(k);
    }
  }
}

// ── OID definitions ──────────────────────────────────────────────────────────

// System MIB (universal)
const OID = {
  // System
  sysDescr:    "1.3.6.1.2.1.1.1.0",
  sysUpTime:   "1.3.6.1.2.1.1.3.0",
  sysName:     "1.3.6.1.2.1.1.5.0",
  sysContact:  "1.3.6.1.2.1.1.4.0",
  sysLocation: "1.3.6.1.2.1.1.6.0",

  // IF-MIB (interfaces / switch ports)
  ifNumber:    "1.3.6.1.2.1.2.1.0",
  ifDescr:     "1.3.6.1.2.1.2.2.1.2",      // table
  ifType:      "1.3.6.1.2.1.2.2.1.3",      // table
  ifSpeed:     "1.3.6.1.2.1.2.2.1.5",      // table (bps)
  ifOperStatus:"1.3.6.1.2.1.2.2.1.8",      // table (1=up,2=down)
  ifAdminStatus:"1.3.6.1.2.1.2.2.1.7",     // table
  ifInOctets:  "1.3.6.1.2.1.2.2.1.10",     // table
  ifOutOctets: "1.3.6.1.2.1.2.2.1.16",     // table
  ifInErrors:  "1.3.6.1.2.1.2.2.1.14",     // table
  ifOutErrors: "1.3.6.1.2.1.2.2.1.20",     // table
  ifAlias:     "1.3.6.1.2.1.31.1.1.1.18",  // table (IF-MIB::ifAlias)
  ifHighSpeed: "1.3.6.1.2.1.31.1.1.1.15",  // table (Mbps, 64-bit counter)
  ifHCInOctets: "1.3.6.1.2.1.31.1.1.1.6",  // table (64-bit)
  ifHCOutOctets:"1.3.6.1.2.1.31.1.1.1.10", // table (64-bit)

  // HOST-RESOURCES-MIB (CPU, memory, storage)
  hrProcessorLoad: "1.3.6.1.2.1.25.3.3.1.2",   // table (% per core)
  hrStorageDescr:  "1.3.6.1.2.1.25.2.3.1.3",   // table
  hrStorageSize:   "1.3.6.1.2.1.25.2.3.1.5",   // table (units)
  hrStorageUsed:   "1.3.6.1.2.1.25.2.3.1.6",   // table (units)
  hrStorageAllocationUnits: "1.3.6.1.2.1.25.2.3.1.4", // table (bytes/unit)
  hrSystemUptime:  "1.3.6.1.2.1.25.1.1.0",

  // ENTITY-MIB (hardware sensors)
  entPhysicalDescr: "1.3.6.1.2.1.47.1.1.1.1.2", // table
};

// ── Wireless OID definitions ──────────────────────────────────────────────────

// Ubiquiti airMAX MIB
const UBNT_WIRELESS = {
  ubntWlStatTxRate:    "1.3.6.1.4.1.41112.1.4.1.1.2",   // TX Rate Mbps
  ubntWlStatSsid:      "1.3.6.1.4.1.41112.1.4.1.1.3",   // SSID
  ubntWlStatRssi:      "1.3.6.1.4.1.41112.1.4.1.1.5",   // RSSI
  ubntWlStatSignal:    "1.3.6.1.4.1.41112.1.4.1.1.6",   // Signal dBm
  ubntWlStatNoise:     "1.3.6.1.4.1.41112.1.4.1.1.7",   // Noise dBm
  ubntWlStatCcq:       "1.3.6.1.4.1.41112.1.4.1.1.8",   // CCQ %
  ubntWlStatFreq:      "1.3.6.1.4.1.41112.1.4.5.1.2",   // Frequency MHz
  ubntWlStatChannel:   "1.3.6.1.4.1.41112.1.4.5.1.14",  // Channel width
  ubntStaConnTime:     "1.3.6.1.4.1.41112.1.4.7.1.1.8", // Connection time
};

// MikroTik wireless MIB
const MIKROTIK_WIRELESS = {
  mtxrWlStatTxRate:      "1.3.6.1.4.1.14988.1.1.1.1.1.2",
  mtxrWlStatRxRate:      "1.3.6.1.4.1.14988.1.1.1.1.1.3",
  mtxrWlStatStrength:    "1.3.6.1.4.1.14988.1.1.1.1.1.4",
  mtxrWlStatSsid:        "1.3.6.1.4.1.14988.1.1.1.1.1.5",
  mtxrWlStatFreq:        "1.3.6.1.4.1.14988.1.1.1.1.1.7",
  mtxrWlStatBand:        "1.3.6.1.4.1.14988.1.1.1.1.1.8",
  mtxrWlStatNoiseFloor:  "1.3.6.1.4.1.14988.1.1.1.1.1.9",
};

// Cambium Networks wireless MIB (ePMP / PMP / Force series)
const CAMBIUM_WIRELESS = {
  // cambiumCurrentSoftwareVersion
  cambiumSwVersion:       "1.3.6.1.4.1.17713.21.3.4.3.0",
  // Radio/wireless stats — ePMP series
  cambiumSTADLRSSI:       "1.3.6.1.4.1.17713.21.1.2.3.0",    // DL RSSI (signal) dBm
  cambiumSTAULRSSI:       "1.3.6.1.4.1.17713.21.1.2.4.0",    // UL RSSI dBm
  cambiumSTADLSNR:        "1.3.6.1.4.1.17713.21.1.2.1.0",    // DL SNR dB
  cambiumSTAULSNR:        "1.3.6.1.4.1.17713.21.1.2.2.0",    // UL SNR dB
  cambiumSTADLMCS:        "1.3.6.1.4.1.17713.21.1.2.7.0",    // DL MCS index
  cambiumSTAULMCS:        "1.3.6.1.4.1.17713.21.1.2.8.0",    // UL MCS index
  cambiumSTATxCapacity:   "1.3.6.1.4.1.17713.21.1.2.15.0",   // TX capacity kbps
  cambiumSTARxCapacity:   "1.3.6.1.4.1.17713.21.1.2.16.0",   // RX capacity kbps
  cambiumSTAConnectedAP:  "1.3.6.1.4.1.17713.21.1.2.19.0",   // Connected AP name
  cambiumFrequency:       "1.3.6.1.4.1.17713.21.1.1.5.0",    // Operating frequency MHz
  cambiumChannelWidth:    "1.3.6.1.4.1.17713.21.1.1.9.0",    // Channel bandwidth MHz
  cambiumSSID:            "1.3.6.1.4.1.17713.21.1.1.4.0",    // SSID
  cambiumTxPower:         "1.3.6.1.4.1.17713.21.1.1.6.0",    // TX power dBm
  cambiumSessionUptime:   "1.3.6.1.4.1.17713.21.1.2.20.0",   // Session uptime seconds
  // PMP450 / Force300 series (different OID tree)
  pmp450DLRSSI:           "1.3.6.1.4.1.17713.8.12.2.0",      // DL RSSI
  pmp450ULRSSI:           "1.3.6.1.4.1.17713.8.12.4.0",      // UL RSSI
  pmp450DLSNR:            "1.3.6.1.4.1.17713.8.12.6.0",      // DL SNR
  pmp450ULSNR:            "1.3.6.1.4.1.17713.8.12.8.0",      // UL SNR
  pmp450Frequency:        "1.3.6.1.4.1.17713.8.4.2.0",       // Frequency
  pmp450ChannelWidth:     "1.3.6.1.4.1.17713.8.4.4.0",       // Channel width
  pmp450TxCapacity:       "1.3.6.1.4.1.17713.8.12.12.0",     // TX throughput
  pmp450RxCapacity:       "1.3.6.1.4.1.17713.8.12.14.0",     // RX throughput
};

// Standard IEEE 802.11 MIB
const DOT11_WIRELESS = {
  dot11StationID:           "1.2.840.10036.1.1.1.1",
  dot11CurrentChannel:      "1.2.840.10036.1.1.1.14",
  dot11CurrentTxPowerLevel: "1.2.840.10036.1.4.1.7",
};

// ── SNMP result types ────────────────────────────────────────────────────────

interface SnmpSystem {
  description?: string;
  uptime?: number;    // centiseconds
  uptimeStr?: string;
  name?: string;
  contact?: string;
  location?: string;
}

interface SnmpInterface {
  index: number;
  name: string;
  alias?: string;
  type: number;
  speed: number;        // Mbps
  operStatus: string;   // "up" | "down" | "testing" | "unknown"
  adminStatus: string;
  inOctets: number;
  outOctets: number;
  inErrors: number;
  outErrors: number;
}

interface SnmpStorage {
  description: string;
  sizeMB: number;
  usedMB: number;
  percentUsed: number;
}

interface SnmpCpu {
  cores: number;
  avgLoad: number;  // % average across cores
  perCore: number[];
}

interface SnmpWireless {
  ssid?: string;
  signal?: number;        // dBm
  noise?: number;         // dBm
  snr?: number;           // signal - noise
  ccq?: number;           // % client connection quality
  txRate?: number;        // Mbps
  rxRate?: number;        // Mbps
  frequency?: number;     // MHz
  channelWidth?: number;  // MHz
  connectedTime?: number; // seconds
  dlRssi?: number;        // Downlink RSSI (Cambium)
  ulRssi?: number;        // Uplink RSSI (Cambium)
  dlSnr?: number;         // Downlink SNR (Cambium)
  ulSnr?: number;         // Uplink SNR (Cambium)
  dlMcs?: number;         // DL MCS index
  ulMcs?: number;         // UL MCS index
  txCapacity?: number;    // TX capacity kbps
  rxCapacity?: number;    // RX capacity kbps
  connectedAp?: string;   // Connected AP name
  txPower?: number;       // TX power dBm
  swVersion?: string;     // Software version
  vendor: "ubiquiti" | "mikrotik" | "cambium" | "standard" | "unknown";
  quality: "excellent" | "good" | "fair" | "poor" | "critical";
}

interface SnmpResult {
  ip: string;
  timestamp: number;
  reachable: boolean;
  error?: string;
  system?: SnmpSystem;
  interfaces?: SnmpInterface[];
  storage?: SnmpStorage[];
  cpu?: SnmpCpu;
  wireless?: SnmpWireless | null;
}

// ── SNMP helpers ─────────────────────────────────────────────────────────────

function formatUptime(centisecs: number): string {
  const secs = Math.floor(centisecs / 100);
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const IF_OPER_STATUS: Record<number, string> = {
  1: "up", 2: "down", 3: "testing", 4: "unknown", 5: "dormant", 6: "notPresent", 7: "lowerLayerDown",
};

function snmpGet(session: any, oids: string[]): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("SNMP get timeout"));
    }, 5000);

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

function snmpSubtree(session: any, oid: string, maxRepetitions = 50): Promise<Array<{ oid: string; value: any }>> {
  return new Promise((resolve, reject) => {
    const results: Array<{ oid: string; value: any }> = [];
    const timeout = setTimeout(() => {
      resolve(results); // Return partial results on timeout
    }, 8000);

    session.subtree(
      oid,
      maxRepetitions,
      (varbinds: any[]) => {
        for (const vb of varbinds) {
          if (!snmp.isVarbindError(vb)) {
            results.push({ oid: vb.oid, value: vb.value });
          }
        }
      },
      (error: any) => {
        clearTimeout(timeout);
        if (error) return resolve(results); // partial on error
        resolve(results);
      },
    );
  });
}

function extractIndex(fullOid: string, baseOid: string): number {
  const suffix = fullOid.slice(baseOid.length + 1);
  return parseInt(suffix, 10);
}

function toNumber(val: any): number {
  if (typeof val === "number") return val;
  if (Buffer.isBuffer(val)) return parseInt(val.toString(), 10) || 0;
  return Number(val) || 0;
}

function toString(val: any): string {
  if (typeof val === "string") return val;
  if (Buffer.isBuffer(val)) return val.toString("utf8");
  return String(val);
}

// ── Signal quality classification ─────────────────────────────────────────────

function classifySignal(signal: number | undefined): SnmpWireless["quality"] {
  if (signal == null) return "critical";
  if (signal >= -50) return "excellent";
  if (signal >= -65) return "good";
  if (signal >= -75) return "fair";
  if (signal >= -85) return "poor";
  return "critical";
}

// ── Cambium polling helper ───────────────────────────────────────────────────

async function pollCambium(session: any): Promise<SnmpWireless | null> {
  // Try ePMP OIDs first (subtree walk on 1.3.6.1.4.1.17713.21)
  try {
    const epmpBase = "1.3.6.1.4.1.17713.21";
    const epmpResults = await snmpSubtree(session, epmpBase);
    if (epmpResults.length > 0) {
      const findVal = (baseOid: string): any => {
        for (const r of epmpResults) {
          if (r.oid.startsWith(baseOid)) return r.value;
        }
        return undefined;
      };
      const dlRssi = findVal(CAMBIUM_WIRELESS.cambiumSTADLRSSI);
      const ulRssi = findVal(CAMBIUM_WIRELESS.cambiumSTAULRSSI);
      const dlSnr = findVal(CAMBIUM_WIRELESS.cambiumSTADLSNR);
      const ulSnr = findVal(CAMBIUM_WIRELESS.cambiumSTAULSNR);
      const dlRssiNum = dlRssi != null ? toNumber(dlRssi) : undefined;
      const ulRssiNum = ulRssi != null ? toNumber(ulRssi) : undefined;
      const dlSnrNum = dlSnr != null ? toNumber(dlSnr) : undefined;
      const ulSnrNum = ulSnr != null ? toNumber(ulSnr) : undefined;
      const txCapKbps = findVal(CAMBIUM_WIRELESS.cambiumSTATxCapacity);
      const rxCapKbps = findVal(CAMBIUM_WIRELESS.cambiumSTARxCapacity);
      const txCapNum = txCapKbps != null ? toNumber(txCapKbps) : undefined;
      const rxCapNum = rxCapKbps != null ? toNumber(rxCapKbps) : undefined;
      const swVer = findVal(CAMBIUM_WIRELESS.cambiumSwVersion);

      const result: SnmpWireless = {
        ssid: findVal(CAMBIUM_WIRELESS.cambiumSSID) != null ? toString(findVal(CAMBIUM_WIRELESS.cambiumSSID)) : undefined,
        signal: dlRssiNum,
        snr: dlSnrNum,
        frequency: findVal(CAMBIUM_WIRELESS.cambiumFrequency) != null ? toNumber(findVal(CAMBIUM_WIRELESS.cambiumFrequency)) : undefined,
        channelWidth: findVal(CAMBIUM_WIRELESS.cambiumChannelWidth) != null ? toNumber(findVal(CAMBIUM_WIRELESS.cambiumChannelWidth)) : undefined,
        connectedTime: findVal(CAMBIUM_WIRELESS.cambiumSessionUptime) != null ? toNumber(findVal(CAMBIUM_WIRELESS.cambiumSessionUptime)) : undefined,
        txRate: txCapNum != null ? Math.round(txCapNum / 1000) : undefined,   // kbps → Mbps
        rxRate: rxCapNum != null ? Math.round(rxCapNum / 1000) : undefined,   // kbps → Mbps
        dlRssi: dlRssiNum,
        ulRssi: ulRssiNum,
        dlSnr: dlSnrNum,
        ulSnr: ulSnrNum,
        dlMcs: findVal(CAMBIUM_WIRELESS.cambiumSTADLMCS) != null ? toNumber(findVal(CAMBIUM_WIRELESS.cambiumSTADLMCS)) : undefined,
        ulMcs: findVal(CAMBIUM_WIRELESS.cambiumSTAULMCS) != null ? toNumber(findVal(CAMBIUM_WIRELESS.cambiumSTAULMCS)) : undefined,
        txCapacity: txCapNum,
        rxCapacity: rxCapNum,
        connectedAp: findVal(CAMBIUM_WIRELESS.cambiumSTAConnectedAP) != null ? toString(findVal(CAMBIUM_WIRELESS.cambiumSTAConnectedAP)) : undefined,
        txPower: findVal(CAMBIUM_WIRELESS.cambiumTxPower) != null ? toNumber(findVal(CAMBIUM_WIRELESS.cambiumTxPower)) : undefined,
        swVersion: swVer != null ? toString(swVer) : undefined,
        vendor: "cambium",
        quality: classifySignal(dlRssiNum),
      };
      return result;
    }
  } catch {
    // ePMP OIDs not supported
  }

  // Try PMP450 / Force300 OIDs (subtree walk on 1.3.6.1.4.1.17713.8)
  try {
    const pmpBase = "1.3.6.1.4.1.17713.8";
    const pmpResults = await snmpSubtree(session, pmpBase);
    if (pmpResults.length > 0) {
      const findVal = (baseOid: string): any => {
        for (const r of pmpResults) {
          if (r.oid.startsWith(baseOid)) return r.value;
        }
        return undefined;
      };
      const dlRssi = findVal(CAMBIUM_WIRELESS.pmp450DLRSSI);
      const ulRssi = findVal(CAMBIUM_WIRELESS.pmp450ULRSSI);
      const dlSnr = findVal(CAMBIUM_WIRELESS.pmp450DLSNR);
      const ulSnr = findVal(CAMBIUM_WIRELESS.pmp450ULSNR);
      const dlRssiNum = dlRssi != null ? toNumber(dlRssi) : undefined;
      const ulRssiNum = ulRssi != null ? toNumber(ulRssi) : undefined;
      const dlSnrNum = dlSnr != null ? toNumber(dlSnr) : undefined;
      const ulSnrNum = ulSnr != null ? toNumber(ulSnr) : undefined;
      const txCapKbps = findVal(CAMBIUM_WIRELESS.pmp450TxCapacity);
      const rxCapKbps = findVal(CAMBIUM_WIRELESS.pmp450RxCapacity);
      const txCapNum = txCapKbps != null ? toNumber(txCapKbps) : undefined;
      const rxCapNum = rxCapKbps != null ? toNumber(rxCapKbps) : undefined;

      const result: SnmpWireless = {
        signal: dlRssiNum,
        snr: dlSnrNum,
        frequency: findVal(CAMBIUM_WIRELESS.pmp450Frequency) != null ? toNumber(findVal(CAMBIUM_WIRELESS.pmp450Frequency)) : undefined,
        channelWidth: findVal(CAMBIUM_WIRELESS.pmp450ChannelWidth) != null ? toNumber(findVal(CAMBIUM_WIRELESS.pmp450ChannelWidth)) : undefined,
        txRate: txCapNum != null ? Math.round(txCapNum / 1000) : undefined,   // kbps → Mbps
        rxRate: rxCapNum != null ? Math.round(rxCapNum / 1000) : undefined,   // kbps → Mbps
        dlRssi: dlRssiNum,
        ulRssi: ulRssiNum,
        dlSnr: dlSnrNum,
        ulSnr: ulSnrNum,
        txCapacity: txCapNum,
        rxCapacity: rxCapNum,
        vendor: "cambium",
        quality: classifySignal(dlRssiNum),
      };
      return result;
    }
  } catch {
    // PMP450 OIDs not supported
  }

  return null;
}

// ── Wireless polling (sysDescr-aware: Cambium first if detected) ────────────

async function pollWireless(session: any, sysDescr?: string): Promise<SnmpWireless | null> {
  // If sysDescr hints at Cambium, try Cambium OIDs FIRST
  const isCambiumHint = sysDescr != null && /cambium|cambiumnetworks|epmp|pmp/i.test(sysDescr);

  if (isCambiumHint) {
    const cambiumResult = await pollCambium(session);
    if (cambiumResult) return cambiumResult;
  }

  // Try Ubiquiti (most common in PTP deployments)
  try {
    const ubntBase = "1.3.6.1.4.1.41112.1.4";
    const ubntResults = await snmpSubtree(session, ubntBase);
    if (ubntResults.length > 0) {
      const findVal = (baseOid: string): any => {
        for (const r of ubntResults) {
          if (r.oid.startsWith(baseOid)) return r.value;
        }
        return undefined;
      };
      const signal = findVal(UBNT_WIRELESS.ubntWlStatSignal);
      const noise = findVal(UBNT_WIRELESS.ubntWlStatNoise);
      const signalNum = signal != null ? toNumber(signal) : undefined;
      const noiseNum = noise != null ? toNumber(noise) : undefined;
      const result: SnmpWireless = {
        ssid: findVal(UBNT_WIRELESS.ubntWlStatSsid) != null ? toString(findVal(UBNT_WIRELESS.ubntWlStatSsid)) : undefined,
        signal: signalNum,
        noise: noiseNum,
        snr: signalNum != null && noiseNum != null ? signalNum - noiseNum : undefined,
        ccq: findVal(UBNT_WIRELESS.ubntWlStatCcq) != null ? toNumber(findVal(UBNT_WIRELESS.ubntWlStatCcq)) : undefined,
        txRate: findVal(UBNT_WIRELESS.ubntWlStatTxRate) != null ? toNumber(findVal(UBNT_WIRELESS.ubntWlStatTxRate)) : undefined,
        frequency: findVal(UBNT_WIRELESS.ubntWlStatFreq) != null ? toNumber(findVal(UBNT_WIRELESS.ubntWlStatFreq)) : undefined,
        channelWidth: findVal(UBNT_WIRELESS.ubntWlStatChannel) != null ? toNumber(findVal(UBNT_WIRELESS.ubntWlStatChannel)) : undefined,
        connectedTime: findVal(UBNT_WIRELESS.ubntStaConnTime) != null ? toNumber(findVal(UBNT_WIRELESS.ubntStaConnTime)) : undefined,
        vendor: "ubiquiti",
        quality: classifySignal(signalNum),
      };
      return result;
    }
  } catch {
    // Ubiquiti OIDs not supported, try next
  }

  // Try MikroTik
  try {
    const mtBase = "1.3.6.1.4.1.14988.1.1.1";
    const mtResults = await snmpSubtree(session, mtBase);
    if (mtResults.length > 0) {
      const findVal = (baseOid: string): any => {
        for (const r of mtResults) {
          if (r.oid.startsWith(baseOid)) return r.value;
        }
        return undefined;
      };
      const signal = findVal(MIKROTIK_WIRELESS.mtxrWlStatStrength);
      const noise = findVal(MIKROTIK_WIRELESS.mtxrWlStatNoiseFloor);
      const signalNum = signal != null ? toNumber(signal) : undefined;
      const noiseNum = noise != null ? toNumber(noise) : undefined;
      const result: SnmpWireless = {
        ssid: findVal(MIKROTIK_WIRELESS.mtxrWlStatSsid) != null ? toString(findVal(MIKROTIK_WIRELESS.mtxrWlStatSsid)) : undefined,
        signal: signalNum,
        noise: noiseNum,
        snr: signalNum != null && noiseNum != null ? signalNum - noiseNum : undefined,
        txRate: findVal(MIKROTIK_WIRELESS.mtxrWlStatTxRate) != null ? toNumber(findVal(MIKROTIK_WIRELESS.mtxrWlStatTxRate)) : undefined,
        rxRate: findVal(MIKROTIK_WIRELESS.mtxrWlStatRxRate) != null ? toNumber(findVal(MIKROTIK_WIRELESS.mtxrWlStatRxRate)) : undefined,
        frequency: findVal(MIKROTIK_WIRELESS.mtxrWlStatFreq) != null ? toNumber(findVal(MIKROTIK_WIRELESS.mtxrWlStatFreq)) : undefined,
        vendor: "mikrotik",
        quality: classifySignal(signalNum),
      };
      return result;
    }
  } catch {
    // MikroTik OIDs not supported, try next
  }

  // Try Cambium (if not already tried via sysDescr hint)
  if (!isCambiumHint) {
    const cambiumResult = await pollCambium(session);
    if (cambiumResult) return cambiumResult;
  }

  // Fallback to standard IEEE 802.11 MIB
  try {
    const dot11Base = "1.2.840.10036";
    const dot11Results = await snmpSubtree(session, dot11Base);
    if (dot11Results.length > 0) {
      const findVal = (baseOid: string): any => {
        for (const r of dot11Results) {
          if (r.oid.startsWith(baseOid)) return r.value;
        }
        return undefined;
      };
      const result: SnmpWireless = {
        frequency: findVal(DOT11_WIRELESS.dot11CurrentChannel) != null ? toNumber(findVal(DOT11_WIRELESS.dot11CurrentChannel)) : undefined,
        txRate: findVal(DOT11_WIRELESS.dot11CurrentTxPowerLevel) != null ? toNumber(findVal(DOT11_WIRELESS.dot11CurrentTxPowerLevel)) : undefined,
        vendor: "standard",
        quality: "fair", // Can't determine signal from standard MIB alone
      };
      return result;
    }
  } catch {
    // Standard 802.11 MIB not supported
  }

  return null;
}

// ── Main polling function ────────────────────────────────────────────────────

async function pollDevice(ip: string, community: string, deviceType?: string, mode?: string): Promise<SnmpResult> {
  const result: SnmpResult = {
    ip,
    timestamp: Date.now(),
    reachable: false,
  };

  const session = snmp.createSession(ip, community, {
    timeout: 4000,
    retries: 1,
    version: snmp.Version2c,
  });

  try {
    // ── System info (always) ──
    const sysData = await snmpGet(session, [
      OID.sysDescr, OID.sysUpTime, OID.sysName, OID.sysContact, OID.sysLocation,
    ]);

    result.reachable = true;
    result.system = {
      description: sysData[OID.sysDescr] ? toString(sysData[OID.sysDescr]) : undefined,
      uptime: sysData[OID.sysUpTime] ? toNumber(sysData[OID.sysUpTime]) : undefined,
      uptimeStr: sysData[OID.sysUpTime] ? formatUptime(toNumber(sysData[OID.sysUpTime])) : undefined,
      name: sysData[OID.sysName] ? toString(sysData[OID.sysName]) : undefined,
      contact: sysData[OID.sysContact] ? toString(sysData[OID.sysContact]) : undefined,
      location: sysData[OID.sysLocation] ? toString(sysData[OID.sysLocation]) : undefined,
    };

    // ── Interfaces (switches, routers, any network device) ──
    if (!deviceType || ["switch", "router", "server", "nvr", "pbx"].includes(deviceType)) {
      const [descrList, typeList, speedList, operList, adminList, inList, outList, inErrList, outErrList, aliasList, hiSpeedList] = await Promise.all([
        snmpSubtree(session, OID.ifDescr),
        snmpSubtree(session, OID.ifType),
        snmpSubtree(session, OID.ifSpeed),
        snmpSubtree(session, OID.ifOperStatus),
        snmpSubtree(session, OID.ifAdminStatus),
        snmpSubtree(session, OID.ifInOctets),
        snmpSubtree(session, OID.ifOutOctets),
        snmpSubtree(session, OID.ifInErrors),
        snmpSubtree(session, OID.ifOutErrors),
        snmpSubtree(session, OID.ifAlias).catch(() => []),
        snmpSubtree(session, OID.ifHighSpeed).catch(() => []),
      ]);

      const ifMap = new Map<number, SnmpInterface>();

      for (const item of descrList) {
        const idx = extractIndex(item.oid, OID.ifDescr);
        ifMap.set(idx, {
          index: idx,
          name: toString(item.value),
          type: 0,
          speed: 0,
          operStatus: "unknown",
          adminStatus: "unknown",
          inOctets: 0,
          outOctets: 0,
          inErrors: 0,
          outErrors: 0,
        });
      }

      for (const item of typeList) {
        const idx = extractIndex(item.oid, OID.ifType);
        const iface = ifMap.get(idx);
        if (iface) iface.type = toNumber(item.value);
      }
      for (const item of operList) {
        const idx = extractIndex(item.oid, OID.ifOperStatus);
        const iface = ifMap.get(idx);
        if (iface) iface.operStatus = IF_OPER_STATUS[toNumber(item.value)] || "unknown";
      }
      for (const item of adminList) {
        const idx = extractIndex(item.oid, OID.ifAdminStatus);
        const iface = ifMap.get(idx);
        if (iface) iface.adminStatus = IF_OPER_STATUS[toNumber(item.value)] || "unknown";
      }
      for (const item of inList) {
        const idx = extractIndex(item.oid, OID.ifInOctets);
        const iface = ifMap.get(idx);
        if (iface) iface.inOctets = toNumber(item.value);
      }
      for (const item of outList) {
        const idx = extractIndex(item.oid, OID.ifOutOctets);
        const iface = ifMap.get(idx);
        if (iface) iface.outOctets = toNumber(item.value);
      }
      for (const item of inErrList) {
        const idx = extractIndex(item.oid, OID.ifInErrors);
        const iface = ifMap.get(idx);
        if (iface) iface.inErrors = toNumber(item.value);
      }
      for (const item of outErrList) {
        const idx = extractIndex(item.oid, OID.ifOutErrors);
        const iface = ifMap.get(idx);
        if (iface) iface.outErrors = toNumber(item.value);
      }
      for (const item of aliasList) {
        const idx = extractIndex(item.oid, OID.ifAlias);
        const iface = ifMap.get(idx);
        if (iface) iface.alias = toString(item.value);
      }
      // Prefer ifHighSpeed (Mbps) over ifSpeed (bps)
      for (const item of hiSpeedList) {
        const idx = extractIndex(item.oid, OID.ifHighSpeed);
        const iface = ifMap.get(idx);
        if (iface) iface.speed = toNumber(item.value); // already in Mbps
      }
      // Fallback to ifSpeed for interfaces without ifHighSpeed
      for (const item of speedList) {
        const idx = extractIndex(item.oid, OID.ifSpeed);
        const iface = ifMap.get(idx);
        if (iface && iface.speed === 0) {
          iface.speed = Math.round(toNumber(item.value) / 1_000_000);
        }
      }

      // Filter out loopback (type 24) and null interfaces, sort by index
      result.interfaces = Array.from(ifMap.values())
        .filter(i => i.type !== 24 && i.type !== 1 && i.name && !i.name.startsWith("Null"))
        .sort((a, b) => a.index - b.index);
    }

    // ── CPU load ──
    try {
      const cpuList = await snmpSubtree(session, OID.hrProcessorLoad);
      if (cpuList.length > 0) {
        const loads = cpuList.map(c => toNumber(c.value));
        result.cpu = {
          cores: loads.length,
          avgLoad: Math.round(loads.reduce((a, b) => a + b, 0) / loads.length),
          perCore: loads,
        };
      }
    } catch {
      // hrProcessorLoad not supported
    }

    // ── Storage (disks, RAM) ──
    try {
      const [descrList, sizeList, usedList, allocList] = await Promise.all([
        snmpSubtree(session, OID.hrStorageDescr),
        snmpSubtree(session, OID.hrStorageSize),
        snmpSubtree(session, OID.hrStorageUsed),
        snmpSubtree(session, OID.hrStorageAllocationUnits),
      ]);

      const storageMap = new Map<number, { descr: string; size: number; used: number; alloc: number }>();

      for (const item of descrList) {
        const idx = extractIndex(item.oid, OID.hrStorageDescr);
        storageMap.set(idx, { descr: toString(item.value), size: 0, used: 0, alloc: 1 });
      }
      for (const item of sizeList) {
        const idx = extractIndex(item.oid, OID.hrStorageSize);
        const s = storageMap.get(idx);
        if (s) s.size = toNumber(item.value);
      }
      for (const item of usedList) {
        const idx = extractIndex(item.oid, OID.hrStorageUsed);
        const s = storageMap.get(idx);
        if (s) s.used = toNumber(item.value);
      }
      for (const item of allocList) {
        const idx = extractIndex(item.oid, OID.hrStorageAllocationUnits);
        const s = storageMap.get(idx);
        if (s) s.alloc = toNumber(item.value);
      }

      result.storage = Array.from(storageMap.values())
        .filter(s => s.size > 0)
        .map(s => {
          const sizeMB = Math.round((s.size * s.alloc) / (1024 * 1024));
          const usedMB = Math.round((s.used * s.alloc) / (1024 * 1024));
          return {
            description: s.descr,
            sizeMB,
            usedMB,
            percentUsed: sizeMB > 0 ? Math.round((usedMB / sizeMB) * 100) : 0,
          };
        });
    } catch {
      // HOST-RESOURCES not supported
    }

    // ── Wireless stats (when mode=wireless) ──
    if (mode === "wireless") {
      try {
        result.wireless = await pollWireless(session, result.system?.description);
      } catch {
        result.wireless = null;
      }
    }

  } catch (err: any) {
    result.error = err.message || "SNMP error";
  } finally {
    session.close();
  }

  return result;
}

// ── Route handler ─────────────────────────────────────────────────────────────

// Wireless cache has shorter TTL (15s) since radio stats change fast
const WIRELESS_CACHE_TTL = 15_000;

function getCachedWithTtl(key: string, ttl: number): SnmpResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export async function POST(request: NextRequest) {
  try {
    const { ip, community, deviceType, mode } = await request.json();

    if (!ip) {
      return NextResponse.json({ error: "IP required" }, { status: 400 });
    }

    const comm = community || "public";
    const isWireless = mode === "wireless";
    const cacheKey = `${ip}:${comm}:${deviceType || "all"}${isWireless ? ":wireless" : ""}`;
    const ttl = isWireless ? WIRELESS_CACHE_TTL : CACHE_TTL;

    // Check cache first
    const cached = getCachedWithTtl(cacheKey, ttl);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const result = await pollDevice(ip, comm, deviceType, mode);

    // Only cache successful results
    if (result.reachable) {
      setCache(cacheKey, result);
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("SNMP poll error:", err);
    return NextResponse.json({ error: err.message, reachable: false }, { status: 500 });
  }
}
