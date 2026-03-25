"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  BackgroundVariant,
  EdgeLabelRenderer,
  BaseEdge,
  getBezierPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";

import KumaMonitorNode, { type KumaNodeData } from "./KumaMonitorNode";
import MonitorPanel, { type KumaMonitor } from "./MonitorPanel";
import MapToolbar from "./MapToolbar";
import ContextMenu, { menuIcons } from "./ContextMenu";

// ─── Custom Edge with interface labels ──────────
function InterfaceEdge({ id, sourceX, sourceY, targetX, targetY, data, style }: any) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} />
      <EdgeLabelRenderer>
        {data?.sourceInterface && (
          <div className="nodrag nopan absolute text-[9px] font-bold rounded px-1 py-0.5" style={{
            transform: `translate(-50%, -50%) translate(${sourceX + (targetX - sourceX) * 0.15}px, ${sourceY + (targetY - sourceY) * 0.15}px)`,
            background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.4)", color: "#60a5fa", pointerEvents: "all",
          }}>{data.sourceInterface}</div>
        )}
        {data?.targetInterface && (
          <div className="nodrag nopan absolute text-[9px] font-bold rounded px-1 py-0.5" style={{
            transform: `translate(-50%, -50%) translate(${sourceX + (targetX - sourceX) * 0.85}px, ${sourceY + (targetY - sourceY) * 0.85}px)`,
            background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#a78bfa", pointerEvents: "all",
          }}>{data.targetInterface}</div>
        )}
        {data?.label && (
          <div className="nodrag nopan absolute text-[8px] font-medium rounded px-1.5 py-0.5" style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.1)", color: "#a0a0a0", pointerEvents: "all",
          }}>{data.label}</div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes: NodeTypes = { kumaMonitor: KumaMonitorNode as any };
const edgeTypes: EdgeTypes = { interface: InterfaceEdge as any };

interface MapData {
  id: string;
  name: string;
  background_type: "grid" | "image" | "livemap";
  background_image: string | null;
  nodes: any[];
  edges: any[];
}

function getIconForType(type: string): string {
  switch (type) {
    case "http": case "keyword": return "globe";
    case "ping": return "wifi";
    case "port": case "steam": return "server";
    case "dns": return "database";
    case "docker": return "cloud";
    default: return "activity";
  }
}

// ─── Leaflet Map Background Component ───────────
function LeafletBackground({ mapMode }: { mapMode: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || initRef.current) return;
    initRef.current = true;

    import("leaflet").then((L) => {
      import("leaflet/dist/leaflet.css");

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (!containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [-34.85, -56.05],
        zoom: 12,
        zoomControl: true,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: true,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 100);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      initRef.current = false;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        opacity: mapMode ? 0.6 : 0.35,
        zIndex: mapMode ? 10 : 0,
        pointerEvents: mapMode ? "auto" : "none",
        transition: "opacity 0.3s",
      }}
    />
  );
}

