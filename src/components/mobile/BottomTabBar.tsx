"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMonitorCounts } from "@/hooks/useMonitorCounts";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { hapticTap } from "@/lib/haptics";

const tabs = [
  {
    href: "/mobile",
    label: "Mapas",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#60a5fa" : "#555"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    ),
  },
  {
    href: "/mobile/alerts",
    label: "Alertas",
    badge: true, // will show DOWN count
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#f87171" : "#555"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    href: "/mobile/settings",
    label: "Config",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#a78bfa" : "#555"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
];

export default function BottomTabBar() {
  const pathname = usePathname();
  const { down } = useMonitorCounts();
  const online = useOnlineStatus();

  // Hide on map viewer, rack viewer, camera viewer (need full screen)
  if (
    pathname.startsWith("/mobile/map") ||
    pathname.startsWith("/mobile/rack") ||
    pathname.startsWith("/mobile/camera")
  ) return null;

  return (
    <>
      {/* Spacer */}
      <div className="h-16 safe-bottom" />

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 safe-bottom"
        style={{
          background: "rgba(10,10,10,0.95)",
          backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Online/offline indicator strip */}
        {!online && (
          <div
            className="h-5 flex items-center justify-center gap-1.5"
            style={{ background: "rgba(239,68,68,0.15)" }}
          >
            <div className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[9px] font-bold text-red-400">Sin conexión</span>
          </div>
        )}

        <div className="flex items-center justify-around h-14 max-w-md mx-auto">
          {tabs.map((tab) => {
            const isActive = tab.href === "/mobile"
              ? pathname === "/mobile"
              : pathname.startsWith(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => hapticTap()}
                className="relative flex flex-col items-center gap-0.5 px-4 py-1 transition-all active:scale-95"
              >
                <div className="relative">
                  {tab.icon(isActive)}
                  {/* Badge for down monitors */}
                  {"badge" in tab && tab.badge && down > 0 && (
                    <span
                      className="absolute -top-1.5 -right-2 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-bold text-white px-1"
                      style={{
                        background: "#ef4444",
                        boxShadow: "0 0 6px rgba(239,68,68,0.6)",
                        animation: "badge-pulse 2s ease-in-out infinite",
                      }}
                    >
                      {down > 99 ? "99+" : down}
                    </span>
                  )}
                </div>
                <span
                  className="text-[9px] font-bold"
                  style={{ color: isActive ? "#ededed" : "#555" }}
                >
                  {tab.label}
                </span>
                {/* Active indicator dot */}
                {isActive && (
                  <div
                    className="absolute -bottom-0.5 h-0.5 w-4 rounded-full"
                    style={{ background: isActive ? (tab.href === "/mobile/alerts" ? "#f87171" : tab.href === "/mobile/settings" ? "#a78bfa" : "#60a5fa") : "transparent" }}
                  />
                )}
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
