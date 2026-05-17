import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrackT — MBTA Green Line",
  description: "Real-time MBTA Green Line departures with delay context",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
