/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Tauri expects a fixed dev-server port (set in app-tauri/tauri.conf.json's
// build.devUrl) and needs its own env vars ignored so Vite doesn't try to
// read unrelated host env as client-exposed vars.
//
// `defineConfig` comes from `vitest/config` rather than plain `vite` so this
// one file can carry both `vite build`'s config and `vitest`'s `test` block
// — same Svelte plugin instance either way, so a `.svelte.ts` module (runes
// outside a component) compiles identically under test and under build.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  test: {
    environment: "node",
  },
});
