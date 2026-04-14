import { z } from "zod";

// POST /api/maps
export const createMapSchema = z.object({
  name: z.string().min(1, "Name is required"),
  background_type: z.enum(["grid", "image", "livemap"]).optional(),
  kuma_group_id: z.union([z.number(), z.null()]).optional(),
  parent_id: z.union([z.string(), z.null()]).optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

// PUT /api/maps/[id] — only allow fields that mapsDb.update() accepts
export const updateMapSchema = z
  .object({
    name: z.string().min(1).optional(),
    background_type: z.enum(["grid", "image", "livemap"]).optional(),
    background_image: z.union([z.string(), z.null()]).optional(),
    parent_id: z.union([z.string(), z.null()]).optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  })
  .strict();

// PUT /api/maps/[id]/state
export const saveMapStateSchema = z
  .object({
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
    view_state: z.any().optional(),
  })
  .passthrough();

// POST /api/maps/import
export const importMapSchema = z
  .object({
    _format: z.literal("kumamap-v1"),
    map: z.any().optional(),
    nodes: z.array(z.any()).optional(),
    edges: z.array(z.any()).optional(),
  })
  .passthrough();

// POST /api/kuma/monitors — create a new Uptime Kuma monitor
export const createMonitorSchema = z.object({
  name: z.string().min(1, "Monitor name is required"),
  type: z.enum(["http", "port", "ping", "keyword", "dns", "push", "steam", "mqtt", "sqlserver", "postgres", "mysql", "mongodb", "radius", "redis", "docker", "grpc", "gamedig", "group", "snmp", "json-query", "real-browser"]),
  url: z.string().optional(),
  hostname: z.string().optional(),
  port: z.number().int().min(0).max(65535).optional(),
  interval: z.number().int().min(20).max(86400).default(60),
  keyword: z.string().optional(),
  maxretries: z.number().int().min(0).max(100).default(1),
  parent: z.number().int().nullable().optional(),
  notificationIDList: z.record(z.string(), z.boolean()).optional(),
  description: z.string().optional(),
});

// POST /api/auth
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
