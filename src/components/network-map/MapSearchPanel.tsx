"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

interface SearchResult {
  id: string;
  label: string;
  subtitle?: string;
  type: "node" | "address" | "coords";
  lat: number;
  lng: number;
  icon?: string;
}

interface MapSearchPanelProps {
  nodes: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    icon: string;
    kuma_monitor_id?: number | null;
    custom_data?: string | null;
  }>;
  isImageMode: boolean;
  onFlyTo: (lat: number, lng: number, label: string) => void;
  /** Place a temporary (non-saved) marker on the map */
  onTempMarker?: (lat: number, lng: number, label: string) => void;
}

function safeJson(s?: string | null): any {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}

/** Detect coordinate patterns: "-34.9, -56.1" or "-34.9 -56.1" or "lat:-34.9 lng:-56.1" */
function parseCoords(q: string): { lat: number; lng: number } | null {
  // "lat:-34.9 lng:-56.1" or "lat: -34.9, lng: -56.1"
  const llMatch = q.match(/lat[:\s]*(-?\d+\.?\d*)[,\s]+lng[:\s]*(-?\d+\.?\d*)/i);
  if (llMatch) {
    const lat = parseFloat(llMatch[1]);
    const lng = parseFloat(llMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  // Two numbers separated by comma or space: "-34.9, -56.1" or "-34.9 -56.1"
  const numMatch = q.trim().match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (numMatch) {
    const a = parseFloat(numMatch[1]);
    const b = parseFloat(numMatch[2]);
    if (!isNaN(a) && !isNaN(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b };
  }
  return null;
}

export default function MapSearchPanel({ nodes, isImageMode, onFlyTo, onTempMarker }: MapSearchPanelProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
        setResults([]);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // Live search
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    const lower = q.toLowerCase();

    // 0. Coordinate match
    const coordResults: SearchResult[] = [];
    const coords = parseCoords(q);
    if (coords) {
      coordResults.push({
        id: "coords-0",
        label: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
        subtitle: "Ir a coordenadas",
        type: "coords",
        lat: coords.lat,
        lng: coords.lng,
      });
    }

    // 1. Node matches
    const nodeResults: SearchResult[] = [];
    for (const n of nodes) {
      if (n.icon === "_waypoint" || n.icon === "_polygon") continue;
      const cd = safeJson(n.custom_data);
      const labelMatch = n.label?.toLowerCase().includes(lower);
      const ipMatch = cd.ip?.toLowerCase().includes(lower);
      const macMatch = cd.mac?.toLowerCase().includes(lower);
      const rackName = cd.rackName?.toLowerCase().includes(lower);
      let deviceMatch: string | null = null;
      if (Array.isArray(cd.devices)) {
        const dev = cd.devices.find((d: any) =>
          d.label?.toLowerCase().includes(lower) || d.managementIp?.toLowerCase().includes(lower)
        );
        if (dev) deviceMatch = dev.label || dev.managementIp;
      }

      if (labelMatch || ipMatch || macMatch || rackName || deviceMatch) {
        let subtitle = "";
        if (cd.ip) subtitle = cd.ip;
        if (cd.type === "rack") subtitle = `Rack · ${cd.devices?.length || 0} equipos`;
        if (deviceMatch && !labelMatch) subtitle = `contiene: ${deviceMatch}`;
        nodeResults.push({
          id: n.id, label: n.label || "Sin nombre", subtitle, type: "node",
          lat: n.x, lng: n.y, icon: n.icon,
        });
      }
    }

    // 2. Address matches (Nominatim — live map only, 3+ chars, not coordinate input)
    let addrResults: SearchResult[] = [];
    if (!isImageMode && q.trim().length >= 3 && !coords) {
      try {
        setLoading(true);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`,
          { headers: { "User-Agent": "KumaMap/1.0" } }
        );
        const data = await res.json();
        addrResults = (data || []).map((r: any, i: number) => ({
          id: `addr-${i}`,
          label: r.display_name?.split(",").slice(0, 2).join(",") || r.display_name,
          subtitle: r.display_name?.split(",").slice(2, 4).join(",").trim() || "",
          type: "address" as const,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
        }));
      } catch { /* ignore */ }
      setLoading(false);
    }

    setResults([...coordResults, ...nodeResults.slice(0, 8), ...addrResults]);
    setSelectedIdx(-1);
  }, [nodes, isImageMode]);

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 250);
  };

  const selectResult = (r: SearchResult) => {
    if (r.type === "node") {
      // Existing node — fly to it
      onFlyTo(r.lat, r.lng, r.label);
    } else {
      // Address or coordinates — fly and place temp marker
      onFlyTo(r.lat, r.lng, r.label);
      onTempMarker?.(r.lat, r.lng, r.label);
    }
    setOpen(false);
    setQuery("");
    setResults([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); setQuery(""); setResults([]); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter" && selectedIdx >= 0 && results[selectedIdx]) { e.preventDefault(); selectResult(results[selectedIdx]); return; }
    if (e.key === "Enter" && results.length > 0) { e.preventDefault(); selectResult(results[0]); return; }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!open) {
    return (
      <div className="fixed top-3 left-3 z-[10000] kumamap-no-print">
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-xl px-3 py-2 transition-all"
          style={{ background: "rgba(10,10,10,0.82)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(24px)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", color: "#888" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(20,20,20,0.9)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; e.currentTarget.style.color = "#ccc"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(10,10,10,0.82)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#888"; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <span className="text-[11px] font-medium">Buscar...</span>
          <kbd className="ml-1 text-[9px] px-1.5 py-0.5 rounded-md font-mono" style={{ background: "rgba(255,255,255,0.06)", color: "#555", border: "1px solid rgba(255,255,255,0.06)" }}>⌘K</kbd>
        </button>
      </div>
    );
  }

  const renderRow = (r: SearchResult) => {
    const globalIdx = results.indexOf(r);
    const iconEl = r.type === "coords" ? (
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.12)" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="4"/></svg>
      </div>
    ) : r.type === "address" ? (
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.1)" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
    ) : r.icon === "_rack" ? (
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="8" x2="16" y1="10" y2="10"/><line x1="8" x2="16" y1="14" y2="14"/></svg>
      </div>
    ) : r.icon === "_camera" ? (
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16.24 7.76-1.804 5.412a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.412a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/></svg>
      </div>
    ) : (
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><circle cx="6" cy="6" r="1" fill="#60a5fa"/><circle cx="6" cy="18" r="1" fill="#60a5fa"/></svg>
      </div>
    );

    return (
      <button key={r.id} onClick={() => selectResult(r)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all"
        style={{ background: selectedIdx === globalIdx ? "rgba(59,130,246,0.12)" : "transparent", borderLeft: selectedIdx === globalIdx ? "2px solid #3b82f6" : "2px solid transparent" }}
        onMouseEnter={() => setSelectedIdx(globalIdx)}>
        {iconEl}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-[#ededed] truncate">{r.label}</div>
          {r.subtitle && <div className="text-[9px] text-[#666] truncate font-mono">{r.subtitle}</div>}
        </div>
        {r.type !== "node" && (
          <span className="text-[8px] px-1.5 py-0.5 rounded-md" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.15)" }}>PIN</span>
        )}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </button>
    );
  };

  // Group results by type
  const coordRes = results.filter(r => r.type === "coords");
  const nodeRes = results.filter(r => r.type === "node");
  const addrRes = results.filter(r => r.type === "address");

  return (
    <div ref={panelRef} className="fixed top-3 left-3 z-[10001] kumamap-no-print" style={{ width: 360 }}>
      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(10,10,10,0.92)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(32px)", boxShadow: "0 12px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)" }}>

        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input ref={inputRef} type="text" value={query} onChange={(e) => handleChange(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={isImageMode ? "Nodo, IP, MAC, coordenadas..." : "Nodo, IP, dirección, coordenadas..."}
            className="flex-1 bg-transparent text-[12px] text-[#ededed] placeholder:text-[#555] focus:outline-none" />
          {loading && <div className="h-3.5 w-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "rgba(96,165,250,0.3)", borderTopColor: "transparent" }} />}
          <button onClick={() => { setOpen(false); setQuery(""); setResults([]); }} className="text-[#555] hover:text-[#ccc] transition-colors">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="max-h-[360px] overflow-y-auto custom-scroll">
            {coordRes.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1"><span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#555" }}>Coordenadas</span></div>
                {coordRes.map(renderRow)}
              </>
            )}
            {nodeRes.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1" style={{ borderTop: coordRes.length > 0 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#555" }}>Nodos del mapa</span>
                </div>
                {nodeRes.map(renderRow)}
              </>
            )}
            {addrRes.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1" style={{ borderTop: (coordRes.length > 0 || nodeRes.length > 0) ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#555" }}>Direcciones</span>
                </div>
                {addrRes.map(renderRow)}
              </>
            )}
          </div>
        )}

        {/* Empty state */}
        {query.trim().length > 0 && results.length === 0 && !loading && (
          <div className="px-4 py-6 text-center">
            <div className="text-[11px] text-[#555]">Sin resultados para &quot;{query}&quot;</div>
            <div className="text-[9px] text-[#444] mt-1">Prueba: nombre, IP, dirección o coordenadas (lat, lng)</div>
          </div>
        )}

        {/* Hint */}
        {!query.trim() && (
          <div className="px-4 py-4">
            <div className="text-[10px] text-[#555] text-center mb-2">
              {isImageMode ? "Buscar nodos por nombre, IP o MAC" : "Buscar nodos, direcciones o coordenadas"}
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {[
                { label: "IP", ex: "192.168.1.1" },
                { label: "Coords", ex: "-34.9, -56.1" },
                ...(!isImageMode ? [{ label: "Dirección", ex: "Av. 18 de Julio" }] : []),
              ].map(h => (
                <button key={h.label} onClick={() => { setQuery(h.ex); doSearch(h.ex); }}
                  className="text-[8px] px-2 py-1 rounded-md transition-colors"
                  style={{ background: "rgba(255,255,255,0.04)", color: "#666", border: "1px solid rgba(255,255,255,0.06)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#aaa"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "#666"; }}>
                  {h.label}: {h.ex}
                </button>
              ))}
            </div>
            <div className="text-[9px] text-[#444] mt-2 text-center">Esc para cerrar · ⌘K para abrir</div>
          </div>
        )}
      </div>
    </div>
  );
}
