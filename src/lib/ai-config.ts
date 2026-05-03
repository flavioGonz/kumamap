/**
 * AI Configuration — Persistent Ollama connection settings.
 *
 * Stores Ollama URL, models, and feature toggles in data/ai-config.json.
 * Used by ollama-client.ts to override env-based defaults.
 */

import fs from "fs";
import path from "path";

export interface AiConfig {
  enabled: boolean;
  ollamaUrl: string;        // e.g. "http://192.168.99.253:11434"
  textModel: string;        // e.g. "gemma3:4b"
  visionModel: string;      // e.g. "qwen3-vl:4b"
  autoVerifyLpr: boolean;   // Auto-run AI verification on LPR events
  chatEnabled: boolean;     // Show AI chat panels
  temperature: number;      // 0.0 - 1.0
}

const CONFIG_PATH = path.join(process.cwd(), "data", "ai-config.json");

const DEFAULTS: AiConfig = {
  enabled: true,
  ollamaUrl: process.env.OLLAMA_URL || "http://192.168.99.253:11434",
  textModel: process.env.OLLAMA_MODEL || "gemma3:4b",
  visionModel: process.env.OLLAMA_VISION_MODEL || "qwen3-vl:4b",
  autoVerifyLpr: true,
  chatEnabled: true,
  temperature: 0.3,
};

let cached: AiConfig | null = null;

export function getAiConfig(): AiConfig {
  if (cached) return cached;

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      cached = { ...DEFAULTS, ...JSON.parse(raw) };
      return cached!;
    }
  } catch (err) {
    console.error("[AiConfig] Error loading config:", err);
  }

  cached = { ...DEFAULTS };
  return cached;
}

export function saveAiConfig(config: Partial<AiConfig>): AiConfig {
  const current = getAiConfig();
  const updated = { ...current, ...config };

  try {
    const dir = path.dirname(CONFIG_PATH);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error("[AiConfig] Error saving config:", err);
  }

  cached = updated;
  return updated;
}

/** Invalidate cache (call after external changes) */
export function reloadAiConfig(): AiConfig {
  cached = null;
  return getAiConfig();
}
