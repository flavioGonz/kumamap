"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, Rocket, CheckCircle, XCircle, Loader2, Clock,
  ArrowDown, GitCommit, RefreshCw, Terminal, ChevronDown, ChevronRight,
} from "lucide-react";
import { apiUrl } from "@/lib/api";

interface VersionInfo {
  appVersion: string;
  local: { commit: string; date: string; message: string; branch: string };
  remote: { commit: string; date: string; message: string } | null;
  updateAvailable: boolean;
  commitsBehind: number;
  newCommits: { hash: string; date: string; msg: string }[];
  fetchError?: string;
}

interface StepResult {
  step: string;
  output: string;
  ok: boolean;
  ms: number;
}

interface DeployResponse {
  status: "success" | "error";
  durationMs: number;
  steps: StepResult[];
  error?: string;
}

export default function DeployModal({ onClose }: { onClose: () => void }) {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [result, setResult] = useState<DeployResponse | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const checkVersion = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(apiUrl("/api/version"));
      if (res.ok) setVersion(await res.json());
    } catch {} finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { checkVersion(); }, [checkVersion]);

  const handleUpdate = useCallback(async () => {
    setUpdating(true);
    setResult(null);
    setCurrentStep("git pull");

    try {
      const res = await fetch(apiUrl("/api/deploy"), { method: "POST" });
      const data: DeployResponse = await res.json();
      setResult(data);
      // Re-check version after update
      if (data.status === "success") {
        setTimeout(checkVersion, 2000);
      }
    } catch (err: any) {
      setResult({
        status: "error",
        durationMs: 0,
        steps: [{ step: "conexión", output: err.message || "Error de red", ok: false, ms: 0 }],
      });
    } finally {
      setUpdating(false);
      setCurrentStep("");
    }
  }, [checkVersion]);

  const stepLabels: Record<string, string> = {
    "git pull": "Descargando cambios",
    "npm install": "Instalando dependencias",
    "build": "Compilando aplicación",
    "restart": "Reiniciando servidor",
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative w-[480px] max-h-[85vh] rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "linear-gradient(180deg, rgba(20,20,20,0.98), rgba(12,12,12,0.99))",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 25px 80px rgba(0,0,0,0.8)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <Rocket className="h-4 w-4 text-orange-400" />
            <h3 className="text-sm font-bold text-[#eee]">Actualizador OTA</h3>
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-white transition-colors cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Loading */}
          {checking && !version && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
            </div>
          )}

          {version && (
            <>
              {/* Current version */}
              <div className="rounded-2xl p-3.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[#555] font-bold uppercase tracking-wider">Versión instalada</span>
                  <button
                    onClick={checkVersion}
                    disabled={checking}
                    className="flex items-center gap-1 text-[10px] text-[#555] hover:text-[#888] transition-all cursor-pointer"
                  >
                    <RefreshCw className={`h-3 w-3 ${checking ? "animate-spin" : ""}`} />
                    Verificar
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)" }}>
                    <span className="text-xs font-bold text-blue-400">v{version.appVersion}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-[#ddd]">{version.local.message}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] font-mono text-[#555]">{version.local.commit}</span>
                      <span className="text-[9px] text-[#444]">{version.local.branch}</span>
                      <span className="text-[9px] text-[#444]">{new Date(version.local.date).toLocaleDateString("es")}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Updates available */}
              {version.updateAvailable && version.remote && !result && (
                <div className="rounded-2xl p-3.5" style={{ background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.15)" }}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <ArrowDown className="h-3.5 w-3.5 text-green-400" />
                    <span className="text-[10px] text-green-400 font-bold uppercase tracking-wider">
                      {version.commitsBehind} actualización{version.commitsBehind > 1 ? "es" : ""} disponible{version.commitsBehind > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {version.newCommits.map((c) => (
                      <div key={c.hash} className="flex items-start gap-2 text-[10px]">
                        <GitCommit className="h-3 w-3 text-green-400/50 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <span className="font-mono text-[#666]">{c.hash}</span>
                          <span className="text-[#888] ml-1.5">{c.msg}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Up to date */}
              {!version.updateAvailable && !version.fetchError && !result && (
                <div className="rounded-2xl p-3.5 flex items-center gap-3" style={{ background: "rgba(59,130,246,0.04)", border: "1px solid rgba(59,130,246,0.1)" }}>
                  <CheckCircle className="h-4 w-4 text-blue-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-blue-400">Estás al día</div>
                    <div className="text-[10px] text-[#555]">No hay actualizaciones disponibles</div>
                  </div>
                </div>
              )}

              {/* Fetch error */}
              {version.fetchError && !result && (
                <div className="rounded-2xl p-3.5 flex items-center gap-3" style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.1)" }}>
                  <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                  <div className="text-[10px] text-[#888]">{version.fetchError}</div>
                </div>
              )}
            </>
          )}

          {/* Updating progress */}
          {updating && (
            <div className="rounded-2xl p-4" style={{ background: "rgba(249,115,22,0.04)", border: "1px solid rgba(249,115,22,0.15)" }}>
              <div className="flex flex-col items-center py-4 gap-3">
                <div className="relative">
                  <Loader2 className="h-10 w-10 text-orange-400 animate-spin" />
                  <Rocket className="h-4 w-4 text-orange-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <p className="text-sm font-bold text-[#ccc]">Actualizando...</p>
                <p className="text-[10px] text-[#555]">
                  {stepLabels[currentStep] || currentStep}
                </p>
              </div>
              {/* Step progress */}
              <div className="flex items-center justify-center gap-1.5 mt-2">
                {["git pull", "npm install", "build", "restart"].map((s, i) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <div
                      className="h-1.5 w-8 rounded-full transition-all duration-500"
                      style={{
                        background: currentStep === s ? "#f97316" :
                          ["git pull", "npm install", "build", "restart"].indexOf(currentStep) > i ? "#22c55e" : "rgba(255,255,255,0.06)",
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-2">
              {/* Overall status */}
              <div
                className="rounded-2xl p-3.5 flex items-center gap-3"
                style={{
                  background: result.status === "success" ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
                  border: `1px solid ${result.status === "success" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                }}
              >
                {result.status === "success"
                  ? <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />
                  : <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                }
                <div className="flex-1">
                  <div className="text-xs font-bold" style={{ color: result.status === "success" ? "#86efac" : "#fca5a5" }}>
                    {result.status === "success" ? "Actualización completada" : "Error en la actualización"}
                  </div>
                  <div className="text-[10px] text-[#555]">
                    Tiempo total: {(result.durationMs / 1000).toFixed(1)}s
                  </div>
                </div>
              </div>

              {/* Step details */}
              <div className="space-y-1">
                <span className="text-[10px] text-[#555] font-bold uppercase tracking-wider">Detalle</span>
                {result.steps.map((step) => (
                  <div key={step.step}>
                    <button
                      onClick={() => setExpandedStep(expandedStep === step.step ? null : step.step)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-left cursor-pointer"
                      style={{
                        background: "rgba(255,255,255,0.02)",
                        border: `1px solid ${step.ok ? "rgba(255,255,255,0.06)" : "rgba(239,68,68,0.15)"}`,
                      }}
                    >
                      {step.ok
                        ? <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0" />
                        : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                      }
                      <span className="flex-1 text-[11px] font-semibold text-[#bbb]">{step.step}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-[#555] font-mono flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {(step.ms / 1000).toFixed(1)}s
                        </span>
                        {expandedStep === step.step
                          ? <ChevronDown className="h-3 w-3 text-[#555]" />
                          : <ChevronRight className="h-3 w-3 text-[#555]" />
                        }
                      </div>
                    </button>
                    {expandedStep === step.step && (
                      <div className="mx-2 mt-1 p-2.5 rounded-lg" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.05)", maxHeight: 180, overflowY: "auto" }}>
                        <pre className="text-[9px] font-mono text-[#888] whitespace-pre-wrap break-words">{step.output || "(sin salida)"}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 flex items-center justify-end gap-2">
          {result && (
            <button
              onClick={() => { setResult(null); checkVersion(); }}
              className="px-4 py-2 rounded-xl text-[11px] font-bold text-[#888] hover:text-[#ccc] transition-all cursor-pointer"
            >
              Volver
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[11px] font-bold text-[#666] hover:text-[#aaa] transition-all cursor-pointer"
          >
            {result ? "Cerrar" : "Cancelar"}
          </button>
          {!result && !updating && version?.updateAvailable && (
            <button
              onClick={handleUpdate}
              className="px-4 py-2 rounded-xl text-[11px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Rocket className="h-3.5 w-3.5" />
              Actualizar ({version.commitsBehind})
            </button>
          )}
          {!result && !updating && !version?.updateAvailable && version && !version.fetchError && (
            <button
              onClick={handleUpdate}
              className="px-4 py-2 rounded-xl text-[11px] font-bold bg-white/5 text-[#666] border border-white/10 hover:bg-white/10 hover:text-[#999] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Forzar rebuild
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
