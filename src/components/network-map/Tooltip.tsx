"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
  placement?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

export default function Tooltip({ content, children, placement = "top", delay = 400 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const show = () => {
    timerRef.current = setTimeout(() => {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
    }, delay);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setTimeout(() => setMounted(false), 180);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const offset = 8;
  const translateMap: Record<string, string> = {
    top: `translateY(4px)`,
    bottom: `translateY(-4px)`,
    left: `translateX(4px)`,
    right: `translateX(-4px)`,
  };
  const positionStyle: Record<string, React.CSSProperties> = {
    top:    { bottom: "100%", left: "50%", transform: `translateX(-50%) ${visible ? "" : translateMap.top}`, marginBottom: offset },
    bottom: { top: "100%",  left: "50%", transform: `translateX(-50%) ${visible ? "" : translateMap.bottom}`, marginTop: offset },
    left:   { right: "100%", top: "50%", transform: `translateY(-50%) ${visible ? "" : translateMap.left}`, marginRight: offset },
    right:  { left: "100%",  top: "50%", transform: `translateY(-50%) ${visible ? "" : translateMap.right}`, marginLeft: offset },
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center justify-center"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {mounted && (
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: "absolute",
            zIndex: 99999,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.15s ease, transform 0.15s ease",
            ...positionStyle[placement],
          }}
        >
          <div
            style={{
              background: "rgba(10,10,10,0.92)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(12px)",
              borderRadius: 8,
              padding: "4px 9px",
              fontSize: 11,
              fontWeight: 600,
              color: "#d4d4d4",
              letterSpacing: "0.01em",
              boxShadow: "0 4px 16px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset",
            }}
          >
            {content}
          </div>
        </div>
      )}
    </div>
  );
}
