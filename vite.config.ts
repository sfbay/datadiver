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
          if (!id.includes('node_modules')) return
          if (id.includes('mapbox-gl') || id.includes('@mapbox')) return 'mapbox'
        },
      },
    },
  },
})
