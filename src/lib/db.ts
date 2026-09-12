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
try { db.exec(`ALTER TABLE network_maps ADD COLUMN background_blob BLOB`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE network_maps ADD COLUMN background_mime TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE network_maps ADD COLUMN scale_m_per_unit REAL`); } catch { /* already exists */ }

/** Cache en disco de las imagenes de fondo de los mapas (el blob en DB es la fuente de verdad). */
const MAP_UPLOADS_DIR = path.join(process.cwd(), "data", "uploads", "network-maps");

// Auto-migrate: import existing file-based backgrounds into DB blobs
(() => {
  const UPLOADS_DIR = MAP_UPLOADS_DIR;
  const mapsWithFiles = db.prepare(
    `SELECT id, background_image FROM network_maps WHERE background_type = 'image' AND background_image IS NOT NULL AND background_image != '' AND background_blob IS NULL`
  ).all() as { id: string; background_image: string }[];
  for (const m of mapsWithFiles) {
    const filePath = path.join(UPLOADS_DIR, path.basename(m.background_image));
    if (fs.existsSync(filePath)) {
      const ext = path.extname(m.background_image).toLowerCase();
      const mimeMap: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml" };
      const blob = fs.readFileSync(filePath);
      db.prepare(`UPDATE network_maps SET background_blob = ?, background_mime = ? WHERE id = ?`)
        .run(blob, mimeMap[ext] || "image/jpeg", m.id);
      console.log(`[DB] Migrated background image for map ${m.id} into DB blob (${blob.length} bytes)`);
    }
  }
})();

function genId() {
  return crypto.randomUUID();
}

export interface NetworkMap {
  id: string;
  name: string;
  background_type: "grid" | "image" | "livemap";
  background_image: string | null;
  background_blob: Buffer | null;
  background_mime: string | null;
  background_scale: number;
  background_offset_x: number;
  background_offset_y: number;
  /** Metros por unidad de mapa (CRS.Simple) para mapas image/grid; null = sin calibrar. */
  scale_m_per_unit: number | null;
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

// Columns to select in normal queries (excludes heavy background_blob)
const MAP_COLS = `id, name, background_type, background_image, background_mime, background_scale, background_offset_x, background_offset_y, scale_m_per_unit, kuma_group_id, parent_id, view_state, width, height, created_at, updated_at`;

export const mapsDb = {
  getAll(): NetworkMap[] {
    return db
      .prepare(`SELECT ${MAP_COLS} FROM network_maps ORDER BY updated_at DESC`)
      .all() as NetworkMap[];
  },

  getById(id: string): NetworkMap | undefined {
    return db
      .prepare(`SELECT ${MAP_COLS} FROM network_maps WHERE id = ?`)
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
      .prepare(`SELECT ${MAP_COLS} FROM network_maps WHERE parent_id = ? ORDER BY name ASC`)
      .all(parentId) as NetworkMap[];
  },

  getRoots(): NetworkMap[] {
    return db
      .prepare(`SELECT ${MAP_COLS} FROM network_maps WHERE parent_id IS NULL ORDER BY updated_at DESC`)
      .all() as NetworkMap[];
  },

  update(
    id: string,
    data: Partial<
      Pick<
        NetworkMap,
        | "name"
        | "background_type"
        | "background_image"
        | "background_mime"
        | "background_scale"
        | "background_offset_x"
        | "background_offset_y"
        | "width"
        | "height"
        | "parent_id"
        | "scale_m_per_unit"
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

  /**
   * Clona un mapa completo (fondo incluido) en un mapa nuevo.
   *
   * Copia TODAS las columnas de `network_maps` de forma dinámica — incluido
   * `background_blob` / `background_mime` / `background_scale` / offsets /
   * `scale_m_per_unit` / `view_state` — por lo que los mapas de tipo `image`
   * (foto/plano) conservan su imagen de fondo. Antes el clonado pasaba por
   * export→import, que sólo serializaba `background_type` y perdía la imagen:
   * el resultado era un mapa "en blanco".
   *
   * Los nodos y links se reinsertan con IDs nuevos, remapeando las referencias
   * dentro de `custom_data` / `view_state`.
   */
  cloneMap(
    sourceId: string,
    opts?: { name?: string; parentId?: string | null }
  ): NetworkMap | null {
    const src = db
      .prepare(`SELECT * FROM network_maps WHERE id = ?`)
      .get(sourceId) as Record<string, any> | undefined;
    if (!src) return null;

    const newId = genId();
    const newName = (opts?.name || "").trim() || `${src.name} (copia)`;
    const newParent =
      opts && Object.prototype.hasOwnProperty.call(opts, "parentId")
        ? opts.parentId ?? null
        : (src.parent_id ?? null);

    // Nombre de archivo propio para el fondo, para que borrar un mapa nunca
    // deje al otro sin imagen (el blob en DB es la fuente de verdad).
    let newBgImage: string | null = null;
    const srcBgImage: string | null = src.background_image ?? null;
    if (srcBgImage) {
      const ext = path.extname(String(srcBgImage)) || ".png";
      newBgImage = `bg-${Date.now()}-${crypto.randomBytes(3).toString("hex")}${ext}`;
    }

    // Columnas a copiar tal cual (todo menos identidad/nombre/padre/timestamps/fondo)
    const skip = new Set([
      "id",
      "name",
      "parent_id",
      "background_image",
      "created_at",
      "updated_at",
    ]);
    const passthrough = Object.keys(src).filter((c) => !skip.has(c) && c !== "view_state");

    // ── Nodos y links de origen ──
    const srcNodes = db
      .prepare(`SELECT * FROM network_map_nodes WHERE map_id = ?`)
      .all(sourceId) as Record<string, any>[];
    const srcEdges = db
      .prepare(`SELECT * FROM network_map_edges WHERE map_id = ?`)
      .all(sourceId) as Record<string, any>[];

    const nodeIdMap = new Map<string, string>();
    for (const n of srcNodes) {
      nodeIdMap.set(
        String(n.id),
        `node-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`
      );
    }
    const remapIds = (val: any): any => {
      if (typeof val !== "string" || !val.includes("node-")) return val;
      let out = val;
      for (const [oldId, nid] of nodeIdMap) out = out.split(oldId).join(nid);
      return out;
    };

    const tx = db.transaction(() => {
      const cols = ["id", "name", "parent_id", "background_image", "view_state", ...passthrough];
      const vals = [
        newId,
        newName,
        newParent,
        newBgImage,
        remapIds(src.view_state ?? null),
        ...passthrough.map((c) => src[c] ?? null),
      ];
      db.prepare(
        `INSERT INTO network_maps (${cols.join(", ")}) VALUES (${cols
          .map(() => "?")
          .join(", ")})`
      ).run(...vals);

      if (srcNodes.length) {
        const nodeCols = Object.keys(srcNodes[0]).filter(
          (c) => c !== "id" && c !== "map_id"
        );
        const insertNode = db.prepare(
          `INSERT INTO network_map_nodes (id, map_id, ${nodeCols.join(", ")})
           VALUES (?, ?, ${nodeCols.map(() => "?").join(", ")})`
        );
        for (const n of srcNodes) {
          insertNode.run(
            nodeIdMap.get(String(n.id))!,
            newId,
            ...nodeCols.map((c) => remapIds(n[c] ?? null))
          );
        }
      }

      if (srcEdges.length) {
        const edgeCols = Object.keys(srcEdges[0]).filter(
          (c) => c !== "id" && c !== "map_id"
        );
        const insertEdge = db.prepare(
          `INSERT INTO network_map_edges (id, map_id, ${edgeCols.join(", ")})
           VALUES (?, ?, ${edgeCols.map(() => "?").join(", ")})`
        );
        for (const e of srcEdges) {
          insertEdge.run(
            `edge-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
            newId,
            ...edgeCols.map((c) => {
              if (c === "source_node_id" || c === "target_node_id") {
                return nodeIdMap.get(String(e[c])) ?? e[c];
              }
              return remapIds(e[c] ?? null);
            })
          );
        }
      }
    });
    tx();

    // Cache en disco del fondo (best-effort; el blob en DB alcanza para servirlo)
    if (newBgImage && srcBgImage) {
      try {
        const dir = MAP_UPLOADS_DIR;
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const srcPath = path.join(dir, path.basename(String(srcBgImage)));
        const dstPath = path.join(dir, newBgImage);
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, dstPath);
        } else if (src.background_blob) {
          fs.writeFileSync(dstPath, src.background_blob as Buffer);
        }
      } catch {
        /* el fondo se sirve igual desde el blob en DB */
      }
    }

    return this.getById(newId) ?? null;
  },

  setBackground(id: string, filename: string, blob?: Buffer, mime?: string) {
    if (blob && mime) {
      db.prepare(
        `UPDATE network_maps SET background_type = 'image', background_image = ?, background_blob = ?, background_mime = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(filename, blob, mime, id);
    } else {
      db.prepare(
        `UPDATE network_maps SET background_type = 'image', background_image = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(filename, id);
    }
  },

  getBackgroundBlob(id: string): { blob: Buffer; mime: string } | null {
    const row = db.prepare(
      `SELECT background_blob, background_mime FROM network_maps WHERE id = ? AND background_blob IS NOT NULL`
    ).get(id) as { background_blob: Buffer; background_mime: string } | undefined;
    return row ? { blob: row.background_blob, mime: row.background_mime } : null;
  },
};

export default db;
