"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { Network, MapIcon } from "lucide-react";
import type { KumaMonitor } from "@/components/network-map/MonitorPanel";
import dynamic from "next/dynamic";

// Dynamic import to avoid SSR issues with Leaflet
const LeafletMapView = dynamic(
  () => import("@/components/network-map/LeafletMapView"),
  { ssr: false }
);

interface MapData {
  id: string;
  name: string;
  background_type: string;
  view_state?: string;
  kuma_group_id?: number | null;
  nodes: any[];
  edges: any[];
}

export default function MapViewPage() {
  const params = useParams();
  const mapId = params.id as string;
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [monitors, setMonitors] = useState<KumaMonitor[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch map data
  useEffect(() => {
    fetch(apiUrl(`/api/maps/${mapId}`))
      .then((r) => r.json())
      .then((data) => {
        setMapData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [mapId]);

  // Socket.IO real-time monitors
  useEffect(() => {
    import("@/lib/socket").then(({ getSocket }) => {
      const socket = getSocket();

      const handleMonitors = (data: { connected: boolean; monitors: KumaMonitor[] }) => {
        setConnected(data.connected);
        setMonitors(data.monitors || []);
      };

      socket.on("kuma:monitors", handleMonitors);
      socket.on("disconnect", () => setConnected(false));

      return () => {
        socket.off("kuma:monitors", handleMonitors);
      };
    });
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!mapData) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <div className="text-center text-[#777]">
          <MapIcon className="h-16 w-16 mx-auto mb-4 opacity-20" />
          <h2 className="text-lg font-bold text-[#ededed] mb-1">Mapa no encontrado</h2>
        </div>
      </div>
    );
  }

  // Non-livemap not supported in kiosk view yet
  if (mapData.background_type !== "livemap") {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <div className="text-center text-[#777]">
          <MapIcon className="h-16 w-16 mx-auto mb-4 opacity-20" />
          <h2 className="text-lg font-bold text-[#ededed] mb-1">{mapData.name}</h2>
          <p className="text-sm">Vista completa disponible solo para mapas tipo &ldquo;Mapa real&rdquo;.</p>
          <p className="text-xs mt-2">Cambia el tipo de mapa a &ldquo;Mapa real&rdquo; en el editor.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen relative" style={{ background: "#0a0a0a" }}>
      {/* Name badge */}
      <div
        className="absolute top-4 left-4 z-[10001] flex items-center gap-2 rounded-xl px-3 py-2"
        style={{
          background: "rgba(10,10,10,0.8)",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(16px)",
        }}
      >
        <Network className="h-4 w-4 text-blue-400" />
        <span className="text-sm font-bold text-[#ededed]">{mapData.name}</span>
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: connected ? "#22c55e" : "#ef4444",
            boxShadow: connected ? "0 0 6px #22c55e" : "0 0 6px #ef4444",
          }}
        />
        <span className="text-[10px] text-[#666] font-medium">KIOSKO</span>
      </div>

      {/* Reuse the SAME LeafletMapView from the editor but in readonly mode */}
      <LeafletMapView
        mapId={mapId}
        mapName={mapData.name}
        initialNodes={mapData.nodes}
        initialEdges={mapData.edges}
        kumaMonitors={monitors}
        kumaConnected={connected}
        initialViewState={mapData.view_state ? JSON.parse(mapData.view_state) : undefined}
        onSave={() => {}}
        readonly={true}
      />
    </div>
  );
}
