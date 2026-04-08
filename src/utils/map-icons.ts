export const iconSvgPaths: Record<string, string> = {
  _rack:      '<rect x="3" y="1" width="18" height="22" rx="2"/><line x1="3" x2="21" y1="6.5" y2="6.5"/><line x1="3" x2="21" y1="11.5" y2="11.5"/><line x1="3" x2="21" y1="16.5" y2="16.5"/><circle cx="7" cy="4" r="1"/><circle cx="7" cy="9" r="1"/><circle cx="7" cy="14" r="1"/><circle cx="7" cy="19" r="1"/><rect x="10" y="2.5" width="8" height="2.5" rx="0.5" fill="white" fill-opacity="0.3"/>',
  router:     '<rect width="20" height="8" x="2" y="14" rx="2"/><rect width="20" height="8" x="2" y="2" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  switch:     '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
  ethernet:   '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10v4"/><path d="M10 10v4"/><path d="M14 10v4"/><path d="M18 10v4"/>',
  cable:      '<path d="M17 21v-2a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1"/><path d="M19 15V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V9"/><path d="M21 21v-2h-4"/><path d="M3 5v-2a1 1 0 0 1 1-1v-1a2 2 0 0 0-2 2h2a2 2 0 0 0 2-2v1a1 1 0 0 1 1 1"/><path d="M7 5V3H3"/>',
  wifi:       '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
  antenna:    '<path d="M2 12 7 2"/><path d="m7 12 5-10"/><path d="m12 12 5-10"/><path d="m17 12 5-10"/><path d="M4.5 7h15"/><path d="M12 16v6"/>',
  radio:      '<circle cx="12" cy="12" r="2"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  tower:      '<path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><path d="M16.2 4.7a6.14 6.14 0 0 1 .8 7.5"/><path d="M19.1 1.9a10.14 10.14 0 0 1 0 14.2"/><circle cx="12" cy="9" r="2"/><path d="M12 11v10"/>',
  satellite:  '<path d="M4 10a7.31 7.31 0 0 0 10 10Z"/><path d="m9 15 3-3"/><path d="M17 13a6 6 0 0 0-6-6"/>',
  signal:     '<path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/>',
  globe:      '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  firewall:   '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  shield:     '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  shieldcheck:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  shieldalert:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  lock:       '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  server:     '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  camera:     '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  printer:    '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  phone:      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  monitor:    '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  monitorphone:'<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0-2 2v5"/><path d="M21 19h-3"/>',
  ups:        '<rect width="16" height="10" x="4" y="7" rx="1"/><path d="M10 7V4a2 2 0 0 1 4 0v3"/><path d="M9 17v4"/><path d="M15 17v4"/><path d="M10 11v2"/><path d="M14 11v2"/>',
  battery:    '<rect width="16" height="10" x="2" y="7" rx="2" ry="2"/><line x1="22" x2="22" y1="11" y2="13"/>',
  power:      '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  plug:       '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8Z"/>',
  plugzap:    '<path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"/><path d="m2 22 3-3"/><path d="M7.5 13.5 10 11"/><path d="M10.5 16.5 13 14"/><path d="m18 3-4 4h6l-4 4"/>',
  zap:        '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  cpu:        '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
  chip:       '<path d="M18 12h2"/><path d="M18 8h2"/><path d="M18 16h2"/><path d="M4 12h2"/><path d="M4 8h2"/><path d="M4 16h2"/><rect x="8" y="4" width="8" height="16" rx="1"/>',
  circuit:    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M11 9h4a2 2 0 0 0 2-2V3"/><circle cx="9" cy="9" r="2"/><path d="M7 21v-4a2 2 0 0 1 2-2h4"/><circle cx="15" cy="15" r="2"/>',
  database:   '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  dbzap:      '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/><path d="m11 14 2-2-2-2"/>',
  harddrive:  '<line x1="22" x2="22" y1="12" y2="12"/><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16z"/><path d="M6 16h.01"/><path d="M10 16h.01"/>',
  nas:        '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16z"/><path d="M6 8h.01"/><path d="M6 12h.01"/><path d="M6 16h.01"/><path d="M12 4v16"/>',
  servercog:  '<circle cx="12" cy="12" r="3"/><path d="M4.5 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-.5"/><path d="M4.5 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-.5"/><path d="M6 6h.01"/><path d="M6 18h.01"/>',
  circle:     '<circle cx="12" cy="12" r="10"/>',
  cloud:      '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  cloudcog:   '<circle cx="12" cy="17" r="3"/><path d="M4.2 15.1A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.2"/><path d="m15.7 18.4-.9-.3"/><path d="m9.2 15.9-.9-.3"/><path d="m10.6 20.7.3-.9"/><path d="m13.1 14.2.3-.9"/><path d="m13.6 20.7-.4-1"/><path d="m10.8 14.3-.4-1"/><path d="m8.3 18.6 1-.4"/><path d="m14.7 15.8 1-.4"/>',
  activity:   '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
};

export function getIconSvg(iconName: string, size: number = 14): string {
  const paths = iconSvgPaths[iconName];
  if (!paths) return "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

export function createMarkerIcon(
  L: any,
  color: string,
  pulse: boolean,
  isLinkSource: boolean = false,
  scale: number = 1.0,
  iconName: string = "server",
  hasLinkedMap: boolean = false,
): any {
  const dotSize = Math.round(18 * scale);
  const containerSize = Math.round(28 * scale);
  const pulseSize = Math.round(28 * scale);
  const iconSvgSize = Math.round(12 * scale);
  const ring = isLinkSource ? `border:3px solid #60a5fa;` : `border:2px solid ${color};`;
  const svgHtml = getIconSvg(iconName, iconSvgSize);
  const badgeSize = Math.max(7, Math.round(8 * scale));
  const linkedMapBadge = hasLinkedMap
    ? `<div style="position:absolute;top:-3px;right:-3px;width:${badgeSize}px;height:${badgeSize}px;border-radius:50%;background:#818cf8;border:1.5px solid rgba(0,0,0,0.6);box-shadow:0 0 5px rgba(99,102,241,0.7);z-index:10;" title="Tiene mapa vinculado"></div>`
    : "";
  const innerContent = svgHtml
    ? `<div style="width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${color};${ring}box-shadow:0 0 14px ${color}88, 0 0 4px ${color};cursor:pointer;display:flex;align-items:center;justify-content:center;">${svgHtml}</div>`
    : `<div style="width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${color};${ring}box-shadow:0 0 14px ${color}88, 0 0 4px ${color};cursor:pointer;"></div>`;
  return L.divIcon({
    className: "custom-marker",
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;">
        ${pulse ? `<div style="position:absolute;width:${pulseSize}px;height:${pulseSize}px;border-radius:50%;background:${color}30;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>` : ""}
        ${innerContent}
        ${linkedMapBadge}
      </div>
    `,
    iconSize: [containerSize, containerSize],
    iconAnchor: [containerSize / 2, containerSize / 2],
  });
}
