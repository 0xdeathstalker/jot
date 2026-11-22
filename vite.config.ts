import path from "path"

import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

// https://vite.dev/config/
// The Vite root stays the repo root (index.html lives here): the Cloudflare plugin writes the deploy
// redirect (.wrangler/deploy/config.json) and local state into the root, where wrangler looks for
// them. The app's own files are in app/ (docs/plans/repo-layout.md).
export default defineConfig({
  publicDir: "app/public",
  plugins: [
    react(),
    cloudflare(),
    tailwindcss(),
    // Production builds only: the plugin is off in `pnpm dev`. Test with `pnpm build && pnpm preview`.
    VitePWA({
      registerType: "autoUpdate",
      // Icons come from `pnpm pwa:icons` (app/public/). The manifest takes one colour: the light
      // theme's cream (splash and first paint). The theme-color meta tag follows dark mode.
      manifest: {
        id: "/",
        name: "Jot",
        short_name: "Jot",
        description: "Fast notes that sync across your devices and work offline.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#F3EEE3",
        background_color: "#F3EEE3",
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
        // navigation, and rooms/auth must always reach the Worker. /privacy and /terms are real
        // static pages (app/public/), linked from Google's consent screen.
        navigateFallbackDenylist: [/^\/api\//, /^\/parties\//, /^\/privacy/, /^\/terms/],
        cleanupOutdatedCaches: true,
        // Default is js, css and html only: add the self-hosted fonts, icons and manifest so the
        // installed app looks right with no network. Keep every file under 2 MiB (Workbox skips
        // bigger ones silently, which would break offline start).
        globPatterns: ["**/*.{js,css,html,woff2,svg,png,ico,webmanifest}"],
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./app/src") },
  },
})
