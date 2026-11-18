import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFile } from 'node:fs/promises'

// Keep the same-origin archive worker at a stable URL on static hosts.
const staticFiles = [ 'js/libarchive-worker-shim.js', 'logo.png', 'favicon.ico', 'CNAME', 'robots.txt', 'sitemap.xml', 'LICENSE']

// Bake the star count at build time so the badge survives networks that block
// the GitHub API. The page still refreshes it at runtime when the API is reachable.
async function buildStars() {
  try {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'yasuo-zip-build' }
    // 在 CI 中带令牌，避免共享出口 IP 触发未认证请求的限流。
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
    const res = await fetch('https://api.github.com/repos/arsnyeon/online-unzip-tool', {
      headers,
      signal: AbortSignal.timeout(8000),
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
