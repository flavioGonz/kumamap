import type { NextConfig } from "next";

// basePath is read at BUILD time from .env.local or environment
// Set NEXT_PUBLIC_BASE_PATH=/maps in .env.local for sub-path deployments
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  serverExternalPackages: ["better-sqlite3", "mysql2"],
  // Permite conexiones de desarrollo desde tu red local
  allowedDevOrigins: ["10.1.1.109", "192.168.1.100", "localhost"],

  // ── Security Headers ────────────────────────────────────────────────────────
  async headers() {
    return [
      {
        // Apply to all routes
        source: "/:path*",
        headers: [
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Prevent clickjacking — allow iframes only from same origin
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Control referrer information
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Prevent XSS attacks (legacy browsers)
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // Prevent DNS prefetching leaks
          { key: "X-DNS-Prefetch-Control", value: "off" },
          // Restrict browser features
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
          },
          // Content Security Policy — permissive enough for Leaflet tiles + SSE
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Scripts: self + inline (React needs it) + eval (Leaflet/html2canvas)
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // Styles: self + inline (Tailwind, dynamic styles)
              "style-src 'self' 'unsafe-inline'",
              // Images: self + tile servers + data URIs (base64 rack photos) + camera snapshots (any IP)
              "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://server.arcgisonline.com https://*.basemaps.cartocdn.com",
              // Fonts
              "font-src 'self' data:",
              // Connect: self + SSE + Uptime Kuma WS
              "connect-src 'self' ws: wss:",
              // Frame ancestors (same as X-Frame-Options but CSP v2)
              "frame-ancestors 'self'",
              // Base URI protection
              "base-uri 'self'",
              // Form submissions
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      {
        // API routes — add CORS headers
        source: "/api/:path*",
        headers: [
          // Only allow requests from same origin (no cross-origin API access)
          { key: "Access-Control-Allow-Origin", value: "" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          // Prevent API responses from being cached in shared caches
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
