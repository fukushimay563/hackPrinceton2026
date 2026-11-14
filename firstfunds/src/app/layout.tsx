import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FirstFunds — your first paycheck, card & tax return, explained",
  description:
    "An AI-powered financial journey for young adults: see where your paycheck goes, how credit card interest really works, and estimate your first tax return.",
};

export const viewport: Viewport = { themeColor: "#f4f6f2" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
