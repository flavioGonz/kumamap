"use client";

import React, { useEffect, useRef, useState } from "react";

interface TrailPoint { x: number; y: number; t: number; }

interface LaserPointerProps {
  /** Div contenedor del mapa; el láser se dibuja relativo a él (debe ser position:relative). */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Estado activo (controlado por la toolbar). */
  active: boolean;
  /** Se llama cuando el usuario togglea con la tecla. */
  onToggle?: (next: boolean) => void;
  /** Tecla de toggle (default "l"). */
  toggleKey?: string;
  /** Color del punto (default rojo láser). */
  color?: string;
}

const TRAIL_MS = 380;

export default function LaserPointer({
  containerRef,
  active,
  onToggle,
  toggleKey = "l",
  color = "#ff2d2d",
}: LaserPointerProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [, force] = useState(0);
  const trailRef = useRef<TrailPoint[]>([]);
  const rafRef = useRef<number | null>(null);

  // Tecla de toggle (ignora si el foco está en un input)
  useEffect(() => {
    if (!onToggle) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key.toLowerCase() === toggleKey.toLowerCase() && !e.ctrlKey && !e.metaKey && !e.altKey) {
        onToggle(!active);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onToggle, toggleKey]);

  // Seguimiento del mouse + loop de desvanecido de la estela
  useEffect(() => {
    if (!active) {
      setPos(null);
      trailRef.current = [];
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const onMove = (e: MouseEvent) => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box) return;
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      if (x < 0 || y < 0 || x > box.width || y > box.height) { setPos(null); return; }
      setPos({ x, y });
      trailRef.current.push({ x, y, t: performance.now() });
      if (trailRef.current.length > 24) trailRef.current.shift();
    };
    const tick = () => {
      const now = performance.now();
      trailRef.current = trailRef.current.filter((p) => now - p.t < TRAIL_MS);
      force((n) => (n + 1) & 0xffff);
      rafRef.current = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active, containerRef]);

  if (!active) return null;

  const now = performance.now();
  const trail = trailRef.current;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4000, overflow: "hidden" }}>
      {trail.map((p, i) => {
        const age = (now - p.t) / TRAIL_MS; // 0..1
        const op = Math.max(0, 1 - age) * 0.5;
        const size = 6 + (1 - age) * 6;
        return (
          <span
            key={`${p.t}-${i}`}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              borderRadius: "50%",
              background: color,
              opacity: op,
              filter: "blur(1px)",
            }}
          />
        );
      })}
      {pos && (
        <span
          style={{
            position: "absolute",
            left: pos.x,
            top: pos.y,
            width: 18,
            height: 18,
            marginLeft: -9,
            marginTop: -9,
            borderRadius: "50%",
            background: `radial-gradient(circle, #fff 0%, ${color} 35%, rgba(255,45,45,0.15) 70%, transparent 72%)`,
            boxShadow: `0 0 10px 4px ${color}, 0 0 22px 10px rgba(255,45,45,0.45)`,
          }}
        />
      )}
    </div>
  );
}
