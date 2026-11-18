/**
 * libarchive.js 的同源 Worker 代理
 *
 * libarchive.js 的 worker-bundle 通过 `new Worker(workerUrl, { type: 'module' })` 加载，
 * 而浏览器禁止从第三方 CDN 直接创建 Worker（同源策略限制）。
 *
 * 解决方案：本站提供这个同源 shim 作为 workerUrl，再由它去 import CDN 上的
 * worker-bundle（ES Module 的跨域 import 在 CORS 允许下是合法的，jsdelivr 已验证）。
 * wasm 由 worker-bundle 依据 import.meta.url 从同一 CDN 自动加载。
 */

// 直接从 CDN 导入官方 worker 入口；其 Comlink 端点会在导入时自动注册
import 'https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/dist/worker-bundle.js';
