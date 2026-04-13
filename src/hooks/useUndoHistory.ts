"use client";

import { useRef } from "react";
import { toast } from "sonner";

/**
 * Generic undo history for map nodes & edges.
 * Stores deep clones so each snapshot is independent.
 */
export function useUndoHistory<N, E>(
  nodesRef: React.MutableRefObject<N[]>,
  edgesRef: React.MutableRefObject<E[]>,
  onRestore: () => void,
  maxUndo = 30,
) {
  const stackRef = useRef<Array<{ nodes: N[]; edges: E[] }>>([]);

  function pushUndo() {
    stackRef.current.push({
      nodes: structuredClone(nodesRef.current),
      edges: structuredClone(edgesRef.current),
    });
    if (stackRef.current.length > maxUndo) stackRef.current.shift();
  }

  function performUndo() {
    const prev = stackRef.current.pop();
    if (!prev) {
      toast.info("Nada que deshacer");
      return;
    }
    nodesRef.current = prev.nodes;
    edgesRef.current = prev.edges;
    onRestore();
    toast.success("Deshecho");
  }

  return { pushUndo, performUndo };
}
