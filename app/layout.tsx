import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Smart KKQ", applicationName: "Smart KKQ", description: "PWA mudah alih untuk kehadiran, tugasan, hafazan, PBD dan profil digital murid KKQ.", manifest: "/manifest.json", appleWebApp: { capable: true, statusBarStyle: "default", title: "Smart KKQ" }, formatDetection: { telephone: false }, icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] } };
export const viewport: Viewport = { themeColor: "#163c35", width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ms"><body className="antialiased">{children}</body></html>; }
