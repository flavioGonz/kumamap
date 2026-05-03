/**
 * Ollama Client — Local AI inference via Ollama REST API.
 *
 * Connects to a local Ollama instance for on-premise AI analysis.
 * No data leaves the local network.
 */

const OLLAMA_BASE = process.env.OLLAMA_URL || "http://192.168.99.253:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "gemma3:4b";

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaStreamChunk {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

/**
 * Send a chat request to Ollama and return the full response.
 */
export async function ollamaChat(
  messages: OllamaChatMessage[],
  opts?: { model?: string; temperature?: number }
): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts?.model || DEFAULT_MODEL,
      messages,
      stream: false,
      options: {
        temperature: opts?.temperature ?? 0.3,
        num_predict: 1024,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.message?.content || "";
}

/**
 * Send a chat request to Ollama and return a streaming ReadableStream.
 */
export function ollamaChatStream(
  messages: OllamaChatMessage[],
  opts?: { model?: string; temperature?: number }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: opts?.model || DEFAULT_MODEL,
            messages,
            stream: true,
            options: {
              temperature: opts?.temperature ?? 0.3,
              num_predict: 1024,
            },
          }),
        });

        if (!res.ok || !res.body) {
          const text = await res.text();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: text })}\n\n`));
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const chunk: OllamaStreamChunk = JSON.parse(line);
              const sseData = JSON.stringify({
                content: chunk.message?.content || "",
                done: chunk.done,
              });
              controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
            } catch {
              // skip malformed lines
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const chunk: OllamaStreamChunk = JSON.parse(buffer);
            const sseData = JSON.stringify({
              content: chunk.message?.content || "",
              done: chunk.done,
            });
            controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
          } catch {}
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`)
        );
        controller.close();
      }
    },
  });
}

/**
 * Check Ollama connectivity and list available models.
 */
export async function ollamaStatus(): Promise<{
  online: boolean;
  models: string[];
  url: string;
}> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { online: false, models: [], url: OLLAMA_BASE };

    const data = await res.json();
    const models = (data.models || []).map((m: any) => m.name);
    return { online: true, models, url: OLLAMA_BASE };
  } catch {
    return { online: false, models: [], url: OLLAMA_BASE };
  }
}
