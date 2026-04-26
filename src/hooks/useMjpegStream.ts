"use client";

import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";

/**
 * useMjpegStream — live RTSP video on any browser (including Safari iOS).
 *
 * Strategy:
 * 1. Try fetch() + ReadableStream to parse MJPEG frames → canvas (Chrome, Firefox)
 * 2. If ReadableStream not available (Safari iOS), fallback to rapid snapshot
 *    polling via /api/camera/snapshot with double-buffer crossfade on <img>.
 *
 * The hook renders to EITHER a canvas OR an img pair — caller should render both
 * and use `mode` to know which is active.
 */

interface MjpegOptions {
  fps?: number;
  quality?: number;
  enabled?: boolean;
}

type StreamStatus = "connecting" | "streaming" | "error" | "stopped";
type StreamMode = "canvas" | "img";

export function useMjpegStream(
  rtspUrl: string | null,
  options: MjpegOptions = {},
) {
  const { fps = 4, quality = 8, enabled = true } = options;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<StreamStatus>("stopped");
  const [mode, setMode] = useState<StreamMode>("canvas");
  const [imgSrcA, setImgSrcA] = useState("");
  const [imgSrcB, setImgSrcB] = useState("");
  const [activeBuf, setActiveBuf] = useState<"a" | "b">("a");
  const abortRef = useRef<AbortController | null>(null);
  const frameCountRef = useRef(0);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!rtspUrl || !enabled) {
      if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
      setStatus("stopped");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("connecting");
    frameCountRef.current = 0;
    let running = true;

    // ── Try ReadableStream first (Chrome, Firefox, modern Edge) ──
    const tryStreamMode = async (): Promise<boolean> => {
      try {
        const streamUrl = apiUrl(
          `/api/camera/rtsp-stream?url=${encodeURIComponent(rtspUrl)}&fps=${fps}&quality=${quality}`
        );
        const res = await fetch(streamUrl, { signal: controller.signal });

        // Safari returns res.body === null for streaming responses
        if (!res.ok || !res.body) return false;

        let reader: ReadableStreamDefaultReader<Uint8Array>;
        try {
          reader = res.body.getReader();
        } catch {
          return false; // Safari may throw on getReader()
        }

        setMode("canvas");

        const SOI = [0xff, 0xd8];
        const EOI = [0xff, 0xd9];
        let buffer = new Uint8Array(0);

        const findMarker = (buf: Uint8Array, marker: number[], from: number): number => {
          for (let i = from; i < buf.length - 1; i++) {
            if (buf[i] === marker[0] && buf[i + 1] === marker[1]) return i;
          }
          return -1;
        };

        const drawFrame = (jpeg: Uint8Array) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ab = new ArrayBuffer(jpeg.byteLength);
          new Uint8Array(ab).set(jpeg);
          const blob = new Blob([ab], { type: "image/jpeg" });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            if (canvas.width !== img.width || canvas.height !== img.height) {
              canvas.width = img.width;
              canvas.height = img.height;
            }
            const ctx = canvas.getContext("2d");
            if (ctx) ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            frameCountRef.current++;
            if (frameCountRef.current === 1) setStatus("streaming");
          };
          img.onerror = () => URL.revokeObjectURL(url);
          img.src = url;
        };

        // Set a timeout: if no frame arrives within 8s, consider it failed
        let gotFirstFrame = false;
        const frameTimeout = setTimeout(() => {
          if (!gotFirstFrame && running) {
            reader.cancel().catch(() => {});
          }
        }, 8000);

        while (running) {
          const { done, value } = await reader.read();
          if (done) break;

          const newBuf = new Uint8Array(buffer.length + value.length);
          newBuf.set(buffer);
          newBuf.set(value, buffer.length);
          buffer = newBuf;

          let searchFrom = 0;
          while (true) {
            const soi = findMarker(buffer, SOI, searchFrom);
            if (soi === -1) break;
            const eoi = findMarker(buffer, EOI, soi + 2);
            if (eoi === -1) break;
            const frame = buffer.slice(soi, eoi + 2);
            drawFrame(frame);
            gotFirstFrame = true;
            searchFrom = eoi + 2;
          }
          if (searchFrom > 0) buffer = buffer.slice(searchFrom);
          if (buffer.length > 2 * 1024 * 1024) buffer = buffer.slice(buffer.length - 512 * 1024);
        }

        clearTimeout(frameTimeout);
        return true; // stream mode worked
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return true;
        return false;
      }
    };

    // ── Fallback: rapid snapshot polling (Safari iOS, any browser) ──
    const startSnapshotMode = () => {
      setMode("img");
      const ms = 3000; // 3s per snapshot (ffmpeg takes ~2-4s)
      let errCount = 0;

      const getUrl = () => apiUrl(
        `/api/camera/snapshot?url=${encodeURIComponent(rtspUrl)}&_t=${Date.now()}`
      );

      // Load first frame
      setImgSrcA(getUrl());
      setActiveBuf("a");

      const id = setInterval(() => {
        if (!running || loadingRef.current) return;
        loadingRef.current = true;
        const nextUrl = getUrl();
        const img = new Image();
        img.onload = () => {
          loadingRef.current = false;
          errCount = 0;
          setActiveBuf((p) => {
            if (p === "a") { setImgSrcB(nextUrl); return "b"; }
            else { setImgSrcA(nextUrl); return "a"; }
          });
          frameCountRef.current++;
          if (frameCountRef.current === 1) setStatus("streaming");
        };
        img.onerror = () => {
          loadingRef.current = false;
          errCount++;
          if (errCount >= 3) setStatus("error");
        };
        img.src = nextUrl;
      }, ms);

      return () => clearInterval(id);
    };

    // ── Launch: try stream, fallback to snapshots ──
    let cleanupSnapshot: (() => void) | null = null;

    (async () => {
      const streamWorked = await tryStreamMode();
      if (!streamWorked && running) {
        cleanupSnapshot = startSnapshotMode();
      }
    })();

    return () => {
      running = false;
      controller.abort();
      abortRef.current = null;
      if (cleanupSnapshot) cleanupSnapshot();
    };
  }, [rtspUrl, fps, quality, enabled]);

  return { canvasRef, status, mode, imgSrcA, imgSrcB, activeBuf };
}
