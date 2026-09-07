import type { Metadata, Viewport } from "next";
import { Urbanist, JetBrains_Mono } from "next/font/google";
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
    default: "TrackT — Live MBTA departures",
    template: "%s — TrackT",
  },
  description: "Real-time MBTA departures, delays, service alerts and crowd forecasts for every line.",
  manifest: "/manifest.json",
  applicationName: "TrackT",
  appleWebApp: { capable: true, title: "TrackT", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0c",
  colorScheme: "dark",
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
      <body className="min-h-dvh bg-app text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
