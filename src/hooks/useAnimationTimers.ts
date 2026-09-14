"use client";

import { useRef, useEffect } from "react";

/**
 * Manages tracked setTimeout calls that auto-clean from a set
 * and are all cleared on component unmount.
 */
export function useAnimationTimers() {
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => clearTimeout(id));
      timersRef.current.clear();
    };
  }, []);

  /** setTimeout that auto-removes itself from the tracking set when fired */
  function safeTimeout(fn: () => void, delay: number) {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, delay);
    timersRef.current.add(id);
    return id;
  }

  return { safeTimeout };
}
