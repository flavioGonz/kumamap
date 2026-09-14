"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiUrl } from "@/lib/api";
import type { HikEvent } from "@/lib/types";

interface HikDetectionPopupProps {
  event: HikEvent;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
  autoCloseMs?: number;
}

/**
 * Floating popup that appears over a camera node when an LPR/Face event arrives.
 * Shows plate number or face image with details, auto-closes after timeout.
 */
export default function HikDetectionPopup({
  event,
  anchorX,
  anchorY,
  onClose,
  autoCloseMs = 10000,
}: HikDetectionPopupProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));
    // Auto-close
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, autoCloseMs);
    return () => clearTimeout(timer);
  }, [autoCloseMs, onClose]);

  const isAnpr = event.eventType === "anpr";
  const isFace = event.eventType === "face";
  const accentColor = isAnpr ? "#06b6d4" : isFace ? "#a855f7" : "#f59e0b";

  // Compute popup position (above the node, centered)
  const popupStyle: React.CSSProperties = {
    position: "fixed",
    left: anchorX,
    top: anchorY - 10,
    transform: `translate(-50%, -100%) scale(${visible ? 1 : 0.8})`,
    opacity: visible ? 1 : 0,
    transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
    zIndex: 15000,
    pointerEvents: "auto",
  };

  const imageId = event.plateImageId || event.faceImageId || event.fullImageId;
  const time = new Date(event.timestamp).toLocaleTimeString("es-UY", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div style={popupStyle}>
      <div
        className="rounded-xl shadow-2xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(15,15,25,0.97) 0%, rgba(20,20,40,0.97) 100%)",
          border: `1px solid ${accentColor}40`,
          backdropFilter: "blur(20px)",
          minWidth: 220,
          maxWidth: 320,
        }}
      >
        {/* Header */}
        <div
          className="px-3 py-2 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${accentColor}20` }}
        >
          <div className="flex items-center gap-2">
            {/* Event type badge */}
            <span
              className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider"
              style={{
                background: `${accentColor}20`,
                color: accentColor,
                border: `1px solid ${accentColor}30`,
              }}
            >
              {isAnpr ? "LPR" : isFace ? "FACE" : event.eventType.toUpperCase()}
            </span>
            <span className="text-[10px] text-white/40 font-mono">{time}</span>
          </div>
          <button
            onClick={() => {
              setVisible(false);
              setTimeout(onClose, 200);
            }}
            className="p-0.5 rounded hover:bg-white/10 transition-colors"
            style={{ color: "#666" }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Content */}
        <div className="px-3 py-2.5">
          {isAnpr && (
            <div className="flex items-center gap-3">
              {/* Plate image */}
              {imageId && (
                <div
                  className="rounded-lg overflow-hidden shrink-0"
                  style={{
                    border: "1px solid rgba(255,255,255,0.1)",
                    width: 80,
                    height: 40,
                  }}
                >
                  <img
                    src={apiUrl(`/api/hik/images/${imageId}`)}
                    alt="Placa"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                {/* License plate — big and bold */}
                <div
                  className="text-lg font-black tracking-widest"
                  style={{ color: accentColor, fontFamily: "monospace" }}
                >
                  {event.licensePlate || "---"}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {event.direction && (
                    <span className="text-[9px] text-white/50">
                      {event.direction === "forward" ? "→" : event.direction === "reverse" ? "←" : "↔"}{" "}
                      {event.direction}
                    </span>
                  )}
                  {event.confidence && (
                    <span className="text-[9px] text-white/40">{event.confidence}%</span>
                  )}
                </div>
                {(event.vehicleType || event.vehicleColor) && (
                  <div className="text-[9px] text-white/35 mt-0.5 truncate">
                    {[event.vehicleColor, event.vehicleType].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {isFace && (
            <div className="flex items-center gap-3">
              {/* Face image */}
              {imageId && (
                <div
                  className="rounded-full overflow-hidden shrink-0"
                  style={{
                    border: `2px solid ${accentColor}40`,
                    width: 48,
                    height: 48,
                  }}
                >
                  <img
                    src={apiUrl(`/api/hik/images/${imageId}`)}
                    alt="Rostro"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white">
                  {event.faceName || "Desconocido"}
                </div>
                {event.similarity && (
                  <div className="text-[10px] mt-0.5" style={{ color: accentColor }}>
                    {event.similarity}% coincidencia
                  </div>
                )}
                {event.faceScore && (
                  <div className="text-[9px] text-white/40">
                    Score: {event.faceScore}
                  </div>
                )}
                {event.employeeNo && (
                  <div className="text-[9px] text-white/35 font-mono">
                    ID: {event.employeeNo}
                  </div>
                )}
              </div>
            </div>
          )}

          {!isAnpr && !isFace && (
            <div className="text-xs text-white/60">
              Evento: {event.eventType} desde {event.cameraIp}
            </div>
          )}
        </div>

        {/* Bottom accent line */}
        <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />
      </div>

      {/* Pointer triangle */}
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: `6px solid ${accentColor}40`,
          margin: "0 auto",
        }}
      />
    </div>
  );
}
