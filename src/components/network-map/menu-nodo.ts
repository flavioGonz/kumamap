/**
 * El menú contextual de un nodo del mapa (R2).
 *
 * 723 líneas que estaban dentro de `LeafletMapView.tsx`. Es sólo construcción de
 * datos —devuelve la lista de opciones, no dibuja nada— pero vivía enterrada
 * entre el render de Leaflet, y era el bloque más grande del archivo.
 *
 * El cuerpo se movió SIN TOCAR UNA LÍNEA. Lo único que se agregó es el
 * desestructurado de arriba: las 38 cosas del componente que el menú usaba por
 * closure ahora entran por un parámetro, así que de un vistazo se ve de qué
 * depende realmente — que es justamente lo que un archivo de 6.000 líneas no
 * deja ver.
 */
import type React from "react";
import { toast } from "@/components/ui/SileoToast";
import { menuIcons } from "./ContextMenu";
import { safeJsonParse, safeFetch } from "@/lib/error-handler";
import type { NodeCustomData } from "@/lib/types";
import { apiUrl } from "@/lib/api";
import type { SavedNode, SavedEdge } from "./LeafletMapView";
import type { NodeEditConfig } from "./NodeEditModal";

export interface ContextoMenuNodo {
  nodesRef: React.MutableRefObject<SavedNode[]>;
  edgesRef: React.MutableRefObject<SavedEdge[]>;
  LRef: React.MutableRefObject<any>;
  mapRef: React.MutableRefObject<any>;
  camHandlesRef: React.MutableRefObject<Map<string, any>>;
  renderNodes: (L: any, map: any) => void;
  renderEdges: (L: any, map: any) => void;
  pushUndo: () => void;
  startLinkCreation: (nodeId: string) => void;
  cancelLinkCreation: () => void;
  linkSource: string | null;
  ctxMenu: { x: number; y: number; nodeId?: string; edgeId?: string; latlng?: [number, number] } | null;
  isImageMode: boolean;
  readonly?: boolean;
  onOpenMap?: (mapId: string) => void;
  MAX_STREAMS: number;
  setAntennaConfigNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setAntennaSnmpNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setAssignModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setAssignNodeId: React.Dispatch<React.SetStateAction<string>>;
  setAssignSearch: React.Dispatch<React.SetStateAction<string>>;
  setColorPickerNodeId: React.Dispatch<React.SetStateAction<string>>;
  setColorPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIconPickerNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setInputModalConfig: React.Dispatch<React.SetStateAction<NodeEditConfig>>;
  setInputModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLensPickerNodeId: React.Dispatch<React.SetStateAction<string>>;
  setLensPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setNodeMapModalNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setOnvifModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRackDrawerNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setSizePickerNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setStreamConfigNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setStreamViewers: React.Dispatch<React.SetStateAction<{ nodeId: string; mode: "tooltip" | "pip" }[]>>;
  setTimeMachineOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTmFocusMonitorId: React.Dispatch<React.SetStateAction<number | null>>;
  setUpsConfigNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setUpsPaneles: React.Dispatch<React.SetStateAction<Array<{ nodeId: string; x: number; y: number }>>>;
  setTrafModalNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setTrafModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setHistTrafNodeId: React.Dispatch<React.SetStateAction<string | null>>;
}

