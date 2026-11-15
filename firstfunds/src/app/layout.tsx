import "@fontsource-variable/inter";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "FirstFunds — your finances, finally making sense",
  description:
    "An AI-powered financial and tax advisor for young adults: understand your paycheck, your credit card and your first tax return, with sources for every number.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0e0d" },
  ],
};

// Set the theme before first paint (saved choice, else the OS setting) to avoid a flash.
const THEME_SCRIPT = `try{var t=localStorage.getItem('ff-theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
