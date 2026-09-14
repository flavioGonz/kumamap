"use client";

import { useRef, useState, useCallback, useEffect, type ReactNode } from "react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

const THRESHOLD = 70; // px to pull before triggering
const MAX_PULL = 100;

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const onTouchStart = useCallback((e: TouchEvent) => {
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    setPulling(true);
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy < 0) { setPullDistance(0); return; }
    // Dampen the pull for rubber-band feel
    const dampened = Math.min(dy * 0.4, MAX_PULL);
    setPullDistance(dampened);
  }, [pulling, refreshing]);

  const onTouchEnd = useCallback(async () => {
    if (!pulling) return;
    setPulling(false);
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(THRESHOLD * 0.6);
      try { await onRefresh(); } catch {}
      setRefreshing(false);
    }
    setPullDistance(0);
  }, [pulling, pullDistance, refreshing, onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  const ready = pullDistance >= THRESHOLD;

  return (
    <div ref={containerRef} className="flex flex-col min-h-screen overflow-y-auto">
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all"
        style={{
          height: pullDistance > 0 ? pullDistance : 0,
          opacity: pullDistance > 10 ? 1 : 0,
        }}
      >
        <svg
          width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke={ready || refreshing ? "#60a5fa" : "#555"}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={refreshing ? "animate-spin" : ""}
          style={{
            transform: refreshing ? "none" : `rotate(${Math.min(pullDistance / THRESHOLD, 1) * 180}deg)`,
            transition: pulling ? "none" : "transform 0.2s",
          }}
        >
          {refreshing ? (
            <><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></>
          ) : (
            <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>
          )}
        </svg>
      </div>
      {children}
    </div>
  );
}
