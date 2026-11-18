<p align="center">
  <b>简体中文</b>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero-dark.svg">
    <img src="docs/assets/hero-light.svg" alt="yasuo.zip：把压缩包摊开，把文件收好" width="100%">
  </picture>
</p>

<p align="center">
  一个纯前端、本地优先的在线解压缩工具：解压、压缩、压图片，一个页面搞定。<br>文件永不离开浏览器。
</p>

<p align="center">
  <a href="https://github.com/arsnyeon/online-unzip-tool"><img alt="许可证 MIT" src="https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF%E8%AF%81-MIT-5B8DEF?style=flat-square&labelColor=2B3245"></a>
  <a href="https://yasuo.zip/"><img alt="在线体验" src="https://img.shields.io/badge/%E5%9C%A8%E7%BA%BF%E4%BD%93%E9%AA%8C-yasuo.zip-5B8DEF?style=flat-square&labelColor=2B3245"></a>
  <a href="https://github.com/arsnyeon/online-unzip-tool/issues"><img alt="问题反馈" src="https://img.shields.io/badge/Issues-%E5%8F%8D%E9%A6%88-5B8DEF?style=flat-square&labelColor=2B3245"></a>
  <a href="https://github.com/arsnyeon/online-unzip-tool/stargazers"><img alt="GitHub Star 数" src="https://img.shields.io/github/stars/arsnyeon/online-unzip-tool?style=flat-square&logo=github&label=Star&color=5B8DEF&labelColor=2B3245"></a>
</p>

<br>

<h3 align="center">一个页面，三种模式</h3>

<p align="center">
  <img src="docs/assets/features.svg" width="100%" alt="三种模式：解压、压缩、图片压缩">
</p>

<br>

<h3 align="center">解压：常见格式走快通道，冷门格式按需加载引擎</h3>

<p align="center">
  ZIP 用 JSZip、GZ 用 pako、TAR 自研解析，打开即用；RAR / 7Z / BZ2 / XZ / 加密压缩包由 WASM 引擎按需加载，不拖慢首屏。
</p>

<p align="center">
  <code>ZIP</code> <code>RAR4/RAR5</code> <code>7Z</code> <code>GZ</code> <code>TAR</code> <code>BZ2</code> <code>XZ</code> <code>tar.gz / tar.bz2 / tar.xz</code>
</p>

<br>

<h3 align="center">本地处理，不是口号</h3>

<p align="center">
  所有解压、压缩与图片处理都在你的浏览器里完成。没有上传接口，没有文件中转。文件名用 DOM API 渲染，避免恶意文件名注入。
</p>

<br>

<h3 align="center">看起来也舒服</h3>

<p align="center">
  Gentle Mist Blue 视觉：雾蓝只用于品牌、焦点与高亮，正文保持中性灰。跟随系统深浅色，也可手动切换；桌面与手机都好用。
</p>

<br>

## 可以做什么

- **多格式解压**：ZIP / RAR / 7Z / GZ / TAR / BZ2 / XZ，RAR/7Z 加密包可输入密码解压。
- **文件压缩**：多个文件或整个文件夹打包为 ZIP，保留原有目录结构。
- **图片压缩**：JPEG / PNG / WebP，质量 10%–100% 可调，批量处理并显示压缩率。
- **结果浏览**：解压后列出文件路径与大小，支持单个下载或打包下载。
- **本地隐私**：文件不上传服务器；单文件上限 500MB。

## 快速开始

可以直接访问线上站点：[https://yasuo.zip/](https://yasuo.zip/)。

本地运行：

```bash
git clone https://github.com/arsnyeon/online-unzip-tool.git
cd online-unzip-tool
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

建议通过本地 Web 服务器访问；直接用 `file://` 打开时，浏览器可能阻止 WASM 多格式引擎从 CDN 加载。

部署：无需构建，把仓库静态文件上传到 GitHub Pages、Netlify、Vercel 等任意静态托管即可。仓库内 `CNAME` 已配置自定义域名 `yasuo.zip`。

## 技术栈

- HTML5 / CSS3 / JavaScript ES6+，零构建。
- JSZip 处理 ZIP；pako 处理 GZ；TAR 原生解析。
- libarchive.js（WASM，经 jsdelivr CDN 按需加载）处理 RAR / 7Z / BZ2 / XZ 和加密包。
- 通过同源 Worker shim 规避浏览器对跨域 `new Worker()` 的限制。

## 目录

| 路径 | 内容 |
| --- | --- |
| `index.html` | 主页面与工具界面 |
| `css/style.css` | 视觉系统与响应式样式 |
| `js/script.js` | 全部功能逻辑与 JSDoc 注释 |
| `js/libarchive-worker-shim.js` | 多格式引擎的同源 Worker 代理 |
| `docs/assets/` | README 使用的自制 SVG 示意图 |
| `favicon.ico`、`logo.png` | 站点图标 |
| `CNAME`、`robots.txt`、`sitemap.xml` | 站点部署与 SEO 配置 |
| `LICENSE` | MIT 许可证 |
| `DESIGN.md` | 界面设计契约 |
| `README.md` | 项目说明 |

## 常见问题

<details>
<summary><b>和 DeepSeek 官方有关系吗？</b></summary>
<br>
没有关系。这是 ArsnYeon 的个人开源项目，与 DeepSeek 无关。
</details>

<details>
<summary><b>文件会上传到服务器吗？</b></summary>
<br>
不会。所有处理在浏览器本地完成。页面会从 CDN 加载 JSZip、pako 和 libarchive.js 等代码库，但你的文件本身不会上传。
</details>

<details>
<summary><b>为什么 rar / 7z 第一次解压慢一点？</b></summary>
<br>
这些格式由 WASM 引擎处理，第一次使用时才从 CDN 下载引擎文件（约 1MB）。之后浏览器缓存会加快速度。
</details>

<details>
<summary><b>支持 RAR5 和加密包吗？</b></summary>
<br>
支持。解压模式下填写密码即可尝试解压加密的 RAR / 7Z 压缩包。密码只在本地传给解压引擎。
</details>

<details>
<summary><b>为什么单个文件限制 500MB？</b></summary>
<br>
浏览器端解压需要在内存中处理文件，500MB 是兼顾可用性和稳定性的限制。更大的文件建议使用桌面软件。
</details>

<details>
<summary><b>开源吗？</b></summary>
<br>
开源，代码以 MIT 许可证发布，详见 <a href="LICENSE">LICENSE</a>。
</details>

## 参与贡献

问题反馈与改进建议欢迎提交到 [Issues](https://github.com/arsnyeon/online-unzip-tool/issues)，也欢迎 Pull Request。

## 许可证与致谢

本项目采用 [MIT 许可证](LICENSE)。

第三方库：

- [JSZip](https://github.com/Stuk/jszip) — ZIP 处理
- [pako](https://github.com/nodeca/pako) — GZIP 处理
- [libarchive.js](https://github.com/nika-begiashvili/libarchivejs) — 多格式 WASM 解压引擎

<p align="center"><sub>yasuo.zip 是个人开源项目，与文中提到的其他项目无关联。</sub></p>
