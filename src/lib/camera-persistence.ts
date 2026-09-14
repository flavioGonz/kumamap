/**
 * Camera window persistence — saves/restores open camera windows per map.
 * Stores which cameras are open, their positions, and sizes in localStorage.
 */

import type { CameraWindowState } from "@/components/network-map/CameraStreamViewer";

const STORAGE_KEY = "kumamap_cameras";

interface PersistedCameraMap {
  [mapId: string]: CameraWindowState[];
}

/** Read all persisted camera windows for a given map */
export function loadCameraWindows(mapId: string): CameraWindowState[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: PersistedCameraMap = JSON.parse(raw);
    return data[mapId] || [];
  } catch {
    return [];
  }
}

/** Save the current set of open camera windows for a map */
export function saveCameraWindows(mapId: string, windows: CameraWindowState[]): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data: PersistedCameraMap = raw ? JSON.parse(raw) : {};
    if (windows.length === 0) {
      delete data[mapId];
    } else {
      data[mapId] = windows;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

/** Update a single camera window's position/size (upsert) */
export function updateCameraWindow(mapId: string, state: CameraWindowState): void {
  const windows = loadCameraWindows(mapId);
  const idx = windows.findIndex(w => w.nodeId === state.nodeId);
  if (idx >= 0) {
    windows[idx] = state;
  } else {
    windows.push(state);
  }
  saveCameraWindows(mapId, windows);
}

/** Remove a single camera window from persistence */
export function removeCameraWindow(mapId: string, nodeId: string): void {
  const windows = loadCameraWindows(mapId).filter(w => w.nodeId !== nodeId);
  saveCameraWindows(mapId, windows);
}
