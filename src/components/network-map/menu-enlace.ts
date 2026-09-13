/**
 * El menú contextual de un enlace del mapa (R2).
 *
 * Mismo criterio que ./menu-nodo: sólo construye la lista de opciones, así que
 * salir del archivo del mapa no le cuesta nada. El cuerpo se movió sin tocar una
 * línea; lo único nuevo es el desestructurado de arriba.
 */
import type React from "react";
import { toast } from "@/components/ui/SileoToast";
import { menuIcons } from "./ContextMenu";
import { SEPARATION_TYPES } from "@/lib/separation";
import { safeJsonParse } from "@/lib/error-handler";
import type { EdgeCustomData } from "@/lib/types";
import type { LinkFormData } from "./LinkModal";
import type { SavedNode, SavedEdge } from "./LeafletMapView";

export interface ContextoMenuEnlace {
  LRef: React.MutableRefObject<any>;
  mapRef: React.MutableRefObject<any>;
  nodesRef: React.MutableRefObject<SavedNode[]>;
  edgesRef: React.MutableRefObject<SavedEdge[]>;
  pushUndo: () => void;
  renderEdges: (L: any, map: any) => void;
  setLinkModalData: React.Dispatch<React.SetStateAction<{ sourceId: string; targetId: string; edgeId?: string; initial?: Partial<LinkFormData> }>>;
  setLinkModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function itemsDeEnlace(edgeId: string, ctx: ContextoMenuEnlace) {
  const {
    LRef, edgesRef, mapRef, nodesRef, pushUndo, renderEdges, setLinkModalData,
    setLinkModalOpen,
  } = ctx;

  const edge = edgesRef.current.find((e) => e.id === edgeId);
  const cd = safeJsonParse<EdgeCustomData>(edge?.custom_data);
  const srcNode = nodesRef.current.find((n) => n.id === edge?.source_node_id);
  const tgtNode = nodesRef.current.find((n) => n.id === edge?.target_node_id);
  return [
    {
      label: "Editar interfaces",
      icon: menuIcons.Link2,
      onClick: () => {
        setLinkModalData({
          sourceId: edge?.source_node_id || "",
          targetId: edge?.target_node_id || "",
          edgeId,
          initial: { sourceInterface: cd.sourceInterface || "", targetInterface: cd.targetInterface || "", label: edge?.label || "", snmpMonitorId: cd.snmpMonitorId ?? null, mikrotikTraffic: cd.mikrotikTraffic ?? null },
        });
        setLinkModalOpen(true);
      },
    },
    ...[
      { type: "fiber", label: "Fibra", color: "#3b82f6" },
      { type: "copper", label: "Cobre", color: "#22c55e" },
      { type: "wireless", label: "Wireless", color: "#f97316" },
      { type: "vpn", label: "VPN", color: "#3b82f6" },
    ].filter(t => t.type !== (cd.linkType || "copper")).map(t => ({
      label: `→ ${t.label}`,
      icon: menuIcons.Link2,
      onClick: () => {
        const idx = edgesRef.current.findIndex((e) => e.id === edgeId);
        if (idx >= 0) {
          const oldCd = safeJsonParse<EdgeCustomData>(edgesRef.current[idx].custom_data);
          oldCd.linkType = t.type;
          edgesRef.current[idx] = { ...edgesRef.current[idx], custom_data: JSON.stringify(oldCd) };
          if (LRef.current && mapRef.current) renderEdges(LRef.current, mapRef.current);
          toast.success(`Enlace: ${t.label}`);
        }
      },
    })),
    {
      label: "Separación (pared / canalización)",
      icon: menuIcons.Link2,
      divider: true,
      onClick: () => {},
      children: Object.entries(SEPARATION_TYPES).map(([key, s]) => ({
        label: s.label,
        icon: menuIcons.Link2,
        active: cd.linkType === "separation" && cd.sepType === key,
        onClick: () => {
          const idx = edgesRef.current.findIndex((e) => e.id === edgeId);
          if (idx >= 0) {
            const oldCd = safeJsonParse<EdgeCustomData>(edgesRef.current[idx].custom_data);
            oldCd.linkType = "separation";
            oldCd.sepKind = s.kind;
            oldCd.sepType = key;
            edgesRef.current[idx] = { ...edgesRef.current[idx], custom_data: JSON.stringify(oldCd) };
            if (LRef.current && mapRef.current) renderEdges(LRef.current, mapRef.current);
            toast.success(s.label);
          }
        },
      })),
    },
    // Toggle traffic widget visibility
    ...(cd.snmpMonitorId ? [{
      label: cd.hideTraffic ? "Mostrar tráfico" : "Ocultar tráfico",
      icon: menuIcons.Activity,
      onClick: () => {
        const idx = edgesRef.current.findIndex((e) => e.id === edgeId);
        if (idx >= 0) {
          const oldCd = safeJsonParse<EdgeCustomData>(edgesRef.current[idx].custom_data);
          oldCd.hideTraffic = !oldCd.hideTraffic;
          edgesRef.current[idx] = { ...edgesRef.current[idx], custom_data: JSON.stringify(oldCd) };
          if (LRef.current && mapRef.current) renderEdges(LRef.current, mapRef.current);
          toast.success(oldCd.hideTraffic ? "Tráfico oculto" : "Tráfico visible");
        }
      },
    }] : []),
    {
      label: "Eliminar conexion",
      icon: menuIcons.Trash2,
      danger: true,
      divider: true,
      onClick: () => {
        pushUndo();
        edgesRef.current = edgesRef.current.filter((e) => e.id !== edgeId);
        if (LRef.current && mapRef.current) renderEdges(LRef.current, mapRef.current);
        toast.success("Conexion eliminada");
      },
    },
  ];
}
