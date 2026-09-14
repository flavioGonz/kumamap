"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { apiUrl } from "./api";
import type { HikEvent } from "./types";

/**
 * Hook to subscribe to Hikvision camera events via SSE.
 * Returns live events for all nodes in the given map.
 */
export function useHikEvents(mapId: string | undefined) {
  const [events, setEvents] = useState<HikEvent[]>([]);
  const [latestEvent, setLatestEvent] = useState<HikEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    if (!mapId) return;

    const url = apiUrl(`/api/hik/events/stream?mapId=${encodeURIComponent(mapId)}`);
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        if (data.type === "connected") {
          setConnected(true);
          return;
        }

        if (data.type === "history") {
          // Initial batch of recent events
          setEvents(data.events || []);
          return;
        }

        // Regular event
        const event = data as HikEvent;
        if (event.id && event.nodeId) {
          setLatestEvent(event);
          setEvents((prev) => {
            const updated = [...prev, event];
            // Keep last 200
            if (updated.length > 200) return updated.slice(-200);
            return updated;
          });
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Reconnect after 3 seconds
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };
  }, [mapId]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connect]);

  // Get events for a specific node
  const getNodeEvents = useCallback(
    (nodeId: string): HikEvent[] => {
      return events.filter((e) => e.nodeId === nodeId);
    },
    [events]
  );

  // Clear latest (after popup is shown)
  const clearLatest = useCallback(() => setLatestEvent(null), []);

  return {
    events,
    latestEvent,
    connected,
    getNodeEvents,
    clearLatest,
  };
}
