import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

// The portal SPA is served from /portal/ and answers /admin/* and /access/* via _redirects.
export default defineConfig({
  root,
  base: "/portal/",
  envDir: fileURLToPath(new URL("..", import.meta.url)),
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL("../_site/portal", import.meta.url)), emptyOutDir: true },
  server: { proxy: { "/api": "http://127.0.0.1:8788", "/p/": "http://127.0.0.1:8788" } },
});
