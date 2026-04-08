import { NextRequest, NextResponse } from "next/server";

// ── Types (must match RackDesignerDrawer) ─────────────────────────────────────

interface PatchPort {
  port: number; label: string; connected: boolean; destination?: string;
  cableLength?: string; cableColor?: string; isPoe?: boolean;
  poeType?: string; connectedDevice?: string; notes?: string;
}

interface SwitchPort {
  port: number; label: string; connected: boolean; speed?: string;
  isPoe?: boolean; poeWatts?: number; connectedDevice?: string;
  macAddress?: string; vlan?: number; uplink?: boolean; notes?: string;
}

interface RackDevice {
  id: string; unit: number; sizeUnits: number; label: string; type: string;
  color?: string; monitorId?: number | null;
  ports?: PatchPort[]; switchPorts?: SwitchPort[];
  portCount?: number; managementIp?: string; model?: string; brand?: string;
  serial?: string; notes?: string;
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    let XLSX: any;
    try { XLSX = require("xlsx"); } catch {
      return NextResponse.json({ error: "xlsx package not available" }, { status: 503 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const existingDevicesJson = formData.get("devices") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const existingDevices: RackDevice[] = existingDevicesJson ? JSON.parse(existingDevicesJson) : [];

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const wb = XLSX.read(buffer, { type: "buffer" });

    // ── Parse Equipos sheet ───────────────────────────────────────────────────
    const wsEq = wb.Sheets["Equipos"];
    if (!wsEq) {
      return NextResponse.json({ error: "Hoja 'Equipos' no encontrada en el archivo" }, { status: 400 });
    }

    const eqRaw: any[][] = XLSX.utils.sheet_to_json(wsEq, { header: 1, defval: "" });
    if (eqRaw.length < 2) {
      return NextResponse.json({ error: "Hoja 'Equipos' está vacía" }, { status: 400 });
    }

    // Map columns by header name
    const eqHead = eqRaw[0].map((h: any) => String(h).trim());
    const eqCol = (name: string) => eqHead.indexOf(name);

    const updatedDevices: RackDevice[] = [];
    const deviceById = new Map<string, RackDevice>(existingDevices.map(d => [d.id, { ...d }]));

    for (let i = 1; i < eqRaw.length; i++) {
      const row = eqRaw[i];
      const id = String(row[eqCol("ID")] ?? "").trim();
      if (!id) continue;

      const label = String(row[eqCol("Nombre")] ?? "").trim();
      if (!label) continue; // skip blank rows

      const unit = parseInt(String(row[eqCol("U")] ?? "0"), 10);
      const sizeUnits = parseInt(String(row[eqCol("Tamaño (U)")] ?? "1"), 10) || 1;
      const type = String(row[eqCol("Tipo")] ?? "other").trim().toLowerCase() || "other";
      const model = String(row[eqCol("Modelo")] ?? "").trim();
      const brand = String(row[eqCol("Marca")] ?? "").trim();
      const managementIp = String(row[eqCol("IP Gestión")] ?? "").trim();
      const serial = String(row[eqCol("Serial")] ?? "").trim();
      const notes = String(row[eqCol("Notas")] ?? "").trim();

      if (id === "NUEVO") {
        // New device — generate a new ID
        const newDev: RackDevice = {
          id: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          unit: isNaN(unit) ? 1 : unit,
          sizeUnits,
          label,
          type,
          model: model || undefined,
          brand: brand || undefined,
          managementIp: managementIp || undefined,
          serial: serial || undefined,
          notes: notes || undefined,
          portCount: type === "patchpanel" || type === "switch" ? 24 : undefined,
          ports: type === "patchpanel" ? Array.from({ length: 24 }, (_, k) => ({
            port: k + 1, label: `P${k + 1}`, connected: false,
          })) : undefined,
          switchPorts: type === "switch" ? Array.from({ length: 24 }, (_, k) => ({
            port: k + 1, label: `Gi0/${k + 1}`, connected: false, speed: "1G",
          })) : undefined,
        };
        updatedDevices.push(newDev);
      } else {
        // Existing device — update metadata, preserve ports/monitorId/color
        const existing = deviceById.get(id);
        if (existing) {
          const merged: RackDevice = {
            ...existing,
            unit: isNaN(unit) ? existing.unit : unit,
            sizeUnits,
            label,
            type,
            model: model || existing.model,
            managementIp: managementIp || existing.managementIp,
            serial: serial || existing.serial,
            notes: notes || existing.notes,
          };
          if (brand) (merged as any).brand = brand;
          updatedDevices.push(merged);
          deviceById.delete(id);
        }
        // If ID not found in existing, skip (device may have been removed)
      }
    }

    // Re-add any devices that weren't in the template (not deleted, just missing)
    // — actually we DON'T add them back: if it's not in the template, it means user removed it
    // But we should keep devices that weren't in the Equipos sheet (e.g., if template was partial)
    // Conservative approach: only update devices that ARE in template, keep others unchanged
    const templateIds = new Set(updatedDevices.map(d => d.id));
    const keptDevices = existingDevices.filter(d => !templateIds.has(d.id) && d.id !== "NUEVO");
    // Merge updated + kept (not in template)
    const allDevices = [...updatedDevices, ...keptDevices];

    // ── Parse Puertos del Panel ───────────────────────────────────────────────
    const wsPatch = wb.Sheets["Puertos del Panel"];
    if (wsPatch) {
      const patchRaw: any[][] = XLSX.utils.sheet_to_json(wsPatch, { header: 1, defval: "" });
      if (patchRaw.length > 1) {
        const ph = patchRaw[0].map((h: any) => String(h).trim());
        const pc = (name: string) => ph.indexOf(name);

        // Build port updates keyed by deviceId + port number
        const portUpdates = new Map<string, PatchPort>();
        for (let i = 1; i < patchRaw.length; i++) {
          const row = patchRaw[i];
          const devId = String(row[pc("ID Equipo")] ?? "").trim();
          const portNum = parseInt(String(row[pc("Puerto #")] ?? "0"), 10);
          if (!devId || isNaN(portNum) || portNum < 1) continue;

          const port: PatchPort = {
            port: portNum,
            label: String(row[pc("Etiqueta")] ?? `P${portNum}`).trim(),
            connected: String(row[pc("Conectado (1/0)")] ?? "0") === "1",
            destination: String(row[pc("Destino")] ?? "").trim() || undefined,
            connectedDevice: String(row[pc("Dispositivo Conectado")] ?? "").trim() || undefined,
            cableLength: String(row[pc("Largo Cable (m)")] ?? "").trim() || undefined,
            cableColor: String(row[pc("Color Cable")] ?? "").trim() || undefined,
            isPoe: String(row[pc("PoE (1/0)")] ?? "0") === "1",
            poeType: String(row[pc("Tipo PoE")] ?? "").trim() || undefined,
          };
          portUpdates.set(`${devId}:${portNum}`, port);
        }

        // Apply to devices
        allDevices.forEach(d => {
          if (d.type !== "patchpanel" || !d.ports) return;
          d.ports = d.ports.map(p => {
            const updated = portUpdates.get(`${d.id}:${p.port}`);
            return updated ? { ...p, ...updated } : p;
          });
        });
      }
    }

    // ── Parse Puertos del Switch ──────────────────────────────────────────────
    const wsSw = wb.Sheets["Puertos del Switch"];
    if (wsSw) {
      const swRaw: any[][] = XLSX.utils.sheet_to_json(wsSw, { header: 1, defval: "" });
      if (swRaw.length > 1) {
        const sh = swRaw[0].map((h: any) => String(h).trim());
        const sc = (name: string) => sh.indexOf(name);

        const swUpdates = new Map<string, SwitchPort>();
        for (let i = 1; i < swRaw.length; i++) {
          const row = swRaw[i];
          const devId = String(row[sc("ID Equipo")] ?? "").trim();
          const portNum = parseInt(String(row[sc("Puerto #")] ?? "0"), 10);
          if (!devId || isNaN(portNum) || portNum < 1) continue;

          const sp: SwitchPort = {
            port: portNum,
            label: String(row[sc("Etiqueta")] ?? `Gi0/${portNum}`).trim(),
            connected: String(row[sc("Conectado (1/0)")] ?? "0") === "1",
            speed: String(row[sc("Velocidad")] ?? "1G").trim() || "1G",
            connectedDevice: String(row[sc("Dispositivo Conectado")] ?? "").trim() || undefined,
            vlan: (() => { const v = parseInt(String(row[sc("VLAN")] ?? ""), 10); return isNaN(v) ? undefined : v; })(),
            isPoe: String(row[sc("PoE (1/0)")] ?? "0") === "1",
            poeWatts: (() => { const v = parseFloat(String(row[sc("PoE Watts")] ?? "")); return isNaN(v) ? undefined : v; })(),
            uplink: String(row[sc("Uplink (1/0)")] ?? "0") === "1",
            notes: String(row[sc("Notas")] ?? "").trim() || undefined,
          };
          swUpdates.set(`${devId}:${portNum}`, sp);
        }

        // Apply to devices
        allDevices.forEach(d => {
          if (d.type !== "switch" || !d.switchPorts) return;
          d.switchPorts = d.switchPorts.map(p => {
            const updated = swUpdates.get(`${d.id}:${p.port}`);
            return updated ? { ...p, ...updated } : p;
          });
        });
      }
    }

    return NextResponse.json({ devices: allDevices, count: allDevices.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
