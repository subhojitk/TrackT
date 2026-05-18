import type { Metadata } from "next";
import { Urbanist } from "next/font/google";
import "./globals.css";

const urbanist = Urbanist({
  subsets: ["latin"],
  variable: "--font-urbanist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TrackT — MBTA",
  description: "Real-time MBTA departures & delay context for all lines",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${urbanist.variable} bg-zinc-950 text-zinc-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
