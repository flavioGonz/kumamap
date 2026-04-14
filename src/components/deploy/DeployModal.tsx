"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Rocket, Server, CheckCircle, XCircle, Loader2, Clock, ArrowDown, GitCommit, RefreshCw } from "lucide-react";
import { apiUrl } from "@/lib/api";

interface DeployTarget {
  id: string;
  name: string;
  host: string;
}

interface DeployResult {
  target: string;
  host: string;
  status: "success" | "error";
  output: string;
  durationMs: number;
}

interface VersionInfo {
  appVersion: string;
  local: { commit: string; date: string; message: string; branch: string };
  remote: { commit: string; date: string; message: string } | null;
  updateAvailable: boolean;
  commitsBehind: number;
  newCommits: { hash: string; date: string; msg: string }[];
  fetchError?: string;
}

interface DeployModalProps {
  onClose: () => void;
}

export default function DeployModal({ onClose }: DeployModalProps) {
  const [targets, setTargets] = useState<DeployTarget[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deploying, setDeploying] = useState(false);
  const [results, setResults] = useState<DeployResult[] | null>(null);
  const [expandedOutput, setExpandedOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [checkingVersion, setCheckingVersion] = useState(true);

  // Fetch version + targets in parallel
  useEffect(() => {
    Promise.all([
      fetch(apiUrl("/api/deploy")).then((r) => r.json()).catch(() => ({ targets: [] })),
      fetch(apiUrl("/api/version")).then((r) => r.json()).catch(() => null),
    ]).then(([deployData, versionData]) => {
      setTargets(deployData.targets || []);
      setSelected(new Set((deployData.targets || []).map((t: DeployTarget) => t.id)));
      setVersion(versionData);
    }).finally(() => {
      setLoading(false);
      setCheckingVersion(false);
    });
  }, []);

  const checkForUpdates = useCallback(async () => {
    setCheckingVersion(true);
    try {
      const res = await fetch(apiUrl("/api/version"));
      if (res.ok) setVersion(await res.json());
    } catch {}
    finally { setCheckingVersion(false); }
  }, []);

  const toggleTarget = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeploy = useCallback(async () => {
    if (selected.size === 0) return;
    setDeploying(true);
    setResults(null);
    try {
      const res = await fetch(apiUrl("/api/deploy"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: Array.from(selected) }),
      });
      const data = await res.json();
      setResults(data.results || []);
      // Re-check version after deploy
      checkForUpdates();
    } catch (err) {
      setResults([{
        target: "Error", host: "", status: "error",
        output: err instanceof Error ? err.message : "Network error",
        durationMs: 0,
      }]);
    } finally { setDeploying(false); }
  }, [selected, checkForUpdates]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative w-[540px] max-h-[85vh] rounded-2xl overflow-hidden flex flex-col"
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
          <button onClick={onClose} className="text-[#666] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
            </div>
          )}

          {/* Version info */}
          {!loading && version && (
            <>
              {/* Current version card */}
              <div className="rounded-2xl p-3.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] text-[#555] font-bold uppercase tracking-wider">Versión actual</div>
                  <button
                    onClick={checkForUpdates}
                    disabled={checkingVersion}
                    className="flex items-center gap-1 text-[10px] text-[#555] hover:text-[#888] transition-all"
                  >
                    <RefreshCw className={`h-3 w-3 ${checkingVersion ? "animate-spin" : ""}`} />
                    Buscar
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)" }}>
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

              {/* Update available */}
              {version.updateAvailable && version.remote && (
                <div className="rounded-2xl p-3.5" style={{ background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.15)" }}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <ArrowDown className="h-3.5 w-3.5 text-green-400" />
                    <span className="text-[10px] text-green-400 font-bold uppercase tracking-wider">
                      {version.commitsBehind} commit{version.commitsBehind > 1 ? "s" : ""} disponible{version.commitsBehind > 1 ? "s" : ""}
                    </span>
                  </div>
                  {/* New commits list */}
                  <div className="space-y-1 max-h-32 overflow-y-auto">
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

              {/* No updates */}
              {!version.updateAvailable && !version.fetchError && (
                <div className="rounded-2xl p-3.5 flex items-center gap-3" style={{ background: "rgba(59,130,246,0.04)", border: "1px solid rgba(59,130,246,0.1)" }}>
                  <CheckCircle className="h-4 w-4 text-blue-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-blue-400">Estás al día</div>
                    <div className="text-[10px] text-[#555]">No hay actualizaciones disponibles</div>
                  </div>
                </div>
              )}

              {version.fetchError && (
                <div className="rounded-2xl p-3.5 flex items-center gap-3" style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.1)" }}>
                  <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                  <div className="text-[10px] text-[#888]">{version.fetchError}</div>
                </div>
              )}
            </>
          )}

          {/* Target selection */}
          {!loading && targets.length > 0 && !results && (version?.updateAvailable || targets.length > 0) && (
            <div className="space-y-1.5">
              <label className="text-[10px] text-[#555] font-bold uppercase tracking-wider">Servidores destino</label>
              {targets.map((target) => (
                <button
                  key={target.id}
                  onClick={() => toggleTarget(target.id)}
                  disabled={deploying}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
                  style={{
                    background: selected.has(target.id) ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${selected.has(target.id) ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  <div
                    className="h-4 w-4 rounded flex items-center justify-center shrink-0"
                    style={{
                      background: selected.has(target.id) ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${selected.has(target.id) ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.1)"}`,
                    }}
                  >
                    {selected.has(target.id) && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                  </div>
                  <Server className="h-3.5 w-3.5 text-[#555]" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-[#ddd]">{target.name}</div>
                    <div className="text-[10px] font-mono text-[#555]">{target.host}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && targets.length === 0 && (
            <div className="text-center py-4 text-[#555]">
              <Server className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
              <p className="text-[10px]">Configurá servidores en <code className="bg-white/5 px-1 rounded">deploy-targets.ts</code></p>
            </div>
          )}

          {/* Deploying state */}
          {deploying && (
            <div className="flex flex-col items-center py-6 gap-3">
              <Loader2 className="h-8 w-8 text-orange-400 animate-spin" />
              <p className="text-sm font-bold text-[#ccc]">Actualizando...</p>
              <p className="text-[10px] text-[#555]">git pull → build → restart · {selected.size} servidor{selected.size > 1 ? "es" : ""}</p>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="space-y-2">
              <label className="text-[10px] text-[#555] font-bold uppercase tracking-wider">Resultados</label>
              {results.map((result, i) => (
                <div key={i}>
                  <button
                    onClick={() => setExpandedOutput(expandedOutput === result.target ? null : result.target)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
                    style={{
                      background: result.status === "success" ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
                      border: `1px solid ${result.status === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}`,
                    }}
                  >
                    {result.status === "success" ? <CheckCircle className="h-4 w-4 text-green-400 shrink-0" /> : <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold" style={{ color: result.status === "success" ? "#86efac" : "#fca5a5" }}>{result.target}</div>
                      <div className="text-[10px] font-mono text-[#555]">{result.host}</div>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-[#555]">
                      <Clock className="h-3 w-3" />
                      {(result.durationMs / 1000).toFixed(1)}s
                    </div>
                  </button>
                  {expandedOutput === result.target && (
                    <div className="mt-1 mx-2 p-2.5 rounded-lg overflow-x-auto" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.05)", maxHeight: 200, overflowY: "auto" }}>
                      <pre className="text-[9px] font-mono text-[#888] whitespace-pre-wrap">{result.output}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 flex items-center gap-2">
          <div className="flex-1" />
          {results ? (
            <button onClick={() => { setResults(null); setExpandedOutput(null); }} className="px-4 py-2 rounded-xl text-[11px] font-bold text-[#888] hover:text-[#ccc] transition-all">
              Nuevo
            </button>
          ) : null}
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[11px] font-bold text-[#666] hover:text-[#aaa] transition-all">
            {results ? "Cerrar" : "Cancelar"}
          </button>
          {!results && !deploying && (
            <button
              onClick={handleDeploy}
              disabled={selected.size === 0}
              className="px-4 py-2 rounded-xl text-[11px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Rocket className="h-3.5 w-3.5" />
              {version?.updateAvailable ? `Actualizar (${version.commitsBehind})` : "Desplegar"} ({selected.size})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
