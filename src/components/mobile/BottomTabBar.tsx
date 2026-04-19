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
  badge?: boolean;
  icon: (active: boolean, inactiveColor: string) => React.ReactNode;
}

const tabs: Tab[] = [
  {
    href: "/mobile",
    label: "Mapas",
    activeColor: "#3b82f6",
    icon: (active, inactive) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#3b82f6" : inactive} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
    icon: (active, inactive) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#10b981" : inactive} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
    href: "/mobile/alerts",
    label: "Alertas",
    activeColor: "#f87171",
    badge: true,
    icon: (active, inactive) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#f87171" : inactive} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    href: "/mobile/settings",
    label: "Config",
    activeColor: "#a78bfa",
    icon: (active, inactive) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#a78bfa" : inactive} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
    // But show on /mobile/racks (the list page)
    if (!pathname.startsWith("/mobile/racks")) return null;
  }

  return (
    <>
      {/* Spacer to prevent content from hiding behind the floating bar */}
      <div style={{ height: 80 }} className="safe-bottom" />

      {/* Offline indicator */}
      {!online && (
        <div
          style={{
            position: "fixed",
            bottom: 84,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            background: "rgba(239,68,68,0.9)",
            backdropFilter: "blur(12px)",
            borderRadius: 20,
            padding: "4px 14px",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <div
            style={{
              height: 6,
              width: 6,
              borderRadius: "50%",
              background: "#fff",
              animation: "badge-pulse 2s ease-in-out infinite",
            }}
          />
          <span style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>Sin conexion</span>
        </div>
      )}

      {/* Liquid Glass Tab Bar */}
      <nav
        style={{
          position: "fixed",
          bottom: 8,
          left: 16,
          right: 16,
          zIndex: 50,
          borderRadius: 22,
          background: "var(--glass-bg)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          border: "1px solid var(--glass-border)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05)",
          paddingBottom: "env(safe-area-inset-bottom, 0)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            height: 64,
            maxWidth: 480,
            margin: "0 auto",
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
                  gap: 2,
                  padding: "6px 16px",
                  borderRadius: 16,
                  textDecoration: "none",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  background: isActive ? `${tab.activeColor}15` : "transparent",
                  minWidth: isActive ? 72 : 48,
                }}
              >
                {/* Active glow pill behind icon */}
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 16,
                      background: `${tab.activeColor}12`,
                      border: `1px solid ${tab.activeColor}25`,
                      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  />
                )}

                {/* Icon */}
                <div style={{ position: "relative", zIndex: 1 }}>
                  {tab.icon(isActive, "var(--tab-inactive)")}
                  {/* Badge */}
                  {tab.badge && down > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -10,
                        minWidth: 18,
                        height: 18,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 10,
                        fontSize: 9,
                        fontWeight: 800,
                        color: "#fff",
                        padding: "0 5px",
                        background: "#ef4444",
                        boxShadow: "0 2px 8px rgba(239,68,68,0.5)",
                        animation: "badge-pulse 2s ease-in-out infinite",
                      }}
                    >
                      {down > 99 ? "99+" : down}
                    </span>
                  )}
                </div>

                {/* Label - visible when active */}
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    color: isActive ? tab.activeColor : "var(--tab-inactive)",
                    opacity: isActive ? 1 : 0,
                    maxHeight: isActive ? 14 : 0,
                    overflow: "hidden",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
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
          50% { transform: scale(1.1); }
        }
      `}</style>
    </>
  );
}
