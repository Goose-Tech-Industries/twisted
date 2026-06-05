import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    proxy: {
      // Proxy REST + auth + socket to Phoenix backend during dev
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket': { target: 'ws://localhost:4000', ws: true, changeOrigin: true }
    }
  },
  // Workers need ES module format because Pixi v8 ships dynamic imports
  // (PixiJS code-splits its renderer/text/filters internally). The
  // default IIFE format would refuse to bundle a code-splitting graph.
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    include: ['phoenix', 'pixi.js', 'three']
  },
  ssr: {
    noExternal: ['@twisted/render']
  }
})