export function itemsDeNodo(nodeId: string, ctx: ContextoMenuNodo) {
  const {
    nodesRef, edgesRef, LRef, mapRef, camHandlesRef, renderNodes, renderEdges, pushUndo,
    startLinkCreation, cancelLinkCreation, linkSource, ctxMenu, isImageMode, readonly,
    onOpenMap, MAX_STREAMS, setAntennaConfigNodeId, setAntennaSnmpNodeId,
    setAssignModalOpen, setAssignNodeId, setAssignSearch, setColorPickerNodeId,
    setColorPickerOpen, setIconPickerNodeId, setInputModalConfig, setInputModalOpen,
    setLensPickerNodeId, setLensPickerOpen, setNodeMapModalNodeId, setOnvifModalOpen,
    setRackDrawerNodeId, setSizePickerNodeId, setStreamConfigNodeId, setStreamViewers,
    setTimeMachineOpen, setTmFocusMonitorId, setUpsConfigNodeId, setUpsPaneles,
    setTrafModalNodeId, setTrafModalOpen, setHistTrafNodeId,
  } = ctx;

  const node = nodesRef.current.find((n) => n.id === nodeId);
  const isLabel = node?.icon === "_textLabel";
  const isWaypoint = node?.icon === "_waypoint";
  const isTrafico = node?.icon === "_traffic";
  const isUps = node?.icon === "ups";

  // Ventana de tráfico: su menú es propio (editar SNMP, historial en Kuma, quitar).
  // Antes caía en el menú genérico de nodo (Reasignar/Desasignar monitor, etc.)
  // que no tiene sentido para una ventana de tráfico.
  if (isTrafico) {
    const cdT = safeJsonParse<NodeCustomData>(node?.custom_data);
    return [
      {
        label: cdT.snmpTraffic ? "Editar ventana (SNMP)" : "Configurar ventana (SNMP)",
        icon: menuIcons.Signal,
        onClick: () => { setTrafModalNodeId(nodeId); setTrafModalOpen(true); },
      },
      {
        label: "Ver historial",
        icon: menuIcons.Clock,
        onClick: () => {
          if (cdT.snmpTraffic?.kumaInId) setHistTrafNodeId(nodeId);
          else toast.info("Todavía no tiene sensores creados");
        },
      },
      {
        label: "Apariencia",
        icon: menuIcons.Palette,
        onClick: () => { setColorPickerNodeId(nodeId); setColorPickerOpen(true); },
      },
      {
        label: "Quitar ventana del mapa",
        icon: menuIcons.Trash2,
        danger: true,
        divider: true,
        onClick: () => {
          pushUndo();
          nodesRef.current = nodesRef.current.filter((n) => n.id !== nodeId);
          if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          toast.success("Ventana quitada del mapa (los sensores en Uptime Kuma no se tocaron)");
        },
      },
    ];
  }

  // Nodo UPS: menú propio (configurar conexión, panel, quitar).
  if (isUps) {
    const cdU = safeJsonParse<NodeCustomData>(node?.custom_data);
    return [
      {
        label: cdU.ip ? "Configurar UPS" : "Configurar UPS…",
        icon: menuIcons.Settings,
        onClick: () => { setUpsConfigNodeId(nodeId); },
      },
      {
        label: cdU.upsPanelFijo ? "Ocultar panel" : "Mostrar panel",
        icon: menuIcons.Activity,
        onClick: () => {
          const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
          if (idx < 0) return;
          const prev = nodesRef.current[idx];
          const pcd = safeJsonParse<NodeCustomData>(prev.custom_data);
          pcd.type = "ups";
          pcd.upsPanelFijo = !pcd.upsPanelFijo;
          nodesRef.current[idx] = { ...prev, custom_data: JSON.stringify(pcd) };
          if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          if (pcd.upsPanelFijo) setUpsPaneles((p) => p.some((x) => x.nodeId === nodeId) ? p : [...p, { nodeId, x: 0, y: 0 }]);
          else setUpsPaneles((p) => p.filter((x) => x.nodeId !== nodeId));
        },
      },
      {
        label: "Apariencia",
        icon: menuIcons.Palette,
        onClick: () => { setColorPickerNodeId(nodeId); setColorPickerOpen(true); },
      },
      {
        label: "Quitar UPS del mapa",
        icon: menuIcons.Trash2,
        danger: true,
        divider: true,
        onClick: () => {
          pushUndo();
          nodesRef.current = nodesRef.current.filter((n) => n.id !== nodeId);
          setUpsPaneles((p) => p.filter((x) => x.nodeId !== nodeId));
          if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          toast.success("UPS quitada del mapa");
        },
      },
    ];
  }

  // Polygons: rename, color, delete
  const isPolygon = node?.icon === "_polygon";
  if (isPolygon) {
    return [
      {
        label: "Editar nombre",
        icon: menuIcons.Pencil,
        onClick: () => {
          const newName = prompt("Nombre de la zona:", node?.label || "Zona");
          if (newName?.trim()) {
            const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
            if (idx >= 0) {
              nodesRef.current[idx] = { ...nodesRef.current[idx], label: newName.trim() };
              if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
            }
          }
        },
      },
      {
        label: "Color zona",
        icon: menuIcons.Palette,
        onClick: () => {
          setColorPickerNodeId(nodeId);
          setColorPickerOpen(true);
        },
      },
      {
        label: "Eliminar zona",
        icon: menuIcons.Trash2,
        danger: true,
        divider: true,
        onClick: () => {
          pushUndo();
          nodesRef.current = nodesRef.current.filter((n) => n.id !== nodeId);
          if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          toast.success("Zona eliminada");
        },
      },
    ];
  }

  // Waypoints: link + delete only
  if (isWaypoint) {
    return [
      {
        label: linkSource ? "Cancelar enlace" : "Nuevo link",
        icon: menuIcons.Link2,
        onClick: () => { if (linkSource) cancelLinkCreation(); else startLinkCreation(nodeId); },
      },
      {
        label: "Eliminar punto",
        icon: menuIcons.Trash2,
        danger: true,
        divider: true,
        onClick: () => {
          pushUndo();
          nodesRef.current = nodesRef.current.filter((n) => n.id !== nodeId);
          edgesRef.current = edgesRef.current.filter((e) => e.source_node_id !== nodeId && e.target_node_id !== nodeId);
          if (LRef.current && mapRef.current) { renderNodes(LRef.current, mapRef.current); renderEdges(LRef.current, mapRef.current); }
          toast.success("Punto eliminado");
        },
      },
    ];
  }

  // Labels: edit text, description, font size, color, rotation, delete
  if (isLabel) {
    const cd = safeJsonParse<NodeCustomData>(node?.custom_data);
    const labelSizes = [
      { label: "Pequeño (10px)", value: 10 },
      { label: "Normal (13px)", value: 13 },
      { label: "Grande (18px)", value: 18 },
      { label: "Muy grande (24px)", value: 24 },
      { label: "Título (32px)", value: 32 },
    ];
    const labelColors = [
      { label: "Blanco", hex: "#ededed" },
      { label: "Azul", hex: "#60a5fa" },
      { label: "Verde", hex: "#4ade80" },
      { label: "Rojo", hex: "#f87171" },
      { label: "Amarillo", hex: "#fbbf24" },
      { label: "Naranja", hex: "#fb923c" },
      { label: "Gris", hex: "#888888" },
    ];
    const currentColor = cd.color || "#ededed";
    const currentSize = cd.fontSize || 13;

    const updateLabelCd = (updates: Record<string, any>) => {
      const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
      if (idx >= 0) {
        const prev = nodesRef.current[idx];
        const prevCd = safeJsonParse<NodeCustomData>(prev.custom_data);
        nodesRef.current[idx] = { ...prev, custom_data: JSON.stringify({ ...prevCd, type: "textLabel", ...updates }) };
        if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
      }
    };

    return [
      {
        label: "Editar texto",
        icon: menuIcons.Pencil,
        onClick: () => {
          const newText = prompt("Texto de la etiqueta:", node?.label || "");
          if (newText?.trim()) {
            const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
            if (idx >= 0) {
              nodesRef.current[idx] = { ...nodesRef.current[idx], label: newText.trim() };
              if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
            }
          }
        },
      },
      {
        label: cd.description ? "Editar descripción" : "Agregar descripción",
        icon: menuIcons.AlignLeft,
        onClick: () => {
          const desc = prompt("Descripción (se muestra al hacer clic):", cd.description || "");
          if (desc !== null) {
            updateLabelCd({ description: desc.trim() || undefined });
          }
        },
      },
      // Font size submenu
      {
        label: `Tamaño (${currentSize}px)`,
        icon: menuIcons.Scaling,
        onClick: () => {},
        children: labelSizes.map(s => ({
          label: s.label,
          icon: menuIcons.Type,
          active: s.value === currentSize,
          onClick: () => updateLabelCd({ fontSize: s.value }),
        })),
      },
      // Color submenu
      {
        label: "Color",
        icon: menuIcons.Palette,
        onClick: () => {},
        children: labelColors.map(c => ({
          label: c.label,
          icon: menuIcons.Palette,
          colorDot: c.hex,
          active: c.hex === currentColor,
          onClick: () => updateLabelCd({ color: c.hex }),
        })),
      },
      // Rotation
      {
        label: "Rotar etiqueta",
        icon: menuIcons.RotateCcw,
        onClick: () => {
          // Show the rotation handle for this label
          camHandlesRef.current.forEach((handle, key) => {
            if (key.endsWith("-labelrot")) {
              const el = handle.getElement();
              if (el) el.style.display = "none";
            }
          });
          const thisHandle = camHandlesRef.current.get(nodeId + "-labelrot");
          if (thisHandle) {
            const el = thisHandle.getElement();
            if (el) el.style.display = "";
          }
          toast("Arrastrá el punto violeta para rotar", { icon: "↻" });
        },
      },
      // Reset rotation if rotated
      ...(cd.rotation ? [{
        label: "Restablecer rotación",
        icon: menuIcons.RotateCcw,
        onClick: () => {
          const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
          if (idx >= 0) {
            const prev = nodesRef.current[idx];
            const prevCd = safeJsonParse<NodeCustomData>(prev.custom_data);
            delete prevCd.rotation;
            nodesRef.current[idx] = { ...prev, custom_data: JSON.stringify(prevCd) };
            if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          }
        },
      }] : []),
      // Duplicate label
      {
        label: "Duplicar etiqueta",
        icon: menuIcons.Copy,
        divider: true,
        onClick: () => {
          pushUndo();
          const newId = `label-${Date.now()}`;
          nodesRef.current = [...nodesRef.current, {
            id: newId,
            kuma_monitor_id: null,
            label: node?.label || "Etiqueta",
            x: (node?.x || 0) + (isImageMode ? 30 : 0.0003),
            y: (node?.y || 0) + (isImageMode ? 30 : 0.0003),
            icon: "_textLabel",
            custom_data: node?.custom_data || null,
          }];
          if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          toast.success("Etiqueta duplicada");
        },
      },
      {
        label: "Eliminar etiqueta",
        icon: menuIcons.Trash2,
        danger: true,
        onClick: () => {
          pushUndo();
          nodesRef.current = nodesRef.current.filter((n) => n.id !== nodeId);
          if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          toast.success("Etiqueta eliminada");
        },
      },
    ];
  }

  if (node?.icon === "_rack") {
    return [
      {
        label: linkSource ? "Cancelar enlace" : "Nuevo link",
        icon: menuIcons.Link2,
        onClick: () => {
           if (linkSource) cancelLinkCreation();
           else startLinkCreation(nodeId);
        },
      },
      {
        label: "Diseñador de Rack",
        icon: menuIcons.Server,
        onClick: () => setRackDrawerNodeId(nodeId),
      },
      {
        label: "Editar Nombre",
        icon: menuIcons.Pencil,
        onClick: () => {
          const cd = safeJsonParse<NodeCustomData>(node?.custom_data);
          setInputModalConfig({ nodeId, initial: node?.label || "", mac: cd.mac || "", ip: cd.ip || "", credUser: cd.credUser || "", credPass: cd.credPass || "", credPort: cd.credPort as number | undefined, labelHidden: cd.labelHidden ?? false, labelSize: cd.labelSize ?? 12, nodeColor: cd.nodeColor || "", nodeType: cd.type, kumaMonitorId: node?.kuma_monitor_id ?? null });
          setInputModalOpen(true);
        },
      },
      {
        label: "Copiar Rack",
        icon: menuIcons.Copy,
        divider: true,
        onClick: () => {
          try {
            localStorage.setItem("kumamap_node_clipboard", JSON.stringify({
              label: node?.label ?? null,
              icon: node?.icon || "_rack",
              kuma_monitor_id: node?.kuma_monitor_id ?? null,
              x: node?.x ?? 0,
              y: node?.y ?? 0,
              width:  node?.width  ?? undefined,
              height: node?.height ?? undefined,
              color:  node?.color  ?? null,
              custom_data: node?.custom_data || null,
            }));
            toast.success(`"${node?.label}" copiado al portapapeles`);
          } catch { toast.error("No se pudo copiar"); }
        },
      },
      {
        label: "Duplicar Rack",
        icon: menuIcons.Plus,
        onClick: () => {
          if (!node) return;
          const newNodeId = `rack-${Date.now()}`;
          nodesRef.current = [...nodesRef.current, {
            id: newNodeId,
            kuma_monitor_id: node.kuma_monitor_id ?? null,
            label: node.label,
            icon: node.icon,
            x: node.x + 0.0001,
            y: node.y + 0.0001,
            custom_data: node.custom_data,
          }];
          if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          toast.success("Rack duplicado");
        },
      },
      ...(() => {
        const ncd = safeJsonParse<NodeCustomData>(node?.custom_data);
        const linked: { id: string; name: string }[] = ncd.linkedMaps || [];
        const items: any[] = [];
        linked.forEach(lm => {
          items.push({
            label: `Abrir: ${lm.name}`,
            icon: menuIcons.ExternalLink,
            divider: items.length === 0,
            onClick: () => {
              if (readonly) window.open(apiUrl(`/view/${lm.id}`), "_blank");
              else if (onOpenMap) onOpenMap(lm.id);
              else window.open(apiUrl(`/map/${lm.id}`), "_blank");
            },
          });
        });
        items.push({
          label: linked.length > 0 ? "Gestionar submapas" : "Asignar submapa",
          icon: menuIcons.FolderOpen,
          divider: linked.length === 0,
          onClick: () => setNodeMapModalNodeId(nodeId),
        });
        return items;
      })(),
      {
        label: "Eliminar Rack",
        icon: menuIcons.Trash2,
        danger: true,
        divider: true,
        onClick: () => {
          pushUndo();
          nodesRef.current = nodesRef.current.filter((n) => n.id !== nodeId);
          if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
          toast.success("Rack eliminado");
        },
      },
    ];
  }

  // ── Build normal/camera node context menu (consolidated) ──
  const isCamera = node?.icon === "_camera";
  const isSpecial = node?.icon === "_waypoint" || node?.icon === "_polygon";
  const ncd = safeJsonParse<NodeCustomData>(node?.custom_data);
  const linked: { id: string; name: string }[] = ncd.linkedMaps || [];

  return [
    // ── Primary actions ──
    {
      label: linkSource ? "Cancelar enlace" : "Nuevo link",
      icon: menuIcons.Link2,
      onClick: () => {
        if (linkSource) cancelLinkCreation();
        else startLinkCreation(nodeId);
      },
    },
    {
      label: "Editar nodo",
      icon: menuIcons.Pencil,
      onClick: () => {
        const cd = safeJsonParse<NodeCustomData>(node?.custom_data);
        setInputModalConfig({ nodeId, initial: node?.label || "", mac: cd.mac || "", ip: cd.ip || "", credUser: cd.credUser || "", credPass: cd.credPass || "", credPort: cd.credPort as number | undefined, labelHidden: cd.labelHidden ?? false, labelSize: cd.labelSize ?? 12, nodeColor: cd.nodeColor || "", nodeType: cd.type, kumaMonitorId: node?.kuma_monitor_id ?? null });
        setInputModalOpen(true);
      },
    },
    // ── Monitor ──
    {
      label: node?.kuma_monitor_id ? "Reasignar monitor" : "Asignar monitor",
      icon: menuIcons.Signal,
      onClick: () => {
        setAssignNodeId(nodeId);
        setAssignSearch("");
        setAssignModalOpen(true);
      },
    },
    // Quick-create monitor from node data
    ...(!node?.kuma_monitor_id && ncd.ip ? [{
      label: "Crear monitor rápido",
      icon: menuIcons.Plus,
      onClick: async () => {
        const ip = ncd.ip || "";
        const label = node?.label || ip;
        // Detect best monitor type from node icon
        const icon = node?.icon || "";
        let monType = "ping";
        let monData: Record<string, unknown> = { name: label, type: "ping", hostname: ip, interval: 60 };
        if (icon === "server" || icon === "_server") {
          monType = "http";
          monData = { name: label, type: "http", url: `http://${ip}`, interval: 60 };
        } else if (icon === "router" || icon === "_router" || icon === "switch" || icon === "_switch") {
          monType = "ping";
          monData = { name: label, type: "ping", hostname: ip, interval: 60 };
        } else if (ncd.streamUrl || icon === "camera" || icon === "_camera") {
          monType = "port";
          monData = { name: label, type: "port", hostname: ip, port: 554, interval: 60 };
        }
        try {
          const res = await safeFetch<{ ok: boolean; monitorID?: number; msg?: string }>(
            apiUrl("/api/kuma/monitors"),
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(monData) },
            "QuickCreateMonitor"
          );
          if (res?.ok && res.monitorID) {
            const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
            if (idx >= 0) {
              nodesRef.current[idx] = { ...nodesRef.current[idx], kuma_monitor_id: res.monitorID };
              if (LRef.current && mapRef.current) { renderNodes(LRef.current, mapRef.current); renderEdges(LRef.current, mapRef.current); }
            }
            toast.success(`Monitor "${label}" creado (${monType})`, { description: `ID: ${res.monitorID}` });
          } else {
            toast.error(res?.msg || "Error al crear monitor");
          }
        } catch (e: any) {
          toast.error("Error al crear monitor: " + e.message);
        }
      },
    }] : []),
    ...(node?.kuma_monitor_id ? [{
      label: "Desasignar monitor",
      icon: menuIcons.Trash2,
      onClick: () => {
        const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
        if (idx >= 0) {
          nodesRef.current[idx] = { ...nodesRef.current[idx], kuma_monitor_id: null };
          if (LRef.current && mapRef.current) {
            renderNodes(LRef.current, mapRef.current);
            renderEdges(LRef.current, mapRef.current);
          }
          toast.success("Monitor desasignado");
        }
      },
    }] : []),
    // ── Appearance (submenu) ──
    ...(!isSpecial ? [{
      label: "Apariencia",
      icon: menuIcons.Palette,
      onClick: () => {},
      children: [
        {
          label: "Cambiar icono",
          icon: menuIcons.Palette,
          onClick: () => setIconPickerNodeId(nodeId),
        },
        {
          label: "Tamaño",
          icon: menuIcons.Scaling,
          onClick: () => setSizePickerNodeId(nodeId),
        },
        ...(isCamera ? [{
          label: "Color y estilo",
          icon: menuIcons.Palette,
          onClick: () => {
            setColorPickerNodeId(nodeId);
            setColorPickerOpen(true);
          },
        }] : []),
      ],
    }] : []),
    // ── Camera-specific (submenu) ──
    ...(isCamera ? [{
      label: "Cámara",
      icon: menuIcons.Signal,
      divider: true,
      onClick: () => {},
      children: [
        {
          label: "Configurar stream",
          icon: menuIcons.Signal,
          onClick: () => setStreamConfigNodeId(nodeId),
        },
        {
          label: "Tipo: IP estándar",
          icon: menuIcons.Signal,
          active: !ncd.cameraType,
          onClick: () => {
            const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
            if (idx >= 0) {
              const nc = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
              delete nc.cameraType;
              delete nc.eventEndpoint;
              nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(nc) };
              if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
              toast.success("Tipo: IP estándar");
            }
          },
        },
        {
          label: "Tipo: LPR (Matrícula)",
          icon: menuIcons.Signal,
          active: ncd.cameraType === "lpr",
          onClick: () => {
            const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
            if (idx >= 0) {
              const nc = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
              nc.cameraType = "lpr";
              nc.eventEndpoint = `/api/hik/events/${nodeId}`;
              nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(nc) };
              if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
              toast.success("Tipo: LPR", { description: `Endpoint: ${nc.eventEndpoint}` });
            }
          },
        },
        {
          label: "Tipo: Face Recognition",
          icon: menuIcons.Signal,
          active: ncd.cameraType === "face",
          onClick: () => {
            const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
            if (idx >= 0) {
              const nc = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
              nc.cameraType = "face";
              nc.eventEndpoint = `/api/hik/events/${nodeId}`;
              nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(nc) };
              if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
              toast.success("Tipo: Face Recognition", { description: `Endpoint: ${nc.eventEndpoint}` });
            }
          },
        },
        // Show endpoint URL for copying (only for LPR/Face)
        ...(ncd.cameraType === "lpr" || ncd.cameraType === "face" ? [{
          label: "Copiar endpoint",
          icon: menuIcons.Copy,
          divider: true,
          onClick: () => {
            const endpoint = ncd.eventEndpoint || `/api/hik/events/${nodeId}`;
            navigator.clipboard.writeText(`${window.location.origin}${endpoint}`).then(
              () => toast.success("Endpoint copiado al portapapeles", { description: `${window.location.origin}${endpoint}` }),
              () => toast.error("Error al copiar")
            );
          },
        }] : []),
        ...(ncd.streamUrl ? [{
          label: "Ver stream",
          icon: menuIcons.Signal,
          onClick: () => setStreamViewers(prev => {
            if (prev.some(v => v.nodeId === nodeId)) return prev;
            if (prev.length >= MAX_STREAMS) return prev;
            return [...prev, { nodeId, mode: "pip" }];
          }),
        }] : []),
        {
          label: "Lente / FOV",
          icon: menuIcons.Maximize2,
          onClick: () => {
            setLensPickerNodeId(nodeId);
            setLensPickerOpen(true);
          },
        },
        {
          label: isImageMode ? "Alcance (px)" : "Distancia focal",
          icon: menuIcons.Maximize2,
          onClick: () => {
            const camCd = safeJsonParse<NodeCustomData>(node?.custom_data);
            if (isImageMode) {
              const rawR = camCd.fovRange ?? 200;
              const currentPx = rawR < 1 ? Math.round(rawR * 100000) : Math.round(rawR);
              const input = prompt("Alcance (píxeles):\n• 50 = cerca\n• 200 = normal\n• 500 = lejos", String(currentPx));
              if (input) {
                const px = parseFloat(input);
                if (!isNaN(px) && px > 0) {
                  const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
                  if (idx >= 0) {
                    const nc = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
                    nc.fovRange = px;
                    nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(nc) };
                    if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
                  }
                }
              }
            } else {
              const current = camCd.fovRange || 0.002;
              const input = prompt("Distancia focal (metros):\n• 50 = cerca\n• 200 = normal\n• 500+ = lejos", String(Math.round(current * 100000)));
              if (input) {
                const meters = parseFloat(input);
                if (!isNaN(meters) && meters > 0) {
                  const newRange = Math.max(0.00005, meters / 100000);
                  const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
                  if (idx >= 0) {
                    const nc = safeJsonParse<NodeCustomData>(nodesRef.current[idx].custom_data);
                    nc.fovRange = parseFloat(newRange.toFixed(6));
                    nodesRef.current[idx] = { ...nodesRef.current[idx], custom_data: JSON.stringify(nc) };
                    if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
                  }
                }
              }
            }
          },
        },
        {
          label: "Descubrir ONVIF",
          icon: menuIcons.Signal,
          divider: true,
          onClick: () => setOnvifModalOpen(true),
        },
      ],
    }] : []),
    // ── Antenna-specific ──
    ...(node?.icon === "_antenna" ? [{
      label: "Antena",
      icon: menuIcons.Signal,
      divider: true,
      onClick: () => {},
      children: [
        {
          label: "Configurar antena",
          icon: menuIcons.Signal,
          onClick: () => setAntennaConfigNodeId(nodeId),
        },
        {
          label: "SNMP Wireless",
          icon: menuIcons.Signal,
          onClick: () => {
            const antCd = safeJsonParse<NodeCustomData>(node?.custom_data);
            if (antCd.ip) {
              setAntennaSnmpNodeId(nodeId);
            } else {
              toast.info("Configura una IP en la antena para usar SNMP", { id: "antenna-snmp-noip" });
            }
          },
        },
      ],
    }] : []),
    // ── UPS-specific ──
    ...(node?.icon === "ups" ? [
      {
        label: "Monitor UPS",
        icon: menuIcons.Activity,
        onClick: () => {
          const upsCd = safeJsonParse<NodeCustomData>(node?.custom_data);
          if (upsCd.ip) {
            const cx = ctxMenu?.x ?? 400;
            const cy = ctxMenu?.y ?? 200;
            setUpsPaneles((ps) => ps.some((p) => p.nodeId === nodeId) ? ps : [...ps, { nodeId, x: cx, y: cy }]);
          } else {
            toast.info("Configura la UPS (IP o host NUT) para monitorearla", { id: "ups-noip" });
            setUpsConfigNodeId(nodeId);
          }
        },
      },
      {
        label: "Configurar UPS",
        icon: menuIcons.Settings,
        divider: true,
        onClick: () => setUpsConfigNodeId(nodeId),
      },
    ] : []),
    // ── Copiar / Duplicar ──
    {
      label: "Copiar nodo",
      icon: menuIcons.Copy,
      divider: true,
      onClick: () => {
        try {
          localStorage.setItem("kumamap_node_clipboard", JSON.stringify({
            label: node?.label ?? null,
            icon: node?.icon || "server",
            kuma_monitor_id: node?.kuma_monitor_id ?? null,
            x: node?.x ?? 0, y: node?.y ?? 0,
            width: node?.width ?? undefined, height: node?.height ?? undefined,
            color: node?.color ?? null, custom_data: node?.custom_data || null,
          }));
          toast.success(`"${node?.label || node?.icon}" copiado`);
        } catch { toast.error("No se pudo copiar"); }
      },
    },
    {
      label: "Duplicar nodo",
      icon: menuIcons.Plus,
      onClick: () => {
        pushUndo();
        const newId = `node-${Date.now()}`;
        const cd = safeJsonParse<NodeCustomData>(node?.custom_data);
        nodesRef.current = [...nodesRef.current, {
          id: newId,
          kuma_monitor_id: isCamera ? node?.kuma_monitor_id : null,
          label: (node?.label || "Nodo") + " (copia)",
          x: (node?.x || 0) + 0.0003,
          y: (node?.y || 0) + 0.0003,
          icon: node?.icon || "server",
          custom_data: node?.custom_data || null,
        }];
        if (LRef.current && mapRef.current) renderNodes(LRef.current, mapRef.current);
        toast.success("Nodo duplicado");
      },
    },
    // ── TimeMachine ──
    ...(node?.kuma_monitor_id ? [{
      label: "TimeMachine",
      icon: menuIcons.Clock,
      divider: true,
      onClick: () => {
        setTmFocusMonitorId(node!.kuma_monitor_id!);
        setTimeMachineOpen(true);
      },
    }] : []),
    // ── Linked maps ──
    ...(() => {
      const items: any[] = [];
      linked.forEach(lm => {
        items.push({
          label: `Abrir: ${lm.name}`,
          icon: menuIcons.ExternalLink,
          divider: items.length === 0,
          onClick: () => {
            if (readonly) window.open(apiUrl(`/view/${lm.id}`), "_blank");
            else if (onOpenMap) onOpenMap(lm.id);
            else window.open(apiUrl(`/map/${lm.id}`), "_blank");
          },
        });
      });
      items.push({
        label: linked.length > 0 ? "Gestionar mapas" : "Asignar mapa",
        icon: menuIcons.FolderOpen,
        divider: linked.length === 0,
        onClick: () => setNodeMapModalNodeId(nodeId),
      });
      return items;
    })(),
    {
      label: "Eliminar nodo",
      icon: menuIcons.Trash2,
      danger: true,
      divider: true,
      onClick: () => {
        pushUndo();
        nodesRef.current = nodesRef.current.filter((n) => n.id !== nodeId);
        edgesRef.current = edgesRef.current.filter(
          (e) => e.source_node_id !== nodeId && e.target_node_id !== nodeId
        );
        if (LRef.current && mapRef.current) {
          renderNodes(LRef.current, mapRef.current);
          renderEdges(LRef.current, mapRef.current);
        }
        toast.success("Nodo eliminado");
      },
    },
  ];
}
