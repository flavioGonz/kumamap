"use client";

import React, { useState, useEffect } from "react";
import { APP_VERSION, CHANGELOG, getNewEntries, hasNewChanges, markChangelogSeen, type ChangelogEntry } from "@/lib/changelog";

// ── Changelog Badge (shows "NEW" dot when there are unseen changes) ──
export function ChangelogBadge({ onClick }: { onClick: () => void }) {
  const [isNew, setIsNew] = useState(false);
  useEffect(() => { setIsNew(hasNewChanges()); }, []);

  return (
    <button onClick={onClick}
      className="relative flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[11px] font-mono transition-all hover:bg-white/[0.06]"
      style={{ color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.04)" }}
      title="Changelog">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <line x1="10" y1="9" x2="8" y2="9"/>
      </svg>
      v{APP_VERSION}
      {isNew && (
        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
          style={{ background: "#3b82f6", boxShadow: "0 0 6px rgba(59,130,246,0.6)", animation: "noc-pulse 2s ease-in-out infinite" }} />
      )}
    </button>
  );
}

// ── Inline banner for login screen ──
export function ChangelogBanner() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  useEffect(() => {
    const newE = getNewEntries();
    if (newE.length > 0) setEntries(newE);
    else if (CHANGELOG.length > 0) setEntries([CHANGELOG[0]]);
  }, []);

  if (entries.length === 0) return null;
  const latest = entries[0];

  return (
    <div className="mt-6 w-full max-w-sm mx-auto rounded-xl overflow-hidden"
      style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.1)" }}>
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-white/[0.04]">
        <div className="h-5 w-5 rounded flex items-center justify-center" style={{ background: "rgba(59,130,246,0.15)" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
          </svg>
        </div>
        <span className="text-[11px] font-bold text-blue-400/80">Novedades v{latest.version}</span>
        <span className="text-[9px] text-white/20 font-mono ml-auto">{latest.date}</span>
      </div>
      <div className="px-4 py-2.5">
        <p className="text-[11px] font-semibold text-white/50 mb-1.5">{latest.title}</p>
        <div className="space-y-0.5">
          {latest.items.slice(0, 4).map((item, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-[8px] text-blue-400/50 mt-[3px] shrink-0">●</span>
              <span className="text-[10px] text-white/35 leading-relaxed">{item}</span>
            </div>
          ))}
          {latest.items.length > 4 && (
            <span className="text-[9px] text-white/20 ml-3">+{latest.items.length - 4} más</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Full changelog modal ──
export function ChangelogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (open) markChangelogSeen();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg max-h-[80vh] rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "linear-gradient(180deg, #1a1a2e 0%, #111118 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.2))", border: "1px solid rgba(59,130,246,0.15)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-white/90">Changelog</h2>
              <p className="text-[10px] text-white/30">KumaMap v{APP_VERSION}</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/30 hover:text-white/70 transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
          {CHANGELOG.map((entry, entryIdx) => (
            <div key={entry.version} className="mb-6 last:mb-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[12px] font-bold text-white/80">v{entry.version}</span>
                <span className="text-[9px] font-mono text-white/25">{entry.date}</span>
                {entryIdx === 0 && (
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)" }}>
                    ÚLTIMO
                  </span>
                )}
              </div>
              <p className="text-[11px] font-semibold text-white/50 mb-2">{entry.title}</p>
              <div className="space-y-1 pl-1">
                {entry.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-[8px] mt-[4px] shrink-0" style={{ color: entryIdx === 0 ? "rgba(96,165,250,0.5)" : "rgba(255,255,255,0.15)" }}>●</span>
                    <span className="text-[10px] leading-relaxed" style={{ color: entryIdx === 0 ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.25)" }}>{item}</span>
                  </div>
                ))}
              </div>
              {entryIdx < CHANGELOG.length - 1 && <div className="mt-4 border-t border-white/[0.04]" />}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-3 border-t border-white/[0.06] flex justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-[11px] font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)" }}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
