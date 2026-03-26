import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KumaMap - Network Map",
  description: "Interactive network map with Uptime Kuma integration",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='14' fill='%233b82f6'/><circle cx='16' cy='16' r='6' fill='%230a0a0a'/><circle cx='16' cy='16' r='3' fill='%2360a5fa'/></svg>",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
