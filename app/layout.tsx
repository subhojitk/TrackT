import type { Metadata, Viewport } from "next";
import { Urbanist, JetBrains_Mono } from "next/font/google";
import MapStage from "@/components/MapStage";
import Hud from "@/components/Hud";
import "./globals.css";

const urbanist = Urbanist({
  subsets: ["latin"],
  variable: "--font-urbanist",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "TrackT — Live MBTA map",
    template: "%s — TrackT",
  },
  description: "A live 3D map of the MBTA: moving trains, real-time departures, delays, service alerts and crowd forecasts.",
  manifest: "/manifest.json",
  applicationName: "TrackT",
  appleWebApp: { capable: true, title: "TrackT", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#7cc7ff",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${urbanist.variable} ${mono.variable}`}>
      <body className="h-dvh bg-app text-ink antialiased">
        {/* Persistent fullscreen map; pages float windows over it */}
        <MapStage />
        <Hud />
        {children}
      </body>
    </html>
  );
}
