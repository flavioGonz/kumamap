import type { Metadata, Viewport } from "next";
import BottomTabBar from "@/components/mobile/BottomTabBar";
import { MobileToastProvider } from "@/components/mobile/MobileToast";
import { ThemeProvider } from "@/components/mobile/ThemeProvider";

export const metadata: Metadata = {
  title: "KumaMap Mobile",
  description: "Monitor de red movil — estado de tus mapas y nodos",
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
    <ThemeProvider>
      <div
        className="min-h-screen"
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
              }
            `,
          }}
        />
        <MobileToastProvider>
          {children}
          <BottomTabBar />
        </MobileToastProvider>
      </div>
    </ThemeProvider>
  );
}
