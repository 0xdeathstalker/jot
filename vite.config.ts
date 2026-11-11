import path from "path"

import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    tailwindcss(),
    // Production builds only: the plugin is off in `pnpm dev`. Test with `pnpm build && pnpm preview`.
    VitePWA({
      registerType: "autoUpdate",
      // Icons come from `pnpm pwa:icons` (public/). The theme and background colours are white
      // because the app has no dark mode yet.
      manifest: {
        id: "/",
        name: "Jot",
        short_name: "Jot",
        description: "Fast notes that sync across your devices and work offline.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Never answer these from the cached app shell: the Google callback is a browser
        // navigation, and rooms/auth must always reach the Worker.
        navigateFallbackDenylist: [/^\/api\//, /^\/parties\//],
        cleanupOutdatedCaches: true,
        // Default is js, css and html only: add the self-hosted fonts, icons and manifest so the
        // installed app looks right with no network. Keep every file under 2 MiB (Workbox skips
        // bigger ones silently, which would break offline start).
        globPatterns: ["**/*.{js,css,html,woff2,svg,png,ico,webmanifest}"],
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
})
