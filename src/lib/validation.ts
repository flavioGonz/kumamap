import { z } from "zod";

// POST /api/maps
export const createMapSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    background_type: z.string().optional(),
    kuma_group_id: z.union([z.number(), z.null()]).optional(),
    parent_id: z.union([z.string(), z.null()]).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .passthrough();

// PUT /api/maps/[id]
export const updateMapSchema = z.object({}).passthrough();

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

// POST /api/auth
export const loginSchema = z
  .object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
  })
  .passthrough();
