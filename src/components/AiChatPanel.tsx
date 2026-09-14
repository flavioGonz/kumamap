"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { apiUrl } from "@/lib/api";
import {
  X,
  Send,
  Brain,
  Loader2,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Zap,
  MessageSquare,
} from "lucide-react";

const palette = {
  bg: "#0a0a14",
  card: "#0f1020",
  border: "rgba(255,255,255,0.06)",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  gold: "#f59e0b",
  green: "#22c55e",
  red: "#ef4444",
  blue: "#3b82f6",
  purple: "#a855f7",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AiChatPanelProps {
  mapId: string;
  module: "bitacora" | "lpr" | "general";
  onClose: () => void;
  visible: boolean;
}

const QUICK_PROMPTS: Record<string, { label: string; prompt: string }[]> = {
  bitacora: [
    { label: "📊 Resumen del día", prompt: "Dame un resumen de seguridad del día de hoy" },
    { label: "⚠️ Anomalías", prompt: "¿Hay alguna anomalía o situación sospechosa en los visitantes de hoy?" },
    { label: "👥 En sitio", prompt: "¿Quiénes están en sitio ahora y cuánto tiempo llevan?" },
    { label: "🏢 Empresas", prompt: "¿Cuáles son las empresas que más nos visitan?" },
  ],
  lpr: [
    { label: "📊 Resumen vehicular", prompt: "Dame un resumen de la actividad vehicular de hoy" },
    { label: "🚨 Merodeo", prompt: "¿Hay matrículas desconocidas con actividad sospechosa o merodeo?" },
    { label: "🚫 Bloqueados", prompt: "¿Hubo intentos de acceso de vehículos bloqueados?" },
    { label: "📈 Patrones", prompt: "¿Qué patrones de tráfico vehicular observas hoy?" },
  ],
  general: [
    { label: "📊 Resumen general", prompt: "Dame un resumen completo de seguridad del día" },
    { label: "⚠️ Alertas", prompt: "¿Hay alguna situación que requiera mi atención inmediata?" },
  ],
};

export default function AiChatPanel({ mapId, module, onClose, visible }: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [aiOnline, setAiOnline] = useState<boolean | null>(null);
  const [aiModel, setAiModel] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Check AI status
  useEffect(() => {
    if (!visible) return;
    fetch(apiUrl("/api/ai/chat"))
      .then((r) => r.json())
      .then((data) => {
        setAiOnline(data.online);
        if (data.models?.length > 0) setAiModel(data.models[0]);
      })
      .catch(() => setAiOnline(false));
  }, [visible]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (visible) setTimeout(() => inputRef.current?.focus(), 300);
  }, [visible]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;

      const userMsg: ChatMessage = { role: "user", content: text.trim(), timestamp: new Date() };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput("");
      setStreaming(true);

      // Add empty assistant message for streaming
      const assistantMsg: ChatMessage = { role: "assistant", content: "", timestamp: new Date() };
      setMessages([...updatedMessages, assistantMsg]);

      try {
        abortRef.current = new AbortController();

        const res = await fetch(apiUrl("/api/ai/chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mapId,
            module,
            messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok || !res.body) {
          setMessages((prev) => {
            const arr = [...prev];
            arr[arr.length - 1] = {
              ...arr[arr.length - 1],
              content: "⚠️ Error conectando con la IA. Verificá que Ollama esté corriendo.",
            };
            return arr;
          });
          setStreaming(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) {
                fullContent += `\n⚠️ ${data.error}`;
              } else if (data.content) {
                fullContent += data.content;
              }

              setMessages((prev) => {
                const arr = [...prev];
                arr[arr.length - 1] = { ...arr[arr.length - 1], content: fullContent };
                return arr;
              });
            } catch {}
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setMessages((prev) => {
            const arr = [...prev];
            arr[arr.length - 1] = {
              ...arr[arr.length - 1],
              content: "⚠️ Error de conexión con Ollama.",
            };
            return arr;
          });
        }
      }

      setStreaming(false);
    },
    [messages, streaming, mapId, module]
  );

  const quickPrompts = QUICK_PROMPTS[module] || QUICK_PROMPTS.general;

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center"
      style={{
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(12px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.3s",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{
          background: palette.bg,
          border: `1px solid ${palette.border}`,
          boxShadow: `0 0 80px rgba(0,0,0,0.6), 0 0 40px ${palette.purple}08`,
          maxHeight: "80vh",
          transform: visible ? "translateY(0)" : "translateY(30px)",
          transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-3.5 flex items-center gap-3 flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${palette.purple}12, ${palette.blue}08)`,
            borderBottom: `1px solid ${palette.border}`,
          }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${palette.purple}25, ${palette.blue}15)`,
              border: `1px solid ${palette.purple}30`,
            }}
          >
            <Brain className="w-4.5 h-4.5" style={{ color: palette.purple }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold" style={{ color: "#fff" }}>
              Inteligencia de Seguridad
            </h3>
            <div className="flex items-center gap-2 text-[10px]" style={{ color: palette.textDim }}>
              {aiOnline === null ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Conectando...</>
              ) : aiOnline ? (
                <><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> Ollama activo — {aiModel}</>
              ) : (
                <><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" /> Ollama desconectado</>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all hover:bg-white/5"
            style={{ color: palette.textMuted }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto px-4 py-4 space-y-3" style={{ minHeight: 200, maxHeight: "55vh" }}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${palette.purple}15, ${palette.blue}10)`,
                  border: `1px solid ${palette.purple}20`,
                }}
              >
                <Sparkles className="w-7 h-7" style={{ color: palette.purple }} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: palette.text }}>
                  Asistente de Seguridad AI
                </p>
                <p className="text-xs mt-1 max-w-xs" style={{ color: palette.textDim }}>
                  Preguntá sobre visitantes, matrículas, patrones de acceso o anomalías. La IA analiza tus datos en tiempo real.
                </p>
              </div>

              {/* Quick prompts */}
              <div className="grid grid-cols-2 gap-2 w-full max-w-md mt-2">
                {quickPrompts.map((qp) => (
                  <button
                    key={qp.label}
                    onClick={() => sendMessage(qp.prompt)}
                    disabled={!aiOnline || streaming}
                    className="px-3 py-2.5 rounded-xl text-left text-xs transition-all hover:scale-[1.02] disabled:opacity-40"
                    style={{
                      background: `rgba(255,255,255,0.03)`,
                      border: `1px solid ${palette.border}`,
                      color: palette.textMuted,
                    }}
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed"
                  style={
                    msg.role === "user"
                      ? {
                          background: `linear-gradient(135deg, ${palette.blue}30, ${palette.purple}20)`,
                          color: palette.text,
                          borderBottomRightRadius: 6,
                        }
                      : {
                          background: "rgba(255,255,255,0.04)",
                          border: `1px solid ${palette.border}`,
                          color: palette.text,
                          borderBottomLeftRadius: 6,
                        }
                  }
                >
                  {msg.role === "assistant" && streaming && i === messages.length - 1 && !msg.content ? (
                    <div className="flex items-center gap-2" style={{ color: palette.textDim }}>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="text-xs">Analizando datos...</span>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          className="px-4 py-3 flex-shrink-0 flex items-center gap-2"
          style={{ borderTop: `1px solid ${palette.border}`, background: "rgba(0,0,0,0.3)" }}
        >
          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                abortRef.current?.abort();
                setStreaming(false);
              }}
              className="p-2 rounded-lg transition-all hover:bg-white/5 flex-shrink-0"
              style={{ color: palette.textDim }}
              title="Nueva conversación"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder={aiOnline ? "Preguntá algo sobre los accesos..." : "Ollama no disponible"}
            disabled={!aiOnline || streaming}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm transition-all focus:outline-none disabled:opacity-40"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${palette.border}`,
              color: palette.text,
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || !aiOnline || streaming}
            className="p-2.5 rounded-xl transition-all hover:scale-105 disabled:opacity-30 flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${palette.purple}30, ${palette.blue}20)`,
              border: `1px solid ${palette.purple}30`,
              color: palette.purple,
            }}
          >
            {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
