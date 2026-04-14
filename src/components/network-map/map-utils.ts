// ── Pure utility functions extracted from LeafletMapView ──────────────────────

/** Format elapsed milliseconds as "HH:MM:SS" or "Xd HH:MM:SS" */
export function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d ${String(rh).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Format a timestamp as "desde 08-abr. 10:33" */
export function formatSince(ts: number): string {
  const dt = new Date(ts);
  const day = dt.toLocaleDateString("es-UY", { day: "2-digit", month: "short" });
  const time = dt.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${time}`;
}

/** Build an SVG sparkline chart from ping history values */
export function buildSparkline(pings: number[], width: number = 200, height: number = 40): string {
  if (pings.length < 2) return "";
  const max = Math.max(...pings, 1);
  const min = Math.min(...pings, 0);
  const range = max - min || 1;
  const step = width / (pings.length - 1);
  const points = pings.map((p, i) => `${i * step},${height - ((p - min) / range) * (height - 4) - 2}`).join(" ");
  const avg = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
  const maxP = Math.round(max);
  const minP = Math.round(min);
  return `
    <div style="margin-top:8px;border-top:1px solid #222;padding-top:6px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:8px;color:#555;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Latencia</span>
        <span style="font-size:8px;color:#888;">min ${minP}ms · avg ${avg}ms · max ${maxP}ms</span>
      </div>
      <svg width="${width}" height="${height}" style="display:block;">
        <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3"/><stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/></linearGradient></defs>
        <polygon points="0,${height} ${points} ${width},${height}" fill="url(#sg)" />
        <polyline points="${points}" fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-linejoin="round" />
        <circle cx="${width}" cy="${points.split(" ").pop()?.split(",")[1]}" r="2.5" fill="#60a5fa" />
      </svg>
    </div>`;
}
