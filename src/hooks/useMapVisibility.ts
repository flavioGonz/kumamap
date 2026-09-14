"use client";

import { useState, useEffect, useRef } from "react";

interface VisibilityRefs {
  markersRef: React.MutableRefObject<Map<string, any>>;
  polylinesRef: React.MutableRefObject<Map<string, any>>;
  fovLayersRef: React.MutableRefObject<Map<string, any>>;
  camHandlesRef: React.MutableRefObject<Map<string, any>>;
  mapRef: React.MutableRefObject<any>;
  nodesRef: React.MutableRefObject<Array<{ id: string; icon: string; [k: string]: any }>>;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
}

interface VisibilityInitial {
  showNodes?: boolean;
  showLabels?: boolean;
  straightEdges?: boolean;
  overlayOpacity?: number;
}

/**
 * Manages map layer visibility toggles (nodes, links, cameras, FOV, labels)
 * plus rotation and straight-edges preference.
 */
export function useMapVisibility(refs: VisibilityRefs, initial: VisibilityInitial = {}) {
  const [showNodes, setShowNodes] = useState(initial.showNodes ?? true);
  const [showLinks, setShowLinks] = useState(true);
  const [showCameras, setShowCameras] = useState(true);
  const [showFOV, setShowFOV] = useState(true);
  const [showLabels, setShowLabels] = useState(initial.showLabels ?? true);
  const [mapRotation, setMapRotation] = useState(0);
  const [overlayOpacity, setOverlayOpacity] = useState(initial.overlayOpacity ?? 0);
  const [straightEdges, setStraightEdges] = useState(initial.straightEdges ?? false);
  const straightEdgesRef = useRef(initial.straightEdges ?? false);

  // Keep ref in sync
  useEffect(() => {
    straightEdgesRef.current = straightEdges;
  }, [straightEdges]);

  // Toggle layer visibility without re-rendering
  useEffect(() => {
    const { markersRef, fovLayersRef, camHandlesRef, polylinesRef, mapRef, nodesRef } = refs;

    markersRef.current.forEach((marker, nodeId) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      const isCamera = node?.icon === "_camera";
      const isLabel = node?.icon === "_textLabel";
      const isWaypoint = node?.icon === "_waypoint";

      const setMarkerVisible = (visible: boolean) => {
        marker.getElement()?.style.setProperty("display", visible ? "" : "none");
        const tooltip = marker.getTooltip();
        const tooltipEl = tooltip?.getElement?.();
        if (tooltipEl) tooltipEl.style.setProperty("display", visible ? "" : "none");
      };

      if (isCamera) {
        setMarkerVisible(showCameras);
      } else if (isWaypoint) {
        setMarkerVisible(showLinks);
      } else if (isLabel) {
        setMarkerVisible(showLabels);
      } else {
        marker.getElement()?.style.setProperty("display", showNodes ? "" : "none");
        const tooltip = marker.getTooltip();
        const tooltipEl = tooltip?.getElement?.();
        if (tooltipEl) tooltipEl.style.setProperty("display", showNodes && showLabels ? "" : "none");
      }
    });

    // FOV polygons
    fovLayersRef.current.forEach((layer) => {
      if (showFOV && showCameras) {
        try { if (!mapRef.current?.hasLayer(layer)) mapRef.current?.addLayer(layer); } catch {}
      } else {
        try { mapRef.current?.removeLayer(layer); } catch {}
      }
    });

    // Camera edit handles
    camHandlesRef.current.forEach((handle) => {
      const shouldShow = showCameras && showFOV;
      if (shouldShow) {
        try { if (!mapRef.current?.hasLayer(handle)) mapRef.current?.addLayer(handle); } catch {}
      } else {
        try { mapRef.current?.removeLayer(handle); } catch {}
      }
    });

    // Links
    polylinesRef.current.forEach((line) => {
      if (showLinks) {
        try { if (!mapRef.current?.hasLayer(line)) mapRef.current?.addLayer(line); } catch {}
      } else {
        try { mapRef.current?.removeLayer(line); } catch {}
      }
    });
  }, [showNodes, showLinks, showCameras, showFOV, showLabels]);

  // Map rotation
  useEffect(() => {
    if (refs.containerRef.current) {
      refs.containerRef.current.style.transform = mapRotation ? `rotate(${mapRotation}deg)` : "";
      refs.containerRef.current.style.transformOrigin = "center center";
    }
  }, [mapRotation]);

  return {
    showNodes, setShowNodes,
    showLinks, setShowLinks,
    showCameras, setShowCameras,
    showFOV, setShowFOV,
    showLabels, setShowLabels,
    mapRotation, setMapRotation,
    overlayOpacity, setOverlayOpacity,
    straightEdges, setStraightEdges,
    straightEdgesRef,
  };
}
