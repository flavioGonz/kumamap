"use client";

import { useState } from "react";
import { Network } from "lucide-react";
import { apiUrl } from "@/lib/api";

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(apiUrl("/api/auth"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("kumamap_user", data.username);
        onLogin();
      } else {
        setError(data.error || "Credenciales invalidas");
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "radial-gradient(ellipse at center, #111 0%, #0a0a0a 100%)" }}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-8 space-y-6"
        style={{
          background: "rgba(14,14,14,0.95)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.12))",
              border: "1px solid rgba(59,130,246,0.3)",
              boxShadow: "0 0 30px rgba(59,130,246,0.15)",
            }}
          >
            <Network className="h-7 w-7 text-blue-400" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-black text-[#ededed] tracking-tight">KumaMap</h1>
            <p className="text-[11px] text-[#666] mt-0.5">Usa tus credenciales de Uptime Kuma</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#555]">Usuario</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
              className="w-full rounded-xl px-4 py-3 text-sm text-[#ededed] placeholder:text-[#444] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              placeholder="admin"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#555]">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl px-4 py-3 text-sm text-[#ededed] placeholder:text-[#444] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div
              className="rounded-xl px-4 py-2.5 text-xs font-medium"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-40"
            style={{
              background: "linear-gradient(135deg, rgba(59,130,246,0.25), rgba(99,102,241,0.2))",
              border: "1px solid rgba(59,130,246,0.35)",
              color: "#60a5fa",
              boxShadow: "0 4px 20px rgba(59,130,246,0.15)",
            }}
          >
            {loading ? "Conectando a Kuma..." : "Iniciar sesion"}
          </button>
        </form>
      </div>
    </div>
  );
}
