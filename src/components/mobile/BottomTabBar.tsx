"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMonitorCounts } from "@/hooks/useMonitorCounts";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { hapticTap } from "@/lib/haptics";

interface Tab {
  href: string;
  label: string;
  activeColor: string;
  glowColor: string;
  badge?: boolean;
  icon: (active: boolean, inactiveColor: string) => React.ReactNode;
}

const tabs: Tab[] = [
  {
    href: "/mobile",
    label: "Mapas",
    activeColor: "#3b82f6",
    glowColor: "rgba(59,130,246,0.4)",
    icon: (active, inactive) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "#3b82f6" : inactive} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    ),
  },
  {
    href: "/mobile/racks",
    label: "Racks",
    activeColor: "#10b981",
    glowColor: "rgba(16,185,129,0.4)",
    icon: (active, inactive) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "#10b981" : inactive} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2" />
        <line x1="6" y1="7" x2="18" y2="7" />
        <line x1="6" y1="12" x2="18" y2="12" />
        <line x1="6" y1="17" x2="18" y2="17" />
        <circle cx="16" cy="7" r="1" fill={active ? "#10b981" : inactive} />
        <circle cx="16" cy="12" r="1" fill={active ? "#10b981" : inactive} />
        <circle cx="16" cy="17" r="1" fill={active ? "#10b981" : inactive} />
      </svg>
    ),
  },
  {
    href: "/mobile/cameras",
    label: "Camaras",
    activeColor: "#06b6d4",
    glowColor: "rgba(6,182,212,0.4)",
    icon: (active, inactive) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "#06b6d4" : inactive} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m22 8-6 4 6 4V8Z" />
        <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
      </svg>
    ),
  },
  {
    href: "/mobile/alerts",
    label: "Alertas",
    activeColor: "#f87171",
    glowColor: "rgba(248,113,113,0.4)",
    badge: true,
    icon: (active, inactive) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "#f87171" : inactive} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    href: "/mobile/settings",
    label: "Config",
    activeColor: "#a78bfa",
    glowColor: "rgba(167,139,250,0.4)",
    icon: (active, inactive) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "#a78bfa" : inactive} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export default function BottomTabBar() {
  const pathname = usePathname();
  const { down } = useMonitorCounts();
  const online = useOnlineStatus();

  // Hide on fullscreen viewer pages
  if (
    pathname.startsWith("/mobile/map") ||
    pathname.startsWith("/mobile/rack") ||
    pathname.startsWith("/mobile/camera")
  ) {
    if (!pathname.startsWith("/mobile/racks") && !pathname.startsWith("/mobile/cameras")) return null;
  }

  return (
    <>
      {/* Spacer */}
      <div style={{ height: 96 }} className="safe-bottom" />

      {/* Offline indicator */}
      {!online && (
        <div
          style={{
            position: "fixed",
            bottom: 100,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            background: "rgba(239,68,68,0.85)",
            backdropFilter: "blur(16px)",
            borderRadius: 24,
            padding: "6px 16px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            boxShadow: "0 4px 20px rgba(239,68,68,0.3)",
          }}
        >
          <div style={{ height: 7, width: 7, borderRadius: "50%", background: "#fff", animation: "badge-pulse 2s ease-in-out infinite" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>Sin conexión</span>
        </div>
      )}

      {/* ── Liquid Glass Dock ── */}
      <nav
        style={{
          position: "fixed",
          bottom: 12,
          left: 20,
          right: 20,
          zIndex: 50,
          borderRadius: 28,
          /* Multi-layer glass effect */
          background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.06) 100%)",
          backdropFilter: "blur(50px) saturate(200%) brightness(1.1)",
          WebkitBackdropFilter: "blur(50px) saturate(200%) brightness(1.1)",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow: `
            0 20px 60px rgba(0,0,0,0.3),
            0 8px 24px rgba(0,0,0,0.15),
            inset 0 1px 0 rgba(255,255,255,0.12),
            inset 0 -1px 0 rgba(255,255,255,0.04)
          `,
          paddingBottom: "env(safe-area-inset-bottom, 0)",
          overflow: "hidden",
        }}
      >
        {/* Inner highlight strip */}
        <div style={{
          position: "absolute",
          top: 0,
          left: "10%",
          right: "10%",
          height: 1,
          background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 30%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.2) 70%, transparent 100%)",
          borderRadius: 1,
        }} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            height: 72,
            maxWidth: 480,
            margin: "0 auto",
            padding: "0 4px",
          }}
        >
          {tabs.map((tab) => {
            const isActive =
              tab.href === "/mobile"
                ? pathname === "/mobile"
                : pathname.startsWith(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => hapticTap()}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  padding: "8px 18px",
                  borderRadius: 20,
                  textDecoration: "none",
                  transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                  minWidth: isActive ? 76 : 52,
                }}
              >
                {/* Active glow background */}
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 20,
                      background: `radial-gradient(ellipse at center, ${tab.activeColor}20 0%, ${tab.activeColor}08 70%, transparent 100%)`,
                      border: `1px solid ${tab.activeColor}30`,
                      boxShadow: `0 0 20px ${tab.glowColor}, inset 0 0 12px ${tab.activeColor}10`,
                      transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  />
                )}

                {/* Icon */}
                <div style={{
                  position: "relative",
                  zIndex: 1,
                  transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  transform: isActive ? "scale(1.1) translateY(-1px)" : "scale(1)",
                  filter: isActive ? `drop-shadow(0 0 6px ${tab.glowColor})` : "none",
                }}>
                  {tab.icon(isActive, "var(--tab-inactive)")}
                  {/* Badge */}
                  {tab.badge && down > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: -7,
                        right: -12,
                        minWidth: 20,
                        height: 20,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 12,
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#fff",
                        padding: "0 5px",
                        background: "linear-gradient(135deg, #ef4444, #dc2626)",
                        boxShadow: "0 2px 10px rgba(239,68,68,0.6), 0 0 0 2px rgba(0,0,0,0.3)",
                        animation: "badge-pulse 2s ease-in-out infinite",
                      }}
                    >
                      {down > 99 ? "99+" : down}
                    </span>
                  )}
                </div>

                {/* Label */}
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    color: isActive ? tab.activeColor : "var(--tab-inactive)",
                    opacity: isActive ? 1 : 0.6,
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    textShadow: isActive ? `0 0 12px ${tab.glowColor}` : "none",
                  }}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <style>{`
        .safe-bottom { padding-bottom: env(safe-area-inset-bottom, 0); }
        @keyframes badge-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>
    </>
  );
}
