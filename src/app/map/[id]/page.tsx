"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SileoToaster } from "@/components/ui/SileoToast";
import dynamic from "next/dynamic";
const NetworkMapEditor = dynamic(
  () => import("@/components/network-map/NetworkMapEditor"),
  { ssr: false, loading: () => (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
    </div>
  )}
);
import LoginPage from "@/components/LoginPage";
import { useKumaMonitors } from "@/hooks/useKumaMonitors";

// ─── Map Editor Page (route: /map/[id]) ──────────
export default function MapEditorPage() {
  const params = useParams();
  const router = useRouter();
  const mapId = params.id as string;
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
      <NetworkMapEditor
        mapId={mapId}
        kumaMonitors={monitors}
        kumaConnected={connected}
        onBack={() => router.push("/")}
        onOpenMap={(id) => router.push(`/map/${id}`)}
      />
    </>
  );
}
