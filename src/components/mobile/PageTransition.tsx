"use client";

import { useEffect, useState, type ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * Wraps page content with a fade-in-up animation on mount.
 * Lightweight — just CSS animation, no layout shift.
 */
export default function PageTransition({ children }: PageTransitionProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Small delay to let the browser paint the initial frame
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <div
        className="flex flex-col min-h-screen"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 0.25s ease-out, transform 0.25s ease-out",
        }}
      >
        {children}
      </div>
    </>
  );
}
