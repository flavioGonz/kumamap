"use client";

import { memo, useState } from "react";
import { type NodeProps } from "@xyflow/react";

export interface TextLabelData {
  text: string;
  fontSize?: number;
  color?: string;
  bgEnabled?: boolean;
  [key: string]: unknown;
}

function TextLabelNode({ data, selected }: NodeProps & { data: TextLabelData }) {
  const fontSize = (data.fontSize as number) || 14;
  const color = (data.color as string) || "#ededed";
  const bgEnabled = data.bgEnabled !== false;

  return (
    <div
      className="cursor-move select-none"
      style={{
        fontSize,
        fontWeight: 700,
        color,
        letterSpacing: "0.01em",
        lineHeight: 1.3,
        textShadow: "0 2px 8px rgba(0,0,0,0.7), 0 0 4px rgba(0,0,0,0.4)",
        padding: bgEnabled ? "4px 10px" : "2px",
        borderRadius: bgEnabled ? 8 : 0,
        background: bgEnabled ? "rgba(10,10,10,0.6)" : "transparent",
        border: selected
          ? "1px dashed rgba(59,130,246,0.5)"
          : bgEnabled
          ? "1px solid rgba(255,255,255,0.06)"
          : "1px solid transparent",
        backdropFilter: bgEnabled ? "blur(8px)" : undefined,
        whiteSpace: "pre-wrap",
        maxWidth: 400,
      }}
    >
      {data.text || "Etiqueta"}
    </div>
  );
}

export default memo(TextLabelNode);
