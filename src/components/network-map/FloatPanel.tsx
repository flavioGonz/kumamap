"use client";

/**
 * Ventana flotante genérica del mapa (tráfico, monitor-ng… y, por dentro, la
 * misma mecánica que el panel de UPS): un div fijo a la pantalla que se arrastra
 * con el mouse y guarda su posición. Sin marco; los controles (editar / cerrar /
 * lo que se pase) aparecen sólo al pasar el mouse por encima, arriba a la derecha.
 *
 * La posición se guarda en coordenadas absolutas de pantalla [left, top], igual
 * que el UpsPanel, para que las tres ventanas se comporten idéntico.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

const STYLE_ID = "km-floatpanel-styles";
function inyectar() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    .km-fp .km-fp-ctrls{opacity:0;transition:opacity .15s;pointer-events:none}
    .km-fp:hover .km-fp-ctrls{opacity:1;pointer-events:auto}
    .km-fp-btn{width:20px;height:20px;display:flex;align-items:center;justify-content:center;
      border-radius:6px;background:rgba(255,255,255,.08);cursor:pointer;color:#c4d0e0;font-size:11px;
      border:none;transition:background .12s,color .12s}
    .km-fp-btn:hover{background:rgba(255,255,255,.16);color:#fff}
  `;
  document.head.appendChild(s);
}

export interface FloatControl {
  key: string;
  title: string;
  content: ReactNode;
  onClick: () => void;
}

export default function FloatPanel({
  posGuardada, defaultPos, onMover, width = 214, accent, children, controls,
}: {
  posGuardada?: { left: number; top: number } | null;
  defaultPos?: { left: number; top: number };
  onMover?: (pos: { left: number; top: number }) => void;
  width?: number;
  accent?: string;
  children: ReactNode;
  controls?: FloatControl[];
}) {
  useEffect(() => { inyectar(); }, []);

  const anchoVentana = typeof window !== "undefined" ? window.innerWidth : 1280;
  const altoVentana = typeof window !== "undefined" ? window.innerHeight : 800;
  const inicial = posGuardada
    ? posGuardada
    : defaultPos || {
        left: Math.max(8, Math.min(anchoVentana - width - 60, anchoVentana * 0.5)),
        top: Math.max(8, Math.min(altoVentana - 200, altoVentana * 0.4)),
      };
  const [pos, setPos] = useState(inicial);
  const [arrastrando, setArrastrando] = useState(false);
  const salto = useRef({ x: 0, y: 0 });

  // Si la posición guardada cambia desde afuera y no estamos arrastrando, seguirla.
  const guardKey = posGuardada ? `${posGuardada.left},${posGuardada.top}` : "";
  useEffect(() => {
    if (posGuardada && !arrastrando) setPos(posGuardada);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardKey]);

  const alBajar = (e: React.MouseEvent) => {
    // No arrancar el drag desde un botón/control.
    if ((e.target as HTMLElement).closest("button, input, form, a, [data-fp-nodrag]")) return;
    e.preventDefault();
    setArrastrando(true);
    salto.current = { x: e.clientX - pos.left, y: e.clientY - pos.top };
  };
  useEffect(() => {
    if (!arrastrando) return;
    const mover = (e: MouseEvent) => setPos({ left: e.clientX - salto.current.x, top: e.clientY - salto.current.y });
    const soltar = () => { setArrastrando(false); setPos((p) => { onMover?.(p); return p; }); };
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
    return () => { window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); };
  }, [arrastrando, onMover]);

  return (
    <div
      className="km-fp fixed z-[10000]"
      onMouseDown={alBajar}
      style={{
        left: pos.left, top: pos.top, width,
        background: "rgba(8,12,20,.92)",
        border: "none",
        borderRadius: 12,
        boxShadow: accent
          ? `0 10px 28px rgba(0,0,0,.6), 0 0 0 1px ${accent}33`
          : "0 10px 28px rgba(0,0,0,.6)",
        backdropFilter: "blur(8px)",
        fontFamily: "ui-sans-serif,system-ui,sans-serif",
        cursor: arrastrando ? "grabbing" : "grab",
        userSelect: arrastrando ? "none" : "auto",
        padding: "9px 11px 8px",
        boxSizing: "border-box",
      }}
    >
      {controls && controls.length > 0 && (
        <div className="km-fp-ctrls" style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 3 }}>
          {controls.map((c) => (
            <button key={c.key} type="button" className="km-fp-btn" title={c.title}
              onClick={(e) => { e.stopPropagation(); c.onClick(); }}>
              {c.content}
            </button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