// ─── Inner Canvas ───────────────────────────────
function CanvasInner({
  mapId, kumaMonitors, kumaConnected, onBack,
}: {
  mapId: string;
  kumaMonitors: KumaMonitor[];
  kumaConnected: boolean;
  onBack: () => void;
}) {
  const reactFlow = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [connectMode, setConnectMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [mapNavMode, setMapNavMode] = useState(false);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number;
    nodeId?: string; edgeId?: string;
  } | null>(null);

  // Load map
  useEffect(() => {
    fetch(`/api/maps/${mapId}`)
      .then((r) => r.json())
      .then((data: MapData) => {
        setMapData(data);
        const rfNodes: Node[] = (data.nodes || []).map((n: any) => ({
          id: n.id,
          type: "kumaMonitor",
          position: { x: n.x, y: n.y },
          style: n.width && n.width !== 120 ? { width: n.width, height: n.height } : undefined,
          data: { label: n.label || "Node", kumaMonitorId: n.kuma_monitor_id, icon: n.icon || "server" } satisfies KumaNodeData,
        }));
        const rfEdges: Edge[] = (data.edges || []).map((e: any) => {
          const cd = e.custom_data ? JSON.parse(e.custom_data) : {};
          return {
            id: e.id, source: e.source_node_id, target: e.target_node_id, type: "interface",
            data: { label: e.label || undefined, sourceInterface: cd.sourceInterface || "", targetInterface: cd.targetInterface || "" },
            style: { stroke: e.color || "#4b5563", strokeWidth: 2, strokeDasharray: e.style === "dashed" ? "5,5" : undefined },
            animated: !!e.animated,
          };
        });
        setNodes(rfNodes);
        setEdges(rfEdges);
        setTimeout(() => reactFlow.fitView({ padding: 0.2 }), 200);
      });
  }, [mapId, setNodes, setEdges, reactFlow]);

  // Update live data from Kuma
  useEffect(() => {
    const map = new Map<number, KumaMonitor>();
    kumaMonitors.forEach((m) => map.set(m.id, m));

    setNodes((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((node) => {
        if (node.data.kumaMonitorId != null) {
          const m = map.get(node.data.kumaMonitorId as number);
          if (m && (node.data.status !== m.status || node.data.ping !== m.ping)) {
            changed = true;
            return { ...node, data: { ...node.data, status: m.status, ping: m.ping, msg: m.msg, type: m.type, url: m.url, uptime24: m.uptime24 } };
          }
        }
        return node;
      });
      return changed ? next : prev;
    });
  }, [kumaMonitors, setNodes]);

  // ─── Context Menu handlers ────────────────────
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setCtxMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setCtxMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
  }, []);

  const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault();
    setCtxMenu({ x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY });
  }, []);

  const getNodeCtxItems = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return [];
    return [
      { label: "Editar nombre", icon: menuIcons.Pencil, onClick: () => editNodeLabel(nodeId) },
      { label: "Redimensionar", icon: menuIcons.Maximize2, onClick: () => resizeNode(nodeId) },
      { label: "Cambiar icono", icon: menuIcons.Palette, onClick: () => changeNodeIcon(nodeId) },
      { label: "Duplicar", icon: menuIcons.Copy, onClick: () => duplicateNode(nodeId) },
      { label: "Eliminar", icon: menuIcons.Trash2, onClick: () => deleteNode(nodeId), danger: true, divider: true },
    ];
  };

  const getEdgeCtxItems = (edgeId: string) => [
    { label: "Editar interfaces", icon: menuIcons.Link2, onClick: () => editEdgeInterfaces(edgeId) },
    { label: "Editar etiqueta", icon: menuIcons.Pencil, onClick: () => editEdgeLabel(edgeId) },
    { label: "Eliminar conexion", icon: menuIcons.Trash2, onClick: () => setEdges((eds) => eds.filter((e) => e.id !== edgeId)), danger: true, divider: true },
  ];

  const getPaneCtxItems = () => [
    { label: "Agregar nodo", icon: menuIcons.Plus, onClick: handleAddNodeAtPos },
    { label: "Ajustar vista", icon: menuIcons.RotateCcw, onClick: () => reactFlow.fitView({ padding: 0.2 }) },
  ];

  // ─── Node edit helpers ────────────────────────
  const editNodeLabel = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    const newLabel = prompt("Nombre:", (node?.data.label as string) || "");
    if (newLabel !== null) {
      setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, label: newLabel || n.data.label } } : n));
    }
  };

  const resizeNode = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    const w = prompt("Ancho (px):", String((node?.style as any)?.width || 170));
    const h = prompt("Alto (px, vacio=auto):", String((node?.style as any)?.height || ""));
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, style: { ...n.style, width: w ? parseInt(w) : undefined, height: h ? parseInt(h) : undefined } } : n));
  };

  const changeNodeIcon = (nodeId: string) => {
    const icons = ["server", "globe", "wifi", "database", "router", "shield", "cpu", "cloud", "monitor", "harddrive", "radio", "activity"];
    const choice = prompt(`Icono (${icons.join(", ")}):`, "server");
    if (choice && icons.includes(choice)) {
      setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, icon: choice } } : n));
    }
  };

  const duplicateNode = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const newNode: Node = {
      ...node,
      id: `node-${Date.now()}`,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: { ...node.data, kumaMonitorId: null, label: `${node.data.label} (copia)` },
      selected: false,
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const deleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  };

  const handleAddNodeAtPos = () => {
    if (!ctxMenu) return;
    const pos = reactFlow.screenToFlowPosition({ x: ctxMenu.x, y: ctxMenu.y });
    setNodes((nds) => [...nds, {
      id: `node-${Date.now()}`,
      type: "kumaMonitor",
      position: pos,
      data: { label: "Nuevo equipo", kumaMonitorId: null, icon: "server" } satisfies KumaNodeData,
    }]);
  };

  // ─── Edge edit helpers ────────────────────────
  const editEdgeInterfaces = (edgeId: string) => {
    const edge = edges.find((e) => e.id === edgeId);
    const srcIf = prompt("Interfaz origen:", edge?.data?.sourceInterface || "");
    const tgtIf = prompt("Interfaz destino:", edge?.data?.targetInterface || "");
    setEdges((eds) => eds.map((e) => e.id === edgeId ? { ...e, data: { ...e.data, sourceInterface: srcIf || "", targetInterface: tgtIf || "" } } : e));
  };

  const editEdgeLabel = (edgeId: string) => {
    const edge = edges.find((e) => e.id === edgeId);
    const label = prompt("Etiqueta cable:", edge?.data?.label || "");
    setEdges((eds) => eds.map((e) => e.id === edgeId ? { ...e, data: { ...e.data, label: label || "" } } : e));
  };

  // ─── Connection & Drop handlers ───────────────
  const onConnect = useCallback((params: Connection) => {
    const srcIf = prompt("Interfaz origen (ej: eth0, Gi0/1, puerto 24):", "") || "";
    const tgtIf = prompt("Interfaz destino (ej: eth1, Gi0/2, puerto 1):", "") || "";
    const label = prompt("Etiqueta del cable (opcional, ej: fibra, cat6):", "") || "";
    setEdges((eds) => addEdge({
      ...params, type: "interface",
      data: { sourceInterface: srcIf, targetInterface: tgtIf, label },
      style: { stroke: "#4b5563", strokeWidth: 2 }, animated: false,
    }, eds));
  }, [setEdges]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/kuma-monitor");
    if (!raw) return;

    const monitor: KumaMonitor = JSON.parse(raw);

    // ── Prevent duplicate monitors ──
    const alreadyExists = nodes.some((n) => n.data.kumaMonitorId === monitor.id);
    if (alreadyExists) {
      toast.error("Monitor duplicado", { description: `"${monitor.name}" ya existe en este mapa` });
      return;
    }

    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setNodes((nds) => [...nds, {
      id: `node-${Date.now()}-${monitor.id}`,
      type: "kumaMonitor",
      position,
      data: {
        label: monitor.name, kumaMonitorId: monitor.id,
        icon: getIconForType(monitor.type),
        status: monitor.status, ping: monitor.ping, msg: monitor.msg,
        type: monitor.type, url: monitor.url, uptime24: monitor.uptime24,
      } satisfies KumaNodeData,
    }]);
    toast.success("Monitor agregado", { description: monitor.name });
  }, [reactFlow, setNodes, nodes]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Double-click node
  const onNodeDoubleClick = useCallback((_e: React.MouseEvent, node: Node) => {
    editNodeLabel(node.id);
  }, [nodes, setNodes]);

  // Double-click edge
  const onEdgeDoubleClick = useCallback((_e: React.MouseEvent, edge: Edge) => {
    editEdgeInterfaces(edge.id);
  }, [edges, setEdges]);

  // ─── Save ─────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const saveNodes = nodes.map((n) => ({
        id: n.id, kuma_monitor_id: n.data.kumaMonitorId ?? null,
        label: n.data.label, x: n.position.x, y: n.position.y,
        width: (n.style as any)?.width || 120, height: (n.style as any)?.height || 80,
        icon: n.data.icon || "server", color: null, custom_data: null,
      }));
      const saveEdges = edges.map((e) => ({
        id: e.id, source_node_id: e.source, target_node_id: e.target,
        label: e.data?.label || null,
        style: (e.style as any)?.strokeDasharray ? "dashed" : "solid",
        color: (e.style as any)?.stroke || "#4b5563",
        animated: e.animated ? 1 : 0,
        custom_data: JSON.stringify({ sourceInterface: e.data?.sourceInterface || "", targetInterface: e.data?.targetInterface || "" }),
      }));
      await fetch(`/api/maps/${mapId}/state`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: saveNodes, edges: saveEdges }),
      });
      toast.success("Mapa guardado");
    } catch { toast.error("Error al guardar"); }
    finally { setSaving(false); }
  }, [mapId, nodes, edges]);

  // ─── Background handlers ──────────────────────
  const handleUploadBg = useCallback(() => fileInputRef.current?.click(), []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("background", file);
    await fetch(`/api/maps/${mapId}/background`, { method: "POST", body: fd });
    const res = await fetch(`/api/maps/${mapId}`);
    setMapData(await res.json());
    toast.success("Fondo actualizado");
    e.target.value = "";
  }, [mapId]);

  const handleSetGrid = useCallback(async () => {
    await fetch(`/api/maps/${mapId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ background_type: "grid", background_image: null }),
    });
    const res = await fetch(`/api/maps/${mapId}`);
    setMapData(await res.json());
    toast.success("Fondo: grilla");
  }, [mapId]);

  const handleSetLiveMap = useCallback(async () => {
    await fetch(`/api/maps/${mapId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ background_type: "livemap", background_image: null }),
    });
    const res = await fetch(`/api/maps/${mapId}`);
    setMapData(await res.json());
    toast.success("Fondo: mapa real OpenStreetMap");
  }, [mapId]);

  // ─── Other toolbar handlers ───────────────────
  const handleAddNode = useCallback(() => {
    const vp = reactFlow.getViewport();
    setNodes((nds) => [...nds, {
      id: `node-${Date.now()}`, type: "kumaMonitor",
      position: { x: -vp.x / vp.zoom + 400, y: -vp.y / vp.zoom + 300 },
      data: { label: "Nuevo equipo", kumaMonitorId: null, icon: "server" } satisfies KumaNodeData,
    }]);
  }, [reactFlow, setNodes]);

  const handleDeleteSelected = useCallback(() => {
    setNodes((nds) => nds.filter((n) => !n.selected));
    setEdges((eds) => eds.filter((e) => !e.selected));
  }, [setNodes, setEdges]);

  const handleAutoLayout = useCallback(() => {
    const cols = Math.ceil(Math.sqrt(nodes.length)) || 1;
    setNodes((nds) => nds.map((node, i) => ({
      ...node, position: { x: (i % cols) * 220 + 50, y: Math.floor(i / cols) * 220 + 50 },
    })));
    setTimeout(() => reactFlow.fitView({ padding: 0.2 }), 50);
  }, [nodes.length, setNodes, reactFlow]);

  const handleSearch = useCallback((query: string) => {
    if (!query) { setNodes((nds) => nds.map((n) => ({ ...n, selected: false }))); return; }
    const q = query.toLowerCase();
    setNodes((nds) => nds.map((n) => ({ ...n, selected: (n.data.label as string)?.toLowerCase().includes(q) })));
    const match = nodes.find((n) => (n.data.label as string)?.toLowerCase().includes(q));
    if (match) reactFlow.setCenter(match.position.x + 60, match.position.y + 40, { zoom: 1.2, duration: 500 });
  }, [setNodes, nodes, reactFlow]);

  const hasSelection = nodes.some((n) => n.selected) || edges.some((e) => e.selected);

  const bgType = mapData?.background_type || "grid";
  const bgImage = bgType === "image" && mapData?.background_image
    ? `/api/uploads/network-maps/${mapData.background_image}` : null;

  return (
    <div className="h-screen w-screen relative">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      <MapToolbar
        mapName={mapData?.name || "Cargando..."}
        onSave={handleSave}
        onUploadBackground={handleUploadBg}
        onSetGrid={handleSetGrid}
        onSetLiveMap={handleSetLiveMap}
        onZoomIn={() => reactFlow.zoomIn()}
        onZoomOut={() => reactFlow.zoomOut()}
        onFitView={() => reactFlow.fitView({ padding: 0.2 })}
        onAutoLayout={handleAutoLayout}
        onAddNode={handleAddNode}
        onDeleteSelected={handleDeleteSelected}
        onToggleConnectMode={() => setConnectMode((v) => !v)}
        onBack={onBack}
        onSearch={handleSearch}
        connectMode={connectMode}
        saving={saving}
        hasSelection={hasSelection}
        isLiveMap={bgType === "livemap"}
        mapNavMode={mapNavMode}
        onToggleMapNav={() => setMapNavMode((v) => !v)}
      />

      <div className="h-full pt-[49px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeDoubleClick={onNodeDoubleClick}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          snapToGrid
          snapGrid={[20, 20]}
          deleteKeyCode="Delete"
          defaultEdgeOptions={{
            type: "interface",
            style: { stroke: "#4b5563", strokeWidth: 2 },
            animated: false,
          }}
          style={{ background: "#0a0a0a" }}
        >
          {/* Background layer */}
          {bgType === "livemap" && <LeafletBackground mapMode={mapNavMode} />}
          {bgImage && (
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: `url(${bgImage})`,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              opacity: 0.3,
            }} />
          )}
          {bgType === "grid" && (
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1a1a1a" />
          )}

          <Controls className="!bottom-4 !left-4" />
          <MiniMap
            className="!bottom-4 !right-[340px]"
            nodeStrokeColor="#333"
            nodeColor={(n) => {
              const s = n.data?.status;
              if (s === 1) return "#22c55e";
              if (s === 0) return "#ef4444";
              if (s === 3) return "#8b5cf6";
              return "#f59e0b";
            }}
            maskColor="rgba(0,0,0,0.2)"
            style={{ background: "#111", borderRadius: "0.75rem", border: "1px solid rgba(255,255,255,0.06)" }}
          />
        </ReactFlow>
      </div>

      <MonitorPanel
        monitors={kumaMonitors}
        connected={kumaConnected}
        collapsed={panelCollapsed}
        onToggleCollapse={() => setPanelCollapsed((v) => !v)}
      />

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={
            ctxMenu.nodeId ? getNodeCtxItems(ctxMenu.nodeId) :
            ctxMenu.edgeId ? getEdgeCtxItems(ctxMenu.edgeId) :
            getPaneCtxItems()
          }
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}

// ─── Wrapper ────────────────────────────────────
export default function NetworkMapEditor(props: {
  mapId: string;
  kumaMonitors: KumaMonitor[];
  kumaConnected: boolean;
  onBack: () => void;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
