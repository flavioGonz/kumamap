import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const DB_PATH = path.join(process.cwd(), "data", "kumamap.db");

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS network_maps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    background_type TEXT DEFAULT 'grid',
    background_image TEXT,
    background_scale REAL DEFAULT 1.0,
    background_offset_x REAL DEFAULT 0,
    background_offset_y REAL DEFAULT 0,
    kuma_group_id INTEGER,
    width INTEGER DEFAULT 1920,
    height INTEGER DEFAULT 1080,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS network_map_nodes (
    id TEXT PRIMARY KEY,
    map_id TEXT NOT NULL,
    kuma_monitor_id INTEGER,
    label TEXT,
    x REAL NOT NULL,
    y REAL NOT NULL,
    width REAL DEFAULT 120,
    height REAL DEFAULT 80,
    icon TEXT DEFAULT 'server',
    color TEXT,
    custom_data TEXT,
    FOREIGN KEY (map_id) REFERENCES network_maps(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS network_map_edges (
    id TEXT PRIMARY KEY,
    map_id TEXT NOT NULL,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    label TEXT,
    style TEXT DEFAULT 'solid',
    color TEXT DEFAULT '#6b7280',
    animated INTEGER DEFAULT 0,
    custom_data TEXT,
    FOREIGN KEY (map_id) REFERENCES network_maps(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_nodes_map ON network_map_nodes(map_id);
  CREATE INDEX IF NOT EXISTS idx_edges_map ON network_map_edges(map_id);
`);

// Migrations
try { db.exec(`ALTER TABLE network_maps ADD COLUMN view_state TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE network_maps ADD COLUMN parent_id TEXT REFERENCES network_maps(id) ON DELETE SET NULL`); } catch { /* already exists */ }

function genId() {
  return crypto.randomUUID();
}

export interface NetworkMap {
  id: string;
  name: string;
  background_type: "grid" | "image" | "livemap";
  background_image: string | null;
  background_scale: number;
  background_offset_x: number;
  background_offset_y: number;
  kuma_group_id: number | null;
  parent_id: string | null;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
}

export interface MapNode {
  id: string;
  map_id: string;
  kuma_monitor_id: number | null;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  icon: string;
  color: string | null;
  custom_data: string | null;
}

export interface MapEdge {
  id: string;
  map_id: string;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  style: string;
  color: string;
  animated: number;
}

export const mapsDb = {
  getAll(): NetworkMap[] {
    return db
      .prepare("SELECT * FROM network_maps ORDER BY updated_at DESC")
      .all() as NetworkMap[];
  },

  getById(id: string): NetworkMap | undefined {
    return db
      .prepare("SELECT * FROM network_maps WHERE id = ?")
      .get(id) as NetworkMap | undefined;
  },

  create(data: {
    name: string;
    background_type?: string;
    kuma_group_id?: number | null;
    parent_id?: string | null;
    width?: number;
    height?: number;
  }): NetworkMap {
    const id = genId();
    db.prepare(
      `INSERT INTO network_maps (id, name, background_type, kuma_group_id, parent_id, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      data.name,
      data.background_type || "livemap",
      data.kuma_group_id ?? null,
      data.parent_id ?? null,
      data.width || 1920,
      data.height || 1080
    );
    return this.getById(id)!;
  },

  getChildren(parentId: string): NetworkMap[] {
    return db
      .prepare("SELECT * FROM network_maps WHERE parent_id = ? ORDER BY name ASC")
      .all(parentId) as NetworkMap[];
  },

  getRoots(): NetworkMap[] {
    return db
      .prepare("SELECT * FROM network_maps WHERE parent_id IS NULL ORDER BY updated_at DESC")
      .all() as NetworkMap[];
  },

  update(
    id: string,
    data: Partial<
      Pick<
        NetworkMap,
        "name" | "background_type" | "background_image" | "width" | "height" | "parent_id"
      >
    >
  ): NetworkMap | undefined {
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    }
    if (fields.length === 0) return this.getById(id);
    fields.push(`updated_at = datetime('now')`);
    values.push(id);
    db.prepare(
      `UPDATE network_maps SET ${fields.join(", ")} WHERE id = ?`
    ).run(...values);
    return this.getById(id);
  },

  delete(id: string): boolean {
    return db.prepare("DELETE FROM network_maps WHERE id = ?").run(id).changes > 0;
  },

  getNodes(mapId: string): MapNode[] {
    return db
      .prepare("SELECT * FROM network_map_nodes WHERE map_id = ?")
      .all(mapId) as MapNode[];
  },

  getEdges(mapId: string): MapEdge[] {
    return db
      .prepare("SELECT * FROM network_map_edges WHERE map_id = ?")
      .all(mapId) as MapEdge[];
  },

  saveState(
    mapId: string,
    nodes: Array<Omit<MapNode, "map_id">>,
    edges: Array<Omit<MapEdge, "map_id">>
  ) {
    const tx = db.transaction(() => {
      // Remove old
      db.prepare("DELETE FROM network_map_edges WHERE map_id = ?").run(mapId);
      db.prepare("DELETE FROM network_map_nodes WHERE map_id = ?").run(mapId);

      // Insert new nodes
      const insertNode = db.prepare(
        `INSERT INTO network_map_nodes (id, map_id, kuma_monitor_id, label, x, y, width, height, icon, color, custom_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const n of nodes) {
        insertNode.run(
          n.id,
          mapId,
          n.kuma_monitor_id ?? null,
          n.label ?? null,
          n.x,
          n.y,
          n.width || 120,
          n.height || 80,
          n.icon || "server",
          n.color ?? null,
          n.custom_data ?? null
        );
      }

      // Insert new edges
      const insertEdge = db.prepare(
        `INSERT INTO network_map_edges (id, map_id, source_node_id, target_node_id, label, style, color, animated, custom_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const e of edges) {
        insertEdge.run(
          e.id,
          mapId,
          e.source_node_id,
          e.target_node_id,
          e.label ?? null,
          e.style || "solid",
          e.color || "#6b7280",
          e.animated || 0,
          (e as any).custom_data ?? null
        );
      }

      db.prepare(
        `UPDATE network_maps SET updated_at = datetime('now') WHERE id = ?`
      ).run(mapId);
    });
    tx();
  },

  setBackground(id: string, filename: string) {
    db.prepare(
      `UPDATE network_maps SET background_type = 'image', background_image = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(filename, id);
  },
};

export default db;
