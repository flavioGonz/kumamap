import type { Metadata, Viewport } from "next";
import BottomTabBar from "@/components/mobile/BottomTabBar";

export const metadata: Metadata = {
  title: "KumaMap Mobile",
  description: "Monitor de red móvil — estado de tus mapas y nodos",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KumaMap",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0a",
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      <script
        dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            }
          `,
        }}
      />
      {children}
      <BottomTabBar />
    </div>
  );
}
