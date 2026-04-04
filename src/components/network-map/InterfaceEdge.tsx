import {
  EdgeLabelRenderer,
  BaseEdge,
  getBezierPath,
  getStraightPath,
} from "@xyflow/react";

// Module-level edge style setting (avoids prop drilling through ReactFlow)
let _edgeStyleStraight = false;
export function setEdgeStyleStraight(v: boolean) { _edgeStyleStraight = v; }

export default function InterfaceEdge({ id, sourceX, sourceY, targetX, targetY, data, style, selected, markerEnd }: any) {
  const [edgePath, labelX, labelY] = _edgeStyleStraight
    ? getStraightPath({ sourceX, sourceY, targetX, targetY })
    : getBezierPath({ sourceX, sourceY, targetX, targetY });

  // Calculate perpendicular offset to avoid overlapping labels
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpX = (-dy / len) * 14; // 14px perpendicular offset
  const perpY = (dx / len) * 14;

  // Position labels along the edge with perpendicular offset
  const srcLabelX = sourceX + dx * 0.22 + perpX;
  const srcLabelY = sourceY + dy * 0.22 + perpY;
  const tgtLabelX = sourceX + dx * 0.78 + perpX;
  const tgtLabelY = sourceY + dy * 0.78 + perpY;

  const hasLabels = data?.sourceInterface || data?.targetInterface;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected ? 3 : 2,
          filter: selected ? `drop-shadow(0 0 6px ${style?.stroke || "#4b5563"})` : undefined,
        }}
      />
      <EdgeLabelRenderer>
        {/* Source interface — blue badge */}
        {data?.sourceInterface && (
          <div
            className="nodrag nopan absolute text-[8px] font-bold rounded px-1.5 py-[1px] cursor-pointer whitespace-nowrap"
            style={{
              transform: `translate(-50%, -50%) translate(${srcLabelX}px, ${srcLabelY}px)`,
              background: "rgba(59,130,246,0.18)",
              border: "1px solid rgba(59,130,246,0.4)",
              color: "#60a5fa",
              pointerEvents: "all",
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
            }}
            title={`Interfaz origen: ${data.sourceInterface}`}
          >
            {data.sourceInterface}
          </div>
        )}
        {/* Target interface — purple badge */}
        {data?.targetInterface && (
          <div
            className="nodrag nopan absolute text-[8px] font-bold rounded px-1.5 py-[1px] cursor-pointer whitespace-nowrap"
            style={{
              transform: `translate(-50%, -50%) translate(${tgtLabelX}px, ${tgtLabelY}px)`,
              background: "rgba(139,92,246,0.18)",
              border: "1px solid rgba(139,92,246,0.4)",
              color: "#a78bfa",
              pointerEvents: "all",
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
            }}
            title={`Interfaz destino: ${data.targetInterface}`}
          >
            {data.targetInterface}
          </div>
        )}
        {/* Center cable label — only if there's a label */}
        {data?.label && (
          <div
            className="nodrag nopan absolute text-[7px] font-semibold rounded px-1.5 py-[1px] uppercase tracking-wider cursor-pointer whitespace-nowrap"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + (hasLabels ? -12 : 0)}px)`,
              background: "rgba(10,10,10,0.9)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#999",
              pointerEvents: "all",
              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
            }}
            title={`Cable: ${data.label}`}
          >
            {data.label}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
