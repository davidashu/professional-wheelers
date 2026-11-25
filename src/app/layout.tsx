import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Manrope({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-display-face", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Vehicle Shipping Quotes", template: "%s · Auto Transport" },
  description: "Request a vehicle shipping quote. Our team reviews every request and sends a firm price.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
