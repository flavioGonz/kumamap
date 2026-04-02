"use client";

import { useState, useCallback, useEffect, useRef, useMemo, type RefObject } from "react";
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
  getStraightPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";

import KumaMonitorNode, { type KumaNodeData } from "./KumaMonitorNode";
import TextLabelNode, { type TextLabelData } from "./TextLabelNode";
import MonitorPanel, { type KumaMonitor } from "./MonitorPanel";
// MapToolbar no longer used - toolbar is inline for consistency with LeafletMapView
import ContextMenu, { menuIcons } from "./ContextMenu";
import LinkModal, { type LinkFormData } from "./LinkModal";
import InputModal from "./InputModal";
import IconPickerModal from "./IconPickerModal";
import NodeSizeModal from "./NodeSizeModal";
import LeafletMapView from "./LeafletMapView";
import { apiUrl } from "@/lib/api";
import { Pencil, Type } from "lucide-react";

// ─── Custom Edge with interface labels ──────────
// Module-level edge style setting (avoids prop drilling through ReactFlow)
let _edgeStyleStraight = false;
export function setEdgeStyleStraight(v: boolean) { _edgeStyleStraight = v; }

function InterfaceEdge({ id, sourceX, sourceY, targetX, targetY, data, style, selected, markerEnd }: any) {
  const [edgePath, labelX, labelY] = _edgeStyleStraight
    ? getStraightPath({ sourceX, sourceY, targetX, targetY })
    : getBezierPath({ sourceX, sourceY, targetX, targetY });

  // Calculate perpendicular offset to avoid overlapping labels
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpX = (-dy / len) * 14; // 14px perpendicular offset
  const perpY = (dx / len) * 14;

  // Position labels along the edge with perpendicular offset
  const srcLabelX = sourceX + dx * 0.22 + perpX;
  const srcLabelY = sourceY + dy * 0.22 + perpY;
  const tgtLabelX = sourceX + dx * 0.78 + perpX;
  const tgtLabelY = sourceY + dy * 0.78 + perpY;

  const hasLabels = data?.sourceInterface || data?.targetInterface;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected ? 3 : 2,
          filter: selected ? `drop-shadow(0 0 6px ${style?.stroke || "#4b5563"})` : undefined,
        }}
      />
      <EdgeLabelRenderer>
        {/* Source interface — blue badge */}
        {data?.sourceInterface && (
          <div
            className="nodrag nopan absolute text-[8px] font-bold rounded px-1.5 py-[1px] cursor-pointer whitespace-nowrap"
            style={{
              transform: `translate(-50%, -50%) translate(${srcLabelX}px, ${srcLabelY}px)`,
              background: "rgba(59,130,246,0.18)",
              border: "1px solid rgba(59,130,246,0.4)",
              color: "#60a5fa",
              pointerEvents: "all",
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
            }}
            title={`Interfaz origen: ${data.sourceInterface}`}
          >
            {data.sourceInterface}
          </div>
        )}
        {/* Target interface — purple badge */}
        {data?.targetInterface && (
          <div
            className="nodrag nopan absolute text-[8px] font-bold rounded px-1.5 py-[1px] cursor-pointer whitespace-nowrap"
            style={{
              transform: `translate(-50%, -50%) translate(${tgtLabelX}px, ${tgtLabelY}px)`,
              background: "rgba(139,92,246,0.18)",
              border: "1px solid rgba(139,92,246,0.4)",
              color: "#a78bfa",
              pointerEvents: "all",
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
            }}
            title={`Interfaz destino: ${data.targetInterface}`}
          >
            {data.targetInterface}
          </div>
        )}
        {/* Center cable label — only if there's a label */}
        {data?.label && (
          <div
            className="nodrag nopan absolute text-[7px] font-semibold rounded px-1.5 py-[1px] uppercase tracking-wider cursor-pointer whitespace-nowrap"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + (hasLabels ? -12 : 0)}px)`,
              background: "rgba(10,10,10,0.9)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#999",
              pointerEvents: "all",
              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
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

const nodeTypes: NodeTypes = {
  kumaMonitor: KumaMonitorNode as any,
  textLabel: TextLabelNode as any,
};
const edgeTypes: EdgeTypes = { interface: InterfaceEdge as any };

interface MapData {
  id: string;
  name: string;
  background_type: "image" | "livemap";
  background_image: string | null;
  background_scale: number;
  kuma_group_id: number | null;
  view_state: string | null;
  nodes: any[];
  edges: any[];
}

function getIconForType(type: string): string {
  switch (type) {
    case "http": case "keyword": case "json-query": return "globe";
    case "ping": case "smtp": return "wifi";
    case "port": case "steam": case "gamedig": return "server";
    case "dns": return "database";
    case "docker": case "tailscale-ping": return "cloud";
    case "push": case "mqtt": return "signal";
    case "radius": case "ldap": return "lock";
    case "snmp": return "router";
    case "sqlserver": case "postgres": case "mysql": case "mongodb": case "redis": return "database";
    case "grpc-keyword": return "servercog";
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
  const [panelCollapsed, setPanelCollapsed] = useState(true);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [allMaps, setAllMaps] = useState<{ id: string; name: string }[]>([]);
  const [mapNavMode, setMapNavMode] = useState(false);
  const [editMode, setEditMode] = useState(true);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [straightEdges, setStraightEdges] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync module-level edge style with state
  useEffect(() => { setEdgeStyleStraight(straightEdges); }, [straightEdges]);

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

  // Load all maps (for submap picker)
  useEffect(() => {
    fetch(apiUrl("/api/maps")).then(r => r.json()).then((data: any[]) => {
      setAllMaps(data.map(m => ({ id: m.id, name: m.name })));
    }).catch(() => {});
  }, []);

  // Load map
  useEffect(() => {
    fetch(apiUrl(`/api/maps/${mapId}`))
      .then((r) => r.json())
      .then((data: MapData) => {
        setMapData(data);
        const rfNodes: Node[] = (data.nodes || []).map((n: any) => {
          // Check if it's a text label node
          const cd = n.custom_data ? JSON.parse(n.custom_data) : {};
          if (n.icon === "_textLabel" || cd.type === "textLabel") {
            return {
              id: n.id,
              type: "textLabel",
              position: { x: n.x, y: n.y },
              data: {
                text: n.label || "Etiqueta",
                fontSize: cd.fontSize || 14,
                color: n.color || "#ededed",
                bgEnabled: cd.bgEnabled !== false,
              } satisfies TextLabelData,
            };
          }
          return {
            id: n.id,
            type: "kumaMonitor",
            position: { x: n.x, y: n.y },
            style: n.width && n.width !== 120 ? { width: n.width, height: n.height } : undefined,
            data: {
              label: n.label || "Node",
              kumaMonitorId: n.kuma_monitor_id,
              icon: n.icon || "server",
              ...(cd.nodeSize ? { nodeSize: cd.nodeSize } : {}),
            } satisfies KumaNodeData,
          };
        });
        const rfEdges: Edge[] = (data.edges || []).map((e: any) => {
          const cd = e.custom_data ? JSON.parse(e.custom_data) : {};
          const lt = cd.linkType || "copper";
          const linkColors: Record<string, string> = { fiber: "#3b82f6", copper: "#22c55e", wireless: "#f97316", vpn: "#3b82f6" };
          const edgeColor = linkColors[lt] || e.color || "#4b5563";
          return {
            id: e.id, source: e.source_node_id, target: e.target_node_id, type: "interface",
            data: { label: e.label || undefined, sourceInterface: cd.sourceInterface || "", targetInterface: cd.targetInterface || "", linkType: lt },
            style: {
              stroke: edgeColor,
              strokeWidth: lt === "vpn" ? 4 : 2,
              strokeDasharray: lt === "vpn" ? "2,10" : lt === "wireless" ? "6,4" : undefined,
              strokeLinecap: lt === "vpn" ? "round" : undefined,
            } as any,
            animated: !!e.animated,
          };
        });
        setNodes(rfNodes);
        setEdges(rfEdges);
        // Load view_state preferences (straightEdges, etc.)
        if (data.view_state) {
          try {
            const vs = JSON.parse(data.view_state);
            if (vs.straightEdges) setStraightEdges(true);
          } catch {}
        }
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

  // Update edge colors based on endpoint monitor statuses (DOWN=red, MAINT=purple, PENDING=yellow)
  useEffect(() => {
    if (nodes.length === 0 || edges.length === 0) return;
    const nodeMap = new Map<string, Node>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    setEdges((prev) => {
      let changed = false;
      const next = prev.map((edge) => {
        const srcNode = nodeMap.get(edge.source);
        const tgtNode = nodeMap.get(edge.target);
        const srcStatus = srcNode?.data?.status as number | undefined;
        const tgtStatus = tgtNode?.data?.status as number | undefined;
        const lt = (edge.data as any)?.linkType || "copper";
        const linkColors: Record<string, string> = { fiber: "#3b82f6", copper: "#22c55e", wireless: "#f97316", vpn: "#3b82f6" };

        const isDown = srcStatus === 0 || tgtStatus === 0;
        const isBothDown = srcStatus === 0 && tgtStatus === 0;
        const isMaint = (srcStatus === 3 || tgtStatus === 3) && !isDown;
        const isPending = (srcStatus === 2 || tgtStatus === 2) && !isDown && !isMaint;

        let newColor: string;
        if (isBothDown) newColor = "#991b1b";
        else if (isDown) newColor = "#ef4444";
        else if (isMaint) newColor = "#8b5cf6";
        else if (isPending) newColor = "#f59e0b";
        else newColor = linkColors[lt] || "#22c55e";

        const currentStroke = (edge.style as any)?.stroke;
        if (currentStroke !== newColor) {
          changed = true;
          const isVpn = lt === "vpn";
          const isWireless = lt === "wireless";
          return {
            ...edge,
            style: {
              ...edge.style,
              stroke: newColor,
              strokeWidth: isDown ? 3 : isVpn ? 4 : 2,
              strokeDasharray: isDown ? "8,6" : isVpn ? "2,10" : isWireless ? "6,4" : undefined,
            } as any,
            animated: isDown && !isBothDown,
          };
        }
        return edge;
      });
      return changed ? next : prev;
    });
  }, [nodes, edges.length, setEdges]);

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
  const linkSourceRef = useRef<string | null>(null);

  // Keep ref in sync
  useEffect(() => { linkSourceRef.current = linkSource; }, [linkSource]);

  const startLinkCreation = (nodeId: string) => {
    setLinkSource(nodeId);
    linkSourceRef.current = nodeId;
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
        linkSourceRef.current = null;
        toast.dismiss("link-mode");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [linkSource]);

  // Click handler — if in link mode, treat click as target selection
  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    const src = linkSourceRef.current;
    if (!src) return;
    if (src === node.id) {
      toast.error("No puedes enlazar un nodo consigo mismo");
      return;
    }
    // Check duplicate
    const exists = edges.some(
      (e) =>
        (e.source === src && e.target === node.id) ||
        (e.source === node.id && e.target === src)
    );
    if (exists) {
      toast.error("Ya existe una conexion entre estos nodos");
      setLinkSource(null);
      linkSourceRef.current = null;
      toast.dismiss("link-mode");
      return;
    }
    const srcNode = nodes.find((n) => n.id === src);
    setLinkModalData({
      connection: { source: src, target: node.id, sourceHandle: null, targetHandle: null },
      srcName: (srcNode?.data.label || srcNode?.data.text || src) as string,
      tgtName: (node.data.label || node.data.text || node.id) as string,
    });
    setLinkModalOpen(true);
    setLinkSource(null);
    linkSourceRef.current = null;
    toast.dismiss("link-mode");
  }, [edges, nodes]);

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

    // Text label node — different menu
    if (node.type === "textLabel") {
      const textColors = [
        { label: "Blanco", hex: "#ededed" },
        { label: "Azul", hex: "#60a5fa" },
        { label: "Verde", hex: "#4ade80" },
        { label: "Rojo", hex: "#f87171" },
        { label: "Amarillo", hex: "#fbbf24" },
        { label: "Naranja", hex: "#fb923c" },
        { label: "Violeta", hex: "#a78bfa" },
        { label: "Gris", hex: "#888888" },
      ];
      const currentColor = (node.data.color as string) || "#ededed";
      const textSizes = [
        { label: "Pequeño", value: 10 },
        { label: "Normal", value: 14 },
        { label: "Grande", value: 20 },
        { label: "Muy grande", value: 28 },
        { label: "Título", value: 36 },
      ];
      const currentFontSize = (node.data.fontSize as number) || 14;
      return [
        {
          label: "Editar texto", icon: menuIcons.Pencil, onClick: () => {
            const text = prompt("Texto:", String(node.data.text || ""));
            if (text?.trim()) setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, text: text.trim() } } : n));
          },
        },
        // Font size sub-items
        ...textSizes.filter(s => s.value !== currentFontSize).map(s => ({
          label: `Tamaño: ${s.label} (${s.value}px)`,
          icon: menuIcons.Type,
          onClick: () => setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, fontSize: s.value } } : n)),
        })),
        { label: "Tamaño personalizado", icon: menuIcons.Type, divider: true, onClick: () => {
          const size = prompt("Tamaño (px):", String(currentFontSize));
          if (size && parseInt(size) > 0) setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, fontSize: parseInt(size) } } : n));
        }},
        // Color sub-items
        ...textColors.filter(c => c.hex !== currentColor).map(c => ({
          label: `Color: ${c.label}`,
          icon: menuIcons.Palette,
          onClick: () => setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, color: c.hex } } : n)),
          colorDot: c.hex,
        })),
        {
          label: node.data.bgEnabled !== false ? "Quitar fondo" : "Agregar fondo", icon: menuIcons.Maximize2, divider: true, onClick: () => {
            setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, bgEnabled: !(n.data.bgEnabled !== false) } } : n));
          },
        },
        { label: "Eliminar", icon: menuIcons.Trash2, onClick: () => deleteNode(nodeId), danger: true, divider: true },
      ];
    }
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
      { label: "Tamaño", icon: menuIcons.Scaling, onClick: () => setSizePickerNodeId(nodeId) },
      { label: "Duplicar", icon: menuIcons.Copy, onClick: () => duplicateNode(nodeId) },
      { label: "Eliminar", icon: menuIcons.Trash2, onClick: () => deleteNode(nodeId), danger: true, divider: true },
    );

    return items;
  };

  const getEdgeCtxItems = (edgeId: string) => {
    const edge = edges.find((e) => e.id === edgeId);
    const currentLinkType = (edge?.data as any)?.linkType || "copper";
    const linkTypes = [
      { type: "fiber", label: "Fibra", color: "#3b82f6" },
      { type: "copper", label: "Cobre", color: "#22c55e" },
      { type: "wireless", label: "Wireless", color: "#f97316" },
      { type: "vpn", label: "VPN", color: "#3b82f6" },
    ];
    return [
      { label: "Editar interfaces", icon: menuIcons.Link2, onClick: () => editEdgeInterfaces(edgeId) },
      ...linkTypes.filter(t => t.type !== currentLinkType).map(t => ({
        label: `→ ${t.label}`,
        icon: menuIcons.Link2,
        onClick: () => {
          setEdges((eds) => eds.map((e) => {
            if (e.id !== edgeId) return e;
            const isVpn = t.type === "vpn";
            const isWireless = t.type === "wireless";
            return {
              ...e,
              data: { ...e.data, linkType: t.type },
              style: {
                stroke: t.color,
                strokeWidth: isVpn ? 4 : 2,
                strokeDasharray: isVpn ? "2,10" : isWireless ? "6,4" : undefined,
                strokeLinecap: isVpn ? "round" : undefined,
              } as any,
            };
          }));
          toast.success(`Enlace: ${t.label}`);
        },
      })),
      { label: "Eliminar conexion", icon: menuIcons.Trash2, onClick: () => setEdges((eds) => eds.filter((e) => e.id !== edgeId)), danger: true, divider: true },
    ];
  };

  // ─── Modal handlers ────────────────────────
  const handleLinkModalSubmit = (data: LinkFormData) => {
    if (linkModalData.edgeId) {
      // Edit existing edge
      setEdges((eds) => eds.map((e) => e.id === linkModalData.edgeId
        ? { ...e, data: { ...e.data, sourceInterface: data.sourceInterface, targetInterface: data.targetInterface, label: data.label } }
        : e));
    } else if (linkModalData.connection) {
      // New connection — default copper style (green) like Leaflet
      setEdges((eds) => addEdge({
        ...linkModalData.connection!, type: "interface",
        data: { sourceInterface: data.sourceInterface, targetInterface: data.targetInterface, label: data.label, linkType: "copper" },
        style: { stroke: "#22c55e", strokeWidth: 2 }, animated: false,
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

  const handleAddLabelAtPos = () => {
    if (!ctxMenu) return;
    const pos = reactFlow.screenToFlowPosition({ x: ctxMenu.x, y: ctxMenu.y });
    const text = prompt("Texto de la etiqueta:", "Etiqueta");
    if (!text?.trim()) return;
    setNodes((nds) => [...nds, {
      id: `label-${Date.now()}`,
      type: "textLabel",
      position: pos,
      data: { text: text.trim(), fontSize: 14, color: "#ededed", bgEnabled: true } satisfies TextLabelData,
    }]);
  };

  const getPaneCtxItems = () => [
    { label: "Agregar nodo", icon: menuIcons.Plus, onClick: handleAddNodeAtPos },
    { label: "Agregar etiqueta", icon: menuIcons.Type, onClick: handleAddLabelAtPos },
    { divider: true, label: "", icon: menuIcons.Plus, onClick: () => {} },
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

  // Icon picker modal state
  const [iconPickerNodeId, setIconPickerNodeId] = useState<string | null>(null);
  const iconPickerCurrentIcon = useMemo(() => {
    if (!iconPickerNodeId) return "server";
    const node = nodes.find((n) => n.id === iconPickerNodeId);
    return (node?.data?.icon as string) || "server";
  }, [iconPickerNodeId, nodes]);

  const changeNodeIcon = (nodeId: string) => {
    setIconPickerNodeId(nodeId);
  };

  // Node size picker modal state
  const [sizePickerNodeId, setSizePickerNodeId] = useState<string | null>(null);
  const sizePickerInfo = useMemo(() => {
    if (!sizePickerNodeId) return { size: 1.0, name: "" };
    const node = nodes.find((n) => n.id === sizePickerNodeId);
    return {
      size: (node?.data?.nodeSize as number) || 1.0,
      name: (node?.data?.label as string) || "Nodo",
    };
  }, [sizePickerNodeId, nodes]);

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
    // Prevent self-link
    if (params.source === params.target) {
      toast.error("No se puede conectar un nodo consigo mismo");
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
    if (node.type === "textLabel") {
      const text = prompt("Texto:", String(node.data.text || ""));
      if (text?.trim()) setNodes((nds) => nds.map((n) => n.id === node.id ? { ...n, data: { ...n.data, text: text.trim() } } : n));
    } else {
      editNodeLabel(node.id);
    }
  }, [nodes, setNodes]);

  // Double-click edge
  const onEdgeDoubleClick = useCallback((_e: React.MouseEvent, edge: Edge) => {
    editEdgeInterfaces(edge.id);
  }, [edges, setEdges]);

  // ─── Save ─────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const saveNodes = nodes.map((n) => {
        if (n.type === "textLabel") {
          return {
            id: n.id, kuma_monitor_id: null,
            label: n.data.text || "Etiqueta",
            x: n.position.x, y: n.position.y,
            width: (n.style as any)?.width || 120, height: (n.style as any)?.height || 80,
            icon: "_textLabel",
            color: n.data.color || "#ededed",
            custom_data: JSON.stringify({
              type: "textLabel", fontSize: n.data.fontSize || 14,
              bgEnabled: n.data.bgEnabled !== false,
            }),
          };
        }
        // Regular kumaMonitor node — save all custom properties
        const cd: Record<string, any> = {};
        if (n.data.nodeSize && n.data.nodeSize !== 1.0) cd.nodeSize = n.data.nodeSize;
        // Preserve any existing custom_data fields (camera, stream, etc.)
        if (n.data.customFields) Object.assign(cd, n.data.customFields);
        return {
          id: n.id, kuma_monitor_id: n.data.kumaMonitorId ?? null,
          label: n.data.label,
          x: n.position.x, y: n.position.y,
          width: (n.style as any)?.width || 120, height: (n.style as any)?.height || 80,
          icon: n.data.icon || "server",
          color: null,
          custom_data: Object.keys(cd).length > 0 ? JSON.stringify(cd) : null,
        };
      });
      const saveEdges = edges.map((e) => {
        const d = (e.data as any) || {};
        const linkType = d.linkType || "copper";
        return {
          id: e.id, source_node_id: e.source, target_node_id: e.target,
          label: d.label || null,
          style: (e.style as any)?.strokeDasharray ? "dashed" : "solid",
          color: (e.style as any)?.stroke || "#4b5563",
          animated: e.animated ? 1 : 0,
          custom_data: JSON.stringify({
            sourceInterface: d.sourceInterface || "",
            targetInterface: d.targetInterface || "",
            ...(linkType !== "copper" ? { linkType } : {}),
          }),
        };
      });
      const viewState = JSON.stringify({ straightEdges });
      await fetch(apiUrl(`/api/maps/${mapId}/state`), {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: saveNodes, edges: saveEdges, view_state: viewState }),
      });
      toast.success("Mapa guardado");
    } catch { toast.error("Error al guardar"); }
    finally { setSaving(false); }
  }, [mapId, nodes, edges, straightEdges]);

  // Auto-save debounce
  const handleSaveRef = useRef<(() => void) | null>(null);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);
  useEffect(() => {
    if (!autoSaveEnabled || !mapData) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      handleSaveRef.current?.();
    }, 5000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [nodes, edges, autoSaveEnabled, mapData]);

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

  // handleSetGrid removed — grid type no longer supported

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

  const bgType = mapData?.background_type || "livemap";
  const bgImage = bgType === "image" && mapData?.background_image
    ? apiUrl(`/api/uploads/network-maps/${mapData.background_image}`) : null;
  const bgScale = mapData?.background_scale || 1.0;

  // Filter monitors by group if map has a kuma_group_id
  const filteredMonitors = useMemo(() => {
    if (!mapData?.kuma_group_id) return kumaMonitors;
    const gid = mapData.kuma_group_id;

    // Collect all children recursively (parent field)
    const childIds = new Set<number>();
    function collectChildren(parentId: number) {
      for (const m of kumaMonitors) {
        if (m.parent === parentId && !childIds.has(m.id)) {
          childIds.add(m.id);
          if (m.type === "group") collectChildren(m.id);
        }
      }
    }
    collectChildren(gid);

    return kumaMonitors.filter(m => m.id === gid || childIds.has(m.id));
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
              Enlazando desde &quot;{String(nodes.find(n => n.id === linkSource)?.data.label || "")}&quot;
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
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5"
          style={{
            zIndex: 10000,
            background: "rgba(10,10,10,0.82)", border: "1px solid rgba(255,255,255,0.06)",
            backdropFilter: "blur(24px)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
            pointerEvents: "auto",
          }}
        >
          {/* Back */}
          <button onClick={onBack}
            className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Mapas
          </button>
          <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* Name + status */}
          <div className="flex items-center gap-2 px-1">
            <span className="text-[12px] font-bold text-[#ededed] truncate max-w-[160px]">{mapData?.name || "..."}</span>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: kumaConnected ? "#22c55e" : "#ef4444", boxShadow: kumaConnected ? "0 0 6px #22c55e" : "0 0 6px #ef4444" }} />
              <span className="text-[9px] font-semibold" style={{ color: kumaConnected ? "#22c55e" : "#ef4444" }}>{kumaConnected ? "LIVE" : "OFF"}</span>
            </div>
          </div>

          <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* Edit mode toggle */}
          <button
            onClick={() => setEditMode(v => !v)}
            className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all"
            style={{
              background: editMode ? "rgba(245,158,11,0.15)" : "transparent",
              border: editMode ? "1px solid rgba(245,158,11,0.3)" : "1px solid transparent",
              color: editMode ? "#f59e0b" : "#666",
            }}
            title={editMode ? "Modo compacto" : "Modo edicion"}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.855z"/>
            </svg>
            {editMode ? "Editar" : "Edit"}
          </button>

          {/* ═══ EDIT MODE TOOLS ═══ */}
          {editMode && <>
          <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* Node/Edge controls */}
          <div className="flex items-center gap-0.5">
            <button onClick={handleAddNode} title="Agregar nodo" className="group flex items-center gap-1 rounded-xl px-2 py-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              <span className="text-[10px] font-semibold hidden xl:inline">Nodo</span>
            </button>
            <button onClick={() => {
              const text = prompt("Texto de la etiqueta:", "Etiqueta");
              if (!text?.trim()) return;
              const vp = reactFlow.getViewport();
              setNodes((nds) => [...nds, {
                id: `label-${Date.now()}`, type: "textLabel",
                position: { x: -vp.x / vp.zoom + 400, y: -vp.y / vp.zoom + 300 },
                data: { text: text.trim(), fontSize: 14, color: "#ededed", bgEnabled: true } satisfies TextLabelData,
              }]);
            }} title="Agregar etiqueta" className="group flex items-center gap-1 rounded-xl px-2 py-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
              <span className="text-[10px] font-semibold hidden xl:inline">Etiqueta</span>
            </button>
            <button onClick={() => setConnectMode((v) => !v)} title={connectMode ? "Cancelar link" : "Crear link"}
              className={`group flex items-center gap-1 rounded-xl px-2 py-1.5 transition-all ${connectMode ? "text-[#60a5fa]" : "text-[#888] hover:text-[#ededed] hover:bg-white/[0.06]"}`}
              style={connectMode ? { background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)" } : {}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <span className="text-[10px] font-semibold hidden xl:inline">Link</span>
            </button>
            {hasSelection && (
              <button onClick={handleDeleteSelected} title="Eliminar" className="rounded-xl p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            )}
          </div>
          </>}

          <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* Background controls — always visible */}
          <div className="flex items-center gap-0.5 rounded-xl p-0.5" style={{ background: "rgba(255,255,255,0.02)" }}>
            <button onClick={handleUploadBg} title="Subir imagen" className="rounded-xl p-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
            </button>
            {/* Grid button removed — user prefers livemap/image only */}
            <button onClick={handleSetLiveMap} title="Mapa real" className="rounded-xl p-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            </button>
            <button onClick={handleAutoLayout} title="Auto layout" className="rounded-xl p-1.5 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
            </button>
          </div>

          {/* Image scale — only when editing */}
          {editMode && bgType === "image" && (
            <>
              <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="flex items-center gap-0.5">
                <button onClick={() => {
                  const ns = Math.max(0.1, bgScale - 0.1);
                  setMapData((prev) => prev ? { ...prev, background_scale: ns } : prev);
                  fetch(apiUrl(`/api/maps/${mapId}`), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ background_scale: ns }) });
                }} title="Reducir fondo" className="rounded-xl px-1.5 py-1 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all text-[11px] font-bold">−</button>
                <span className="text-[9px] text-[#666] font-mono min-w-[30px] text-center">{Math.round(bgScale * 100)}%</span>
                <button onClick={() => {
                  const ns = Math.min(5, bgScale + 0.1);
                  setMapData((prev) => prev ? { ...prev, background_scale: ns } : prev);
                  fetch(apiUrl(`/api/maps/${mapId}`), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ background_scale: ns }) });
                }} title="Ampliar fondo" className="rounded-xl px-1.5 py-1 text-[#888] hover:text-[#ededed] hover:bg-white/[0.06] transition-all text-[11px] font-bold">+</button>
              </div>
            </>
          )}

          <div className="h-5 w-px mx-0.5" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* Straight/Curved edges toggle */}
          <button onClick={() => { setStraightEdges(v => !v); setEdges(eds => [...eds]); }} title={straightEdges ? "Links rectos (clic para curvas)" : "Links curvos (clic para rectas)"}
            className="rounded-lg p-1.5 transition-all"
            style={{ color: straightEdges ? "#f59e0b" : "#555" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {straightEdges
                ? <><line x1="4" y1="20" x2="20" y2="4" /></>
                : <><path d="M4 20 C 10 20, 14 4, 20 4" /></>}
            </svg>
          </button>

          {/* Auto-save toggle */}
          <button onClick={() => setAutoSaveEnabled(v => !v)} title={autoSaveEnabled ? "Auto-save ON" : "Auto-save OFF"}
            className="rounded-lg p-1.5 transition-all"
            style={{ color: autoSaveEnabled ? "#4ade80" : "#555" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {autoSaveEnabled ? <><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></> : <><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></>}
            </svg>
          </button>

          {/* Save */}
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-[11px] font-bold transition-all"
            style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.15))", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", boxShadow: "0 2px 12px rgba(59,130,246,0.1)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg, rgba(59,130,246,0.3), rgba(99,102,241,0.25))";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(59,130,246,0.2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.15))";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(59,130,246,0.1)";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      ) : null}

      <div className="h-full" style={{ isolation: "isolate" }}>
        {!mapData ? (
          /* Loading state — CRITICAL: do NOT mount LeafletMapView or ReactFlow until mapData is ready.
             LeafletMapView stores initialNodes/initialEdges in useRef (set only once at mount),
             so mounting before data arrives causes nodes to be permanently empty. */
          <div className="h-full flex items-center justify-center" style={{ background: "#0a0a0a" }}>
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
              <span className="text-[12px] text-[#555]">Cargando mapa...</span>
            </div>
          </div>
        ) : bgType === "livemap" ? (
          <LeafletMapView
            mapId={mapId}
            mapName={mapData?.name}
            kumaMonitors={kumaMonitors}
            kumaConnected={kumaConnected}
            onBack={onBack}
            panelCollapsed={panelCollapsed}
            onTogglePanel={() => setPanelCollapsed(v => !v)}
            availableMaps={allMaps}
            initialNodes={(mapData?.nodes || []).map((n: any) => ({
              id: n.id,
              kuma_monitor_id: n.kuma_monitor_id,
              label: n.label || "Node",
              x: n.x,
              y: n.y,
              icon: n.icon || "server",
              custom_data: n.custom_data || null,
            }))}
            initialEdges={(mapData?.edges || []).map((e: any) => ({
              id: e.id,
              source_node_id: e.source_node_id,
              target_node_id: e.target_node_id,
              label: e.label,
              color: e.color || "#4b5563",
              custom_data: e.custom_data,
            }))}
            initialViewState={mapData?.view_state ? JSON.parse(mapData.view_state) : undefined}
            onSave={async (savedNodes, savedEdges, viewState) => {
              setSaving(true);
              try {
                await fetch(apiUrl(`/api/maps/${mapId}/state`), {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ nodes: savedNodes, edges: savedEdges, view_state: viewState ? JSON.stringify(viewState) : null }),
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
            minZoom={0.05}
            maxZoom={12}
            deleteKeyCode="Delete"
            defaultEdgeOptions={{
              type: "interface",
              style: { stroke: "#22c55e", strokeWidth: 2 },
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
            {bgType !== "image" && bgType !== "livemap" && (
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
        hideCollapsedButton={bgType === "livemap"}
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

      {/* Icon Picker Modal */}
      {iconPickerNodeId && (
        <IconPickerModal
          currentIcon={iconPickerCurrentIcon}
          onSelect={(icon) => {
            setNodes((nds) => nds.map((n) => n.id === iconPickerNodeId ? { ...n, data: { ...n.data, icon } } : n));
            setIconPickerNodeId(null);
          }}
          onClose={() => setIconPickerNodeId(null)}
        />
      )}

      {/* Node Size Picker Modal */}
      {sizePickerNodeId && (
        <NodeSizeModal
          currentSize={sizePickerInfo.size}
          nodeName={sizePickerInfo.name}
          onSelect={(size) => {
            setNodes((nds) => nds.map((n) => n.id === sizePickerNodeId ? { ...n, data: { ...n.data, nodeSize: size } } : n));
            setSizePickerNodeId(null);
          }}
          onClose={() => setSizePickerNodeId(null)}
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
