import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrackT — MBTA Green Line",
  description: "Real-time MBTA Green Line departures with delay context",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100 flex flex-col">
        <header className="border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
          <span className="font-semibold text-sm tracking-wide text-zinc-100">
            TrackT
          </span>
          <span className="text-xs text-zinc-500">MBTA Green Line</span>
        </header>
        <main className="flex-1 px-4 py-6 max-w-3xl w-full mx-auto">{children}</main>
        <footer className="border-t border-zinc-800 px-4 py-3 text-xs text-zinc-600 text-center">
          Data from{" "}
          <a
            href="https://api.mbta.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-zinc-400"
          >
            MBTA V3 API
          </a>{" "}
          · Historical baselines from MBTA LAMP
        </footer>
      </body>
    </html>
  );
}
