import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFile } from 'node:fs/promises'

// Keep the same-origin archive worker at a stable URL on static hosts.
const staticFiles = [ 'js/libarchive-worker-shim.js', 'logo.png', 'favicon.ico', 'CNAME', 'robots.txt', 'sitemap.xml', 'LICENSE']
export default defineConfig({
  base: './',
  plugins: [vue(), {
    name: 'standalone-tool',
    async generateBundle() {
      for (const fileName of staticFiles) {
        this.emitFile({ type: 'asset', fileName, source: await readFile(new URL(fileName, import.meta.url)) })
      }
    },
  }],
})
