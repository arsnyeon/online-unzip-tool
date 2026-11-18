import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFile } from 'node:fs/promises'

// Keep the same-origin archive worker at a stable URL on static hosts.
const staticFiles = [ 'js/libarchive-worker-shim.js', 'logo.png', 'favicon.ico', 'CNAME', 'robots.txt', 'sitemap.xml', 'LICENSE']

// Bake the star count at build time so the badge survives networks that block
// the GitHub API. The page still refreshes it at runtime when the API is reachable.
async function buildStars() {
  try {
    const res = await fetch('https://api.github.com/repos/arsnyeon/online-unzip-tool', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'yasuo-zip-build' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const count = (await res.json()).stargazers_count
    return typeof count === 'number' ? count : null
  } catch {
    return null
  }
}

export default async () => {
  const override = Number.parseInt(process.env.YASUO_STARS ?? '', 10)
  const stars = Number.isFinite(override) ? override : await buildStars()
  return defineConfig({
    base: './',
    define: { __BUILD_STARS__: JSON.stringify(stars) },
    plugins: [vue(), {
      name: 'standalone-tool',
      async generateBundle() {
        for (const fileName of staticFiles) {
          this.emitFile({ type: 'asset', fileName, source: await readFile(new URL(fileName, import.meta.url)) })
        }
      },
    }],
  })
}
