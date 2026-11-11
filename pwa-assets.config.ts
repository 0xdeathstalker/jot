import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config"

// Generates every app icon from one source file: `pnpm pwa:icons`
// (see "Changing the logo later" in docs/plans/phase-5-pwa.md).
export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    ...minimal2023Preset,
    // The source is already a full-bleed square with its artwork inside the middle 80%, so no
    // extra padding. `background` only matters if the source ever has transparent areas.
    maskable: { sizes: [512], padding: 0, resizeOptions: { background: "#111111" } },
    apple: { sizes: [180], padding: 0, resizeOptions: { background: "#111111" } },
  },
  images: ["public/icon-source.svg"],
})
