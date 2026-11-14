// Builds the whole app as ONE self-contained HTML file (for hosting as a static page).
// Same source as the Next.js app; next/link and next/navigation are shimmed to hash routes.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r("."),
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: [
      { find: /^next\/link$/, replacement: r("./shims/link.tsx") },
      { find: /^next\/navigation$/, replacement: r("./shims/navigation.ts") },
      { find: /^@\//, replacement: r("../src/") },
    ],
  },
  define: {
    "process.env.NEXT_PUBLIC_STATIC": JSON.stringify("1"),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: { outDir: r("../dist-static"), emptyOutDir: true, chunkSizeWarningLimit: 4000 },
});
