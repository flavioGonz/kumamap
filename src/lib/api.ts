// basePath from next.config.ts
const BASE_PATH = "/maps";

export function apiUrl(path: string): string {
  return `${BASE_PATH}${path}`;
}
