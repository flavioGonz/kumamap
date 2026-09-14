"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SileoToaster } from "@/components/ui/SileoToast";
import LoginPage from "@/components/LoginPage";
import MapListView from "@/components/MapListView";
import { useKumaMonitors } from "@/hooks/useKumaMonitors";

// ─── Main Page (map list) ──────────────────────────
export default function Page() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const { monitors, connected } = useKumaMonitors();

  // Check session on mount
  useEffect(() => {
    const user = localStorage.getItem("kumamap_user");
    setIsAuthenticated(!!user);
  }, []);

  // Loading
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  // Login
  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <>
      <SileoToaster />
      <MapListView
        onOpenMap={(id) => router.push(`/map/${id}`)}
        kumaMonitors={monitors}
        kumaConnected={connected}
        onLogout={() => setIsAuthenticated(false)}
      />
    </>
  );
}
