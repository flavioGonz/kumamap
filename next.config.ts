import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/maps",
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
