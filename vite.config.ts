import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split Mapbox GL (~1.2MB minified) into its own chunk. It's imported
        // only by lazy map-view chunks, but Rollup's default chunking hoists
        // that shared dependency up into the eager entry chunk — so every
        // visitor, including someone who only ever sees the (map-less) Home
        // page, was downloading the entire GL engine at first paint. Nothing
        // in Home's eager import graph references Mapbox, so giving it a named
        // chunk pulls it off the critical path: it now loads on-demand when a
        // map view mounts and is cached across all of them.
        manualChunks(id) {
          // Rollup's virtual CommonJS interop helper (\x00commonjsHelpers.js)
          // is shared by CJS deps in EVERY chunk. Left unassigned, Rollup
          // co-locates it inside the mapbox chunk — and the entry then
          // statically imports the helper from there, modulepreloading the
          // whole 1.7 MB GL engine for a three-line function. Pin it to its
          // own micro-chunk so nothing drags the whale.
          if (id.startsWith('\0commonjsHelpers')) return 'cjs-helpers'
          // Same class of bug as commonjsHelpers above, different helper:
          // Vite's own dynamic-import preload-helper runtime (needed by
          // EVERY lazy chunk's import() call site, not just Cesium's) is
          // unassigned by the rules below, so Rollup co-locates it with
          // whichever named chunk happens to be its sole non-entry consumer.
          // Left unassigned, that was the 'cesium' chunk — which then earned
          // an eager <link rel="modulepreload"> in index.html, defeating the
          // whole point of splitting it out. Pin it to its own micro-chunk.
          if (id === '\0vite/preload-helper.js') return 'preload-helper'
          if (!id.includes('node_modules')) return
          if (id.includes('mapbox-gl') || id.includes('@mapbox')) return 'mapbox'
          // Cesium (~3 MB) is imported only by the lazy photoreal chunk of
          // The Last 48; give it a named chunk so Rollup never hoists it into
          // the entry. scripts/check-entry-bundle.mjs enforces this at build.
          if (id.includes('/cesium/')) return 'cesium'
        },
      },
    },
  },
})
