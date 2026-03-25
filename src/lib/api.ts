// basePath from next.config.ts — empty in dev, "/maps" in production
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function apiUrl(path: string): string {
  return `${BASE_PATH}${path}`;
}
