"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Toaster } from "sonner";
import NetworkMapEditor from "@/components/network-map/NetworkMapEditor";
import LoginPage from "@/components/LoginPage";
import MapListView from "@/components/MapListView";
import { useKumaMonitors } from "@/hooks/useKumaMonitors";

// ─── Main Page ──────────────────────────────────
export default function Page() {
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const { monitors, connected } = useKumaMonitors();

  // Transition state: "idle" | "out" | "in"
  const [transPhase, setTransPhase] = useState<"idle" | "out" | "in">("idle");
  const transTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check session on mount
  useEffect(() => {
    const user = localStorage.getItem("kumamap_user");
    setIsAuthenticated(!!user);
  }, []);

  const switchView = useCallback((setter: () => void) => {
    if (transTimerRef.current) clearTimeout(transTimerRef.current);
    setTransPhase("out");
    transTimerRef.current = setTimeout(() => {
      setter();
      setTransPhase("in");
      // Next two frames: trigger CSS transition from "in" → "idle"
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTransPhase("idle");
        });
      });
    }, 220);
  }, []);

  const handleOpenMap = useCallback((id: string) => {
    switchView(() => setSelectedMapId(id));
  }, [switchView]);

  const handleBack = useCallback(() => {
    switchView(() => setSelectedMapId(null));
  }, [switchView]);

  // Loading
  if (isAuthenticated === null) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
    </div>;
  }

  // Login
  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  const viewStyle: React.CSSProperties = {
    transition: transPhase === "out" ? "opacity 0.22s ease, transform 0.22s ease" : "opacity 0.28s ease, transform 0.28s cubic-bezier(0.16,1,0.3,1)",
    opacity: transPhase === "out" || transPhase === "in" ? 0 : 1,
    transform: transPhase === "out"
      ? "scale(0.97) translateY(10px)"
      : transPhase === "in"
        ? "scale(1.02) translateY(-8px)"
        : "scale(1) translateY(0)",
    willChange: "opacity, transform",
  };

  return (
    <>
      <Toaster
        position="bottom-left"
        theme="dark"
        toastOptions={{
          style: {
            background: "rgba(20,20,20,0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)",
            color: "#ededed",
          },
        }}
      />
      <div style={viewStyle}>
        {selectedMapId ? (
          <NetworkMapEditor
            mapId={selectedMapId}
            kumaMonitors={monitors}
            kumaConnected={connected}
            onBack={handleBack}
          />
        ) : (
          <MapListView
            onOpenMap={handleOpenMap}
            kumaMonitors={monitors}
            kumaConnected={connected}
            onLogout={() => setIsAuthenticated(false)}
          />
        )}
      </div>
    </>
  );
}
