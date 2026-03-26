"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
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
import LinkModal, { type LinkFormData } from "./LinkModal";
import InputModal from "./InputModal";
import LeafletMapView from "./LeafletMapView";
import { apiUrl } from "@/lib/api";
import { Pencil } from "lucide-react";

// ─── Custom Edge with interface labels ──────────
function InterfaceEdge({ id, sourceX, sourceY, targetX, targetY, data, style, selected }: any) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY });

  // Position interface labels near source/target
  const srcLabelX = sourceX + (targetX - sourceX) * 0.18;
  const srcLabelY = sourceY + (targetY - sourceY) * 0.18;
  const tgtLabelX = sourceX + (targetX - sourceX) * 0.82;
  const tgtLabelY = sourceY + (targetY - sourceY) * 0.82;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: selected ? 3 : 2,
          filter: selected ? `drop-shadow(0 0 5px ${style?.stroke || "#4b5563"}88)` : undefined,
        }}
      />
      <EdgeLabelRenderer>
        {/* Source interface badge */}
        {data?.sourceInterface && (
          <div
            className="nodrag nopan absolute text-[8px] font-bold rounded-md px-1.5 py-[2px] cursor-pointer"
            style={{
              transform: `translate(-50%, -50%) translate(${srcLabelX}px, ${srcLabelY}px)`,
              background: "rgba(59,130,246,0.15)",
              border: "1px solid rgba(59,130,246,0.35)",
              color: "#60a5fa",
              pointerEvents: "all",
              letterSpacing: "0.02em",
              backdropFilter: "blur(8px)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
            title={`Interfaz origen: ${data.sourceInterface}`}
          >
            {data.sourceInterface}
          </div>
        )}
        {/* Target interface badge */}
        {data?.targetInterface && (
          <div
            className="nodrag nopan absolute text-[8px] font-bold rounded-md px-1.5 py-[2px] cursor-pointer"
            style={{
              transform: `translate(-50%, -50%) translate(${tgtLabelX}px, ${tgtLabelY}px)`,
              background: "rgba(139,92,246,0.15)",
              border: "1px solid rgba(139,92,246,0.35)",
              color: "#a78bfa",
              pointerEvents: "all",
              letterSpacing: "0.02em",
              backdropFilter: "blur(8px)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
            title={`Interfaz destino: ${data.targetInterface}`}
          >
            {data.targetInterface}
          </div>
        )}
        {/* Center cable label */}
        {data?.label && (
          <div
            className="nodrag nopan absolute text-[7px] font-semibold rounded-md px-1.5 py-[2px] uppercase tracking-wider cursor-pointer"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 10}px)`,
              background: "rgba(10,10,10,0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#888",
              pointerEvents: "all",
              backdropFilter: "blur(8px)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
            title={`Cable: ${data.label}`}
          >
            {data.label}
          </div>
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
  background_scale: number;
  kuma_group_id: number | null;
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

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
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

  // Modal states
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkModalData, setLinkModalData] = useState<{ connection?: Connection; edgeId?: string; initial?: Partial<LinkFormData>; srcName?: string; tgtName?: string }>({});
  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [inputModalConfig, setInputModalConfig] = useState<{ nodeId: string; initial: string; type: "name" | "label" }>({ nodeId: "", initial: "", type: "name" });

  // Load map
  useEffect(() => {
    fetch(apiUrl(`/api/maps/${mapId}`))
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

  // Link creation via context menu — simplified two-click flow
  const [linkSource, setLinkSource] = useState<string | null>(null);

  const startLinkCreation = (nodeId: string) => {
    setLinkSource(nodeId);
    const node = nodes.find((n) => n.id === nodeId);
    toast.info(`Enlazando desde "${node?.data.label || nodeId}"`, {
      description: "Haz clic en el nodo destino, o ESC para cancelar",
      duration: 8000,
      id: "link-mode",
    });
  };

  // ESC to cancel link mode
  useEffect(() => {
    if (!linkSource) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLinkSource(null);
        toast.dismiss("link-mode");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [linkSource]);

  // Click handler — if in link mode, treat click as target selection
  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    if (!linkSource) return;
    if (linkSource === node.id) {
      toast.error("No puedes enlazar un nodo consigo mismo");
      return;
    }
    // Check duplicate
    const exists = edges.some(
      (e) =>
        (e.source === linkSource && e.target === node.id) ||
        (e.source === node.id && e.target === linkSource)
    );
    if (exists) {
      toast.error("Ya existe una conexion entre estos nodos");
      setLinkSource(null);
      toast.dismiss("link-mode");
      return;
    }
    const srcNode = nodes.find((n) => n.id === linkSource);
    setLinkModalData({
      connection: { source: linkSource, target: node.id, sourceHandle: null, targetHandle: null },
      srcName: srcNode?.data.label as string,
      tgtName: node.data.label as string,
    });
    setLinkModalOpen(true);
    setLinkSource(null);
    toast.dismiss("link-mode");
  }, [linkSource, edges, nodes]);

  // Find nearby unconnected nodes for quick link submenu
  const getNearbyUnlinked = (nodeId: string) => {
    return nodes
      .filter((n) => n.id !== nodeId)
      .filter((n) => !edges.some(
        (e) => (e.source === nodeId && e.target === n.id) || (e.source === n.id && e.target === nodeId)
      ))
      .slice(0, 5); // max 5 suggestions
  };

  const getNodeCtxItems = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return [];
    const nearby = getNearbyUnlinked(nodeId);

    const items: any[] = [];

    // Quick link to specific nearby nodes
    if (nearby.length > 0) {
      nearby.forEach((target) => {
        items.push({
          label: `Link → ${target.data.label}`,
          icon: menuIcons.Link2,
          onClick: () => {
            setLinkModalData({
              connection: { source: nodeId, target: target.id, sourceHandle: null, targetHandle: null },
              srcName: node.data.label as string,
              tgtName: target.data.label as string,
            });
            setLinkModalOpen(true);
          },
        });
      });
      items.push({ divider: true, label: "", icon: menuIcons.Link2, onClick: () => {} });
    }

    // General link (click on target)
    items.push({
      label: linkSource ? "Cancelar enlace" : "Nuevo link...",
      icon: menuIcons.Link2,
      onClick: () => {
        if (linkSource) { setLinkSource(null); toast.dismiss("link-mode"); }
        else startLinkCreation(nodeId);
      },
    });

    items.push(
      { label: "Editar nombre", icon: menuIcons.Pencil, onClick: () => editNodeLabel(nodeId) },
      { label: "Cambiar icono", icon: menuIcons.Palette, onClick: () => changeNodeIcon(nodeId) },
      { label: "Duplicar", icon: menuIcons.Copy, onClick: () => duplicateNode(nodeId) },
      { label: "Eliminar", icon: menuIcons.Trash2, onClick: () => deleteNode(nodeId), danger: true, divider: true },
    );

    return items;
  };

  const getEdgeCtxItems = (edgeId: string) => [
    { label: "Editar interfaces", icon: menuIcons.Link2, onClick: () => editEdgeInterfaces(edgeId) },
    { label: "Eliminar conexion", icon: menuIcons.Trash2, onClick: () => setEdges((eds) => eds.filter((e) => e.id !== edgeId)), danger: true, divider: true },
  ];

  // ─── Modal handlers ────────────────────────
  const handleLinkModalSubmit = (data: LinkFormData) => {
    if (linkModalData.edgeId) {
      // Edit existing edge
      setEdges((eds) => eds.map((e) => e.id === linkModalData.edgeId
        ? { ...e, data: { ...e.data, sourceInterface: data.sourceInterface, targetInterface: data.targetInterface, label: data.label } }
        : e));
    } else if (linkModalData.connection) {
      // New connection
      setEdges((eds) => addEdge({
        ...linkModalData.connection!, type: "interface",
        data: { sourceInterface: data.sourceInterface, targetInterface: data.targetInterface, label: data.label },
        style: { stroke: "#4b5563", strokeWidth: 2 }, animated: false,
      }, eds));
    }
    setLinkModalOpen(false);
  };

  const handleInputModalSubmit = (value: string) => {
    if (value.trim() && inputModalConfig.nodeId) {
      setNodes((nds) => nds.map((n) => n.id === inputModalConfig.nodeId
        ? { ...n, data: { ...n.data, label: value.trim() } }
        : n));
    }
    setInputModalOpen(false);
  };

  const getPaneCtxItems = () => [
    { label: "Agregar nodo", icon: menuIcons.Plus, onClick: handleAddNodeAtPos },
    { label: "Ajustar vista", icon: menuIcons.RotateCcw, onClick: () => reactFlow.fitView({ padding: 0.2 }) },
  ];

  // ─── Node edit helpers ────────────────────────
  const editNodeLabel = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    setInputModalConfig({ nodeId, initial: (node?.data.label as string) || "", type: "name" });
    setInputModalOpen(true);
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
    const srcNode = nodes.find((n) => n.id === edge?.source);
    const tgtNode = nodes.find((n) => n.id === edge?.target);
    setLinkModalData({
      edgeId,
      initial: {
        sourceInterface: (edge?.data as any)?.sourceInterface || "",
        targetInterface: (edge?.data as any)?.targetInterface || "",
        label: (edge?.data as any)?.label || "",
      },
      srcName: srcNode?.data.label as string,
      tgtName: tgtNode?.data.label as string,
    });
    setLinkModalOpen(true);
  };

  // ─── Connection & Drop handlers ───────────────
  const onConnect = useCallback((params: Connection) => {
    // Check duplicate
    const exists = edges.some(
      (e) =>
        (e.source === params.source && e.target === params.target) ||
        (e.source === params.target && e.target === params.source)
    );
    if (exists) {
      toast.error("Ya existe una conexion entre estos nodos");
      return;
    }
    const srcNode = nodes.find((n) => n.id === params.source);
    const tgtNode = nodes.find((n) => n.id === params.target);
    setLinkModalData({
      connection: params,
      srcName: srcNode?.data.label as string,
      tgtName: tgtNode?.data.label as string,
    });
    setLinkModalOpen(true);
  }, [nodes, edges]);

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
        label: (e.data as any)?.label || null,
        style: (e.style as any)?.strokeDasharray ? "dashed" : "solid",
        color: (e.style as any)?.stroke || "#4b5563",
        animated: e.animated ? 1 : 0,
        custom_data: JSON.stringify({ sourceInterface: (e.data as any)?.sourceInterface || "", targetInterface: (e.data as any)?.targetInterface || "" }),
      }));
      await fetch(apiUrl(`/api/maps/${mapId}/state`), {
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
    await fetch(apiUrl(`/api/maps/${mapId}/background`), { method: "POST", body: fd });
    const res = await fetch(apiUrl(`/api/maps/${mapId}`));
    setMapData(await res.json());
    toast.success("Fondo actualizado");
    e.target.value = "";
  }, [mapId]);

  const handleSetGrid = useCallback(async () => {
    await fetch(apiUrl(`/api/maps/${mapId}`), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ background_type: "grid", background_image: null }),
    });
    const res = await fetch(apiUrl(`/api/maps/${mapId}`));
    setMapData(await res.json());
    toast.success("Fondo: grilla");
  }, [mapId]);

  const handleSetLiveMap = useCallback(async () => {
    await fetch(apiUrl(`/api/maps/${mapId}`), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ background_type: "livemap", background_image: null }),
    });
    const res = await fetch(apiUrl(`/api/maps/${mapId}`));
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
    ? apiUrl(`/api/uploads/network-maps/${mapData.background_image}`) : null;
  const bgScale = mapData?.background_scale || 1.0;

  // Filter monitors by group if map has a kuma_group_id
  const filteredMonitors = useMemo(() => {
    if (!mapData?.kuma_group_id) return kumaMonitors;
    // Find children: monitors that are NOT groups, or have parent group
    // Kuma groups contain child monitors - we show all non-group monitors
    // since Kuma doesn't expose parent-child in the API directly.
    // Best approach: show monitors that share tags with the group, or all non-group if unclear
    const group = kumaMonitors.find(m => m.id === mapData.kuma_group_id);
    if (!group) return kumaMonitors;

    // Filter: show the group itself + monitors that share the same name prefix or tags
    const groupName = group.name.toLowerCase();
    return kumaMonitors.filter(m => {
      if (m.type === "group" && m.id !== mapData.kuma_group_id) return false;
      if (m.id === mapData.kuma_group_id) return true;
      // Heuristic: child monitors often have the group name as prefix
      if (m.name.toLowerCase().startsWith(groupName)) return true;
      // Or share tags with the group
      if (group.tags && group.tags.length > 0) {
        const groupTagNames = new Set(group.tags.map(t => t.name));
        if (m.tags?.some(t => groupTagNames.has(t.name))) return true;
      }
      return false;
    });
  }, [kumaMonitors, mapData?.kuma_group_id]);

  // Auto-import all group monitors to canvas
  const handleAutoImport = useCallback(() => {
    const nonGroupMonitors = filteredMonitors.filter(m => m.type !== "group");
    const existingIds = new Set(nodes.map(n => n.data.kumaMonitorId));
    const toImport = nonGroupMonitors.filter(m => !existingIds.has(m.id));

    if (toImport.length === 0) {
      toast.info("Todos los monitores del grupo ya estan en el mapa");
      return;
    }

    const cols = Math.ceil(Math.sqrt(toImport.length)) || 1;
    const newNodes: Node[] = toImport.map((monitor, i) => ({
      id: `node-${Date.now()}-${monitor.id}`,
      type: "kumaMonitor",
      position: { x: (i % cols) * 220 + 50, y: Math.floor(i / cols) * 180 + 50 },
      data: {
        label: monitor.name,
        kumaMonitorId: monitor.id,
        icon: getIconForType(monitor.type),
        status: monitor.status,
        ping: monitor.ping,
        msg: monitor.msg,
        type: monitor.type,
        url: monitor.url,
        uptime24: monitor.uptime24,
      } satisfies KumaNodeData,
    }));

    setNodes((nds) => [...nds, ...newNodes]);
    toast.success(`${toImport.length} monitores importados`);
    setTimeout(() => reactFlow.fitView({ padding: 0.2 }), 100);
  }, [filteredMonitors, nodes, setNodes, reactFlow]);

  return (
    <div className="h-screen w-screen relative">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {/* Link mode indicator — floating bottom center */}
      {linkSource && bgType !== "livemap" && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-2xl px-5 py-3"
          style={{
            background: "rgba(59,130,246,0.12)",
            border: "1px solid rgba(59,130,246,0.3)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 8px 32px rgba(59,130,246,0.15), 0 0 0 1px rgba(59,130,246,0.1)",
            animation: "pulse-border 2s ease-in-out infinite",
          }}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.3)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
          <div>
            <div className="text-[11px] font-bold text-blue-300">
              Enlazando desde &quot;{nodes.find(n => n.id === linkSource)?.data.label}&quot;
            </div>
            <div className="text-[10px] text-blue-400/60">Haz clic en el nodo destino &middot; ESC para cancelar</div>
          </div>
          <button
            onClick={() => { setLinkSource(null); toast.dismiss("link-mode"); }}
            className="ml-2 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#888" }}
          >
            Cancelar
          </button>
        </div>
      )}

      {bgType !== "livemap" ? (
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
          isImageBg={bgType === "image"}
          bgScale={bgScale}
          onScaleBg={(delta) => {
            const newScale = Math.max(0.1, Math.min(5, bgScale + delta));
            setMapData((prev) => prev ? { ...prev, background_scale: newScale } : prev);
            fetch(apiUrl(`/api/maps/${mapId}`), {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ background_scale: newScale }),
            });
          }}
        />
      ) : null}

      <div className="h-full">
        {bgType === "livemap" ? (
          <LeafletMapView
            mapId={mapId}
            mapName={mapData?.name}
            kumaMonitors={kumaMonitors}
            kumaConnected={kumaConnected}
            onBack={onBack}
            initialNodes={(mapData?.nodes || []).map((n: any) => ({
              id: n.id,
              kuma_monitor_id: n.kuma_monitor_id,
              label: n.label || "Node",
              x: n.x,
              y: n.y,
              icon: n.icon || "server",
            }))}
            initialEdges={(mapData?.edges || []).map((e: any) => ({
              id: e.id,
              source_node_id: e.source_node_id,
              target_node_id: e.target_node_id,
              label: e.label,
              color: e.color || "#4b5563",
              custom_data: e.custom_data,
            }))}
            onSave={async (savedNodes, savedEdges) => {
              setSaving(true);
              try {
                await fetch(apiUrl(`/api/maps/${mapId}/state`), {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ nodes: savedNodes, edges: savedEdges }),
                });
                toast.success("Mapa guardado");
              } catch { toast.error("Error al guardar"); }
              finally { setSaving(false); }
            }}
          />
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
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
            {bgImage && (
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: `url(${bgImage})`,
                backgroundSize: `${bgScale * 100}%`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                opacity: 0.4,
              }} />
            )}
            {bgType === "grid" && (
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1a1a1a" />
            )}
            <Controls className="!bottom-4 !left-4" />
          </ReactFlow>
        )}
      </div>

      <MonitorPanel
        monitors={filteredMonitors}
        connected={kumaConnected}
        collapsed={panelCollapsed}
        onToggleCollapse={() => setPanelCollapsed((v) => !v)}
        groupName={mapData?.kuma_group_id ? kumaMonitors.find(m => m.id === mapData.kuma_group_id)?.name : undefined}
        onAutoImport={mapData?.kuma_group_id ? handleAutoImport : undefined}
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

      {/* Link Modal */}
      <LinkModal
        open={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        onSubmit={handleLinkModalSubmit}
        sourceName={linkModalData.srcName}
        targetName={linkModalData.tgtName}
        initial={linkModalData.initial}
        title={linkModalData.edgeId ? "Editar conexion" : "Nueva conexion"}
      />

      {/* Input Modal */}
      <InputModal
        open={inputModalOpen}
        onClose={() => setInputModalOpen(false)}
        onSubmit={handleInputModalSubmit}
        title="Editar nombre"
        placeholder="Nombre del nodo..."
        initial={inputModalConfig.initial}
        icon={<Pencil className="h-4 w-4 text-blue-400" />}
      />
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
