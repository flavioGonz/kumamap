import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  serverExternalPackages: ["better-sqlite3", "mysql2"],
  // Permite conexiones de desarrollo desde tu red local
  allowedDevOrigins: ["10.1.1.109", "192.168.1.100", "localhost"],
};

export default nextConfig;
