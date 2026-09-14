"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class MapErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[MapErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          height: "100%", width: "100%", background: "#0a0a0a", color: "#e2e8f0", fontFamily: "system-ui, sans-serif",
          gap: 16, padding: 40,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
          }}>
            ⚠
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f87171" }}>
            Error en el mapa
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "#94a3b8", textAlign: "center", maxWidth: 400 }}>
            Se produjo un error inesperado al renderizar el mapa.
            Esto no afecta tus datos guardados.
          </p>
          <pre style={{
            background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 16px",
            fontSize: 11, color: "#f87171", maxWidth: 500, overflow: "auto", maxHeight: 100,
            border: "1px solid rgba(255,255,255,0.1)",
          }}>
            {this.state.error?.message || "Error desconocido"}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "8px 24px", borderRadius: 8, border: "1px solid rgba(59,130,246,0.5)",
              background: "rgba(59,130,246,0.1)", color: "#60a5fa", fontSize: 13, fontWeight: 600,
              cursor: "pointer", transition: "all 0.2s",
            }}
            onMouseOver={(e) => { (e.target as HTMLElement).style.background = "rgba(59,130,246,0.2)"; }}
            onMouseOut={(e) => { (e.target as HTMLElement).style.background = "rgba(59,130,246,0.1)"; }}
          >
            Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
