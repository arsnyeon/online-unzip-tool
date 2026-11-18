<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import InlineWorkspace from './InlineWorkspace.vue'
import './home.css'

const modes = [
  { key: 'extract', name: '解压文件', icon: 'extract', title: '打开压缩包，按需取出文件', description: '按路径找出需要的文件，单独下载或全部保存。普通 .gz 解出一个文件；压缩过的 TAR 则展开目录。',
    formats: [['可解压', ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz']], ['压缩 TAR', ['.tar.gz / .tgz', '.tar.bz2 / .tbz2', '.tar.xz / .txz']]] },
  { key: 'compress', name: '打包 ZIP', icon: 'pack', title: '把零散文件收进一个 ZIP', description: '选择多个文件或整个文件夹，保留文件夹里的路径。打包只生成 ZIP，不生成 RAR、7Z 或 TAR。',
    formats: [['创建格式', ['.zip']]] },
  { key: 'image-compress', name: '压缩图片', icon: 'image', title: '为图片减轻体积', description: '处理后仍是原格式的图片。JPEG 和 WebP 可调质量；PNG 不使用质量参数。文件没有变小时保留原图。',
    formats: [['图片格式', ['.jpg / .jpeg', '.png', '.webp']]] }
]
const nav = [['#features','核心能力'],['#workspace','工作台'],['#guide','使用指南'],['#faq','常见问题']]
const icons = { extract:'M12 3v11m-4-4 4 4 4-4M4 15v5h16v-5', pack:'M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7m-9 4v10',image:'M3 4h18v16H3zM3 16l6-6 5 5 3-3 4 4M16 8h.01', arrow:'M4 12h16m-6-6 6 6-6 6',ext:'M6 18 18 6M7 6h11v11',moon:'M20 14a8.5 8.5 0 0 1-10-11 9 9 0 1 0 10 11z',sun:'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',menu:'M3 6h18M3 12h18M3 18h18',close:'m5 5 14 14M19 5 5 19',shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z',monitor:'M3 4h18v13H3zM8 21h8m-4-4v4',code:'m8 7-5 5 5 5m8-10 5 5-5 5m-3-12-2 14',file:'M5 3h9l5 5v13H5zM14 3v6h5',chevron:'m6 9 6 6 6-6' }
const alphabet = {A:[14,17,17,31,17,17,17],R:[30,17,17,30,20,18,17],C:[15,16,16,16,16,16,15],H:[17,17,17,31,17,17,17],I:[31,4,4,4,4,4,31],V:[17,17,17,17,17,10,4],E:[31,16,16,30,16,16,31],S:[15,16,16,14,1,1,30],T:[31,4,4,4,4,4,4],U:[17,17,17,17,17,17,14],D:[30,17,17,17,17,17,30],O:[14,17,17,17,17,17,14]}
const pixels = (word) => [...word].flatMap((c,k) => alphabet[c].flatMap((row,y) => [0,1,2,3,4].map(x => row & (16 >> x) ? `M${k*6+x} ${y}h1v1h-1z` : ''))).join('')
const dark = ref(false), menu = ref(false), scrolled = ref(false), workspace = ref(null), stars = ref(null)
const STAR_KEY = 'yasuo-stars'
const starText = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n)
// Star 数量只用于展示：缓存六小时，失败时保留纯文字入口，不影响页面其他部分。
function cachedStars() {
  try {
    const raw = JSON.parse(localStorage.getItem(STAR_KEY) || 'null')
    if (raw && typeof raw.n === 'number' && Date.now() - raw.t < 6 * 3600e3) return raw.n
  } catch {}
  return null
}
async function loadStars() {
  const cached = cachedStars()
  if (cached !== null) { stars.value = cached; return }
  try {
    const res = await fetch('https://api.github.com/repos/arsnyeon/online-unzip-tool', { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) return
    const count = (await res.json()).stargazers_count
    if (typeof count !== 'number') return
    stars.value = count
    try { localStorage.setItem(STAR_KEY, JSON.stringify({ n: count, t: Date.now() })) } catch {}
  } catch {}
}
function readMode() {
  const key = new URLSearchParams(location.search).get('mode')
  return key === 'image' ? 'image-compress' : modes.find(m => m.key === key)?.key
}
const initialMode = readMode()
const mode = ref(initialMode || 'extract')
function selectMode(key) {
  if (mode.value !== key) mode.value = key
  const url = new URL(location.href)
  if (key === 'extract') url.searchParams.delete('mode')
  else url.searchParams.set('mode', key)
  if (url.hash && url.hash !== '#workspace') url.hash = 'workspace'
  if (url.href !== location.href) history.replaceState(history.state, '', url)
}
async function focusWorkspace(key = mode.value) {
  menu.value = false
  selectMode(key)
  await nextTick()
  workspace.value?.focus({preventScroll:true})
  workspace.value?.scrollIntoView({block:'start'})
}
function navigate(event, target) {
  menu.value = false
  if (target === '#workspace') {
    event.preventDefault()
    focusWorkspace()
  }
}
// 解压是默认模式，地址里不保留它；其他模式仍可分享。
function cleanSectionUrl() {
  const url = new URL(location.href)
  if (url.searchParams.get('mode') === 'extract' && url.hash !== '#workspace') {
    url.searchParams.delete('mode')
    history.replaceState(history.state, '', url)
  }
}
function theme(v){dark.value=v;document.documentElement.dataset.theme=v?'dark':'light'}
function toggleTheme(){theme(!dark.value);try{localStorage.setItem('yasuo-theme',dark.value?'dark':'light')}catch{}}
function scroll(){scrolled.value=window.scrollY>12}
function storage(e){if(e.key==='yasuo-theme')theme(e.newValue==='dark')}
function key(e){if(e.key==='Escape'&&menu.value){menu.value=false; document.getElementById('menu-toggle')?.focus()}}
onMounted(()=>{try{theme((localStorage.getItem('yasuo-theme') || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'))==='dark')}catch{}cleanSectionUrl();window.addEventListener('hashchange',cleanSectionUrl);if((initialMode && !location.hash) || location.hash==='#workspace')focusWorkspace();loadStars();scroll();window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('keydown',key);window.addEventListener('storage',storage)})
onBeforeUnmount(()=>{window.removeEventListener('hashchange',cleanSectionUrl);window.removeEventListener('scroll',scroll);window.removeEventListener('keydown',key);window.removeEventListener('storage',storage)})
</script>
<template>
  <svg class="defs" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>
    <symbol v-for="(path,id) in icons" :id="'i-'+id" :key="id" viewBox="0 0 24 24"><path :d="path" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></symbol>
    <symbol id="i-github" viewBox="0 0 16 16"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></symbol>
    <symbol id="i-star" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.6l2.86 5.8 6.4.94-4.63 4.51 1.1 6.38L12 17.2l-5.73 3.03 1.1-6.38-4.63-4.51 6.4-.94z"/></symbol>
    <symbol id="parcel" viewBox="0 0 48 48"><g shape-rendering="crispEdges">
      <path fill="#182950" d="M12 2h16v2h3v3h3v4h5v3h3v3h3v19h-3v3h-5v3h-5v3H14v-2H8v-3H5v-4H3V18h3v-3h4V5h2z"/>
      <path fill="#cadbff" d="M12 6h3V4h12v7h6v7H12z"/><path fill="#fff" d="M15 5h11v7h6v6H14z"/><path fill="#668bf3" d="M27 5h2v3h3v2h-5zM17 8h6v2h-6zm0 5h10v2H17z"/>
      <path fill="#8caaff" d="M6 18h5v-2h5v2h13v-2h5v-3h4v3h4v3h-5v2h-6v3H20v-2h-6v-2H6z"/>
      <path fill="#466eed" d="M5 21h8v2h6v2h11v17H15v-2H9v-3H6z"/><path fill="#294db8" d="M31 26h5v-3h6v12h-3v3h-5v3h-3z"/>
      <path fill="#7396ff" d="M6 22h4v13H7zm4 15h5v2h-5z"/><path fill="#bdd4ff" d="M17 21h6v2h5v2h-6v-2h-5z"/>
      <path fill="#f3f6ff" d="M22 25h5v2h-3v2h3v2h-3v2h3v2h-5v-2h-2v-5h2z"/><path fill="#172c65" d="M20 34h7v2h2v5h-2v2h-7v-2h-2v-5h2z"/><path fill="#b6d1ff" d="M21 36h5v4h-5z"/><path fill="#3a5cbd" d="M22 37h3v2h-3z"/>
      <path fill="#d4e3ff" d="M9 29h2v4H9zm6 2h2v4h-2z"/>
    </g></symbol>
  </defs></svg>
  <a class="skip" href="#main">跳到主要内容</a>
  <header :class="{ solid:scrolled || menu }"><div class="shell navrow"><a href="#top" class="brand" @click="menu=false"><svg aria-hidden="true"><use href="#parcel"/></svg><span><b>yasuo</b>.zip</span></a><span class="mini-tag">local first</span>
    <nav class="wide-nav" aria-label="主导航"><a v-for="[url,label] in nav" :href="url" :key="url" @click="navigate($event,url)">{{label}}</a></nav><div class="nav-actions"><button class="square" @click="toggleTheme" :aria-label="dark?'切换为浅色主题':'切换为深色主题'" :title="dark?'浅色主题':'深色主题'"><svg><use :href="dark?'#i-sun':'#i-moon'"/></svg></button><a class="nav-primary" href="https://github.com/arsnyeon/online-unzip-tool" target="_blank" rel="noreferrer" title="在 GitHub 上查看项目" :aria-label="stars === null ? '在 GitHub 上查看项目' : `在 GitHub 上查看项目，${stars} 个 Star`"><svg class="gh-mark" aria-hidden="true"><use href="#i-github"/></svg><span class="gh-label">GitHub</span><span v-if="stars!==null" class="star-count"><svg aria-hidden="true"><use href="#i-star"/></svg>{{starText(stars)}}<span class="sr-only"> 个 Star</span></span></a><button id="menu-toggle" class="square menu-toggle" @click="menu=!menu" aria-controls="mobile-nav" :aria-expanded="menu" aria-label="导航菜单"><svg><use :href="menu?'#i-close':'#i-menu'"/></svg></button></div></div>
    <nav v-if="menu" id="mobile-nav" aria-label="移动导航"><a v-for="[url,label] in nav" :href="url" :key="url" @click="navigate($event,url)">{{label}}</a><a href="#workspace" @click.prevent="focusWorkspace()">打开工具</a></nav>
  </header>
  <main id="main"><section id="top"><div class="hero shell"><div class="intro">
    <div class="badges"><span><b>Local</b> · 浏览器内处理</span><span><b>Open source</b> · MIT</span></div>
    <div class="hero-name"><div class="hero-art"><svg aria-hidden="true"><use href="#parcel"/></svg></div><h1><b>yasuo</b>.zip</h1></div>
    <p class="lead">把压缩包摊开，把文件收好。<br>一个<b>本地优先</b>的<br class="small-break">在线解压缩工具。</p>
    <p class="desc">打开 ZIP、RAR 和 7Z，按目录查看文件；把散落的资料打包成 ZIP，或为一组图片减小体积。三种模式，在浏览器里切换。文件夹层级、文件大小和处理结果，一眼可见。</p>
    <p class="note">文件在此浏览器内处理，不会上传。首次使用部分格式时，需要联网加载处理组件。</p>
    <a class="format-strip" href="#features"><svg aria-hidden="true"><use href="#i-extract"/></svg><span>可解压</span><code>ZIP · RAR · 7Z · TAR · GZ · BZ2 · XZ</code><span class="format-link">格式说明</span></a>
    <div class="ctas"><a v-for="(m,i) in modes" :key="m.key" :class="{primary:i===0}" :href="`?mode=${m.key}#workspace`" @click.prevent="focusWorkspace(m.key)"><svg><use :href="'#i-'+m.icon"/></svg>{{m.name}}</a></div>
    <div class="platform"><span><svg><use href="#i-monitor"/></svg>浏览器运行</span><span><svg><use href="#i-shield"/></svg>本地处理</span><span><svg><use href="#i-code"/></svg>MIT 开源</span></div><p class="spec">解压单包 ≤ 500 MB · 打包整批 ≤ 500 MB</p>
  </div>
  <section id="workspace" ref="workspace" class="workspace" tabindex="-1" aria-label="本地文件工作台">
    <div class="terminal">
      <div class="chrome" aria-hidden="true"><i></i><i></i><i></i><span>yasuo.zip — local workspace</span></div>
      <div class="workspace-brand"><svg viewBox="0 0 80 7" role="img" aria-label="Archive Studio" shape-rendering="crispEdges"><path :d="pixels('ARCHIVE')" fill="#5175ed"/><path :d="pixels('STUDIO')" transform="translate(45 0)" fill="#859fdc"/></svg><span>~/workspace</span></div>
      <InlineWorkspace :mode="mode" @update:mode="selectMode" />
    </div>
  </section>
  </div></section>
  <section id="features" class="section shell"><h2>核心能力</h2><p class="sub">可以打开哪些压缩包？打包和处理图片后，会得到什么文件？</p><div class="features"><article v-for="m in modes" :key="m.key"><svg class="feature-icon" aria-hidden="true"><use :href="'#i-'+m.icon"/></svg><h3>{{m.title}}</h3><p>{{m.description}}</p><dl class="format-list"><div v-for="[label,suffixes] in m.formats" :key="label"><dt>{{label}}</dt><dd><code v-for="suffix in suffixes" :key="suffix">{{suffix}}</code></dd></div></dl><a :href="`?mode=${m.key}#workspace`" @click.prevent="focusWorkspace(m.key)">{{m.name}} <svg><use href="#i-arrow"/></svg></a></article></div></section>
  <section id="guide" class="band"><div class="section shell"><h2>快速开始</h2><p class="sub">以解压为例，三步取出需要的文件。</p><ol class="steps"><li><b>选择压缩包</b><p>打开解压工具，拖入文件或点击选择。</p></li><li><b>查看文件列表</b><p>等待本地引擎读取，按路径找到目标文件。</p></li><li><b>保存到设备</b><p>按路径搜索并勾选需要的文件，下载所选项或保存全部。</p></li></ol><a class="guide-link" href="?mode=extract#workspace" @click.prevent="focusWorkspace('extract')">打开解压工具 <svg><use href="#i-arrow"/></svg></a></div></section>
  <section id="faq" class="section shell"><h2>常见问题</h2><details v-for="[q,a] in [['文件会上传到哪里？','不会上传。解压、打包和图片压缩都在当前浏览器内完成，关闭页面后需重新选择文件。'],['可以打开加密压缩包吗？','先填写密码，再选择压缩包。密码正确也不一定能打开：部分加密方式不受支持。遇到这种情况，请改用创建该压缩包的工具解压。'],['一次能处理多大的文件？','解压时单个压缩包最多 500 MB；打包或处理图片时，整批文件合计最多 500 MB。手机内存较少，建议分批处理。']]" :key="q"><summary>{{q}}<svg><use href="#i-chevron"/></svg></summary><p>{{a}}</p></details></section></main><footer><div class="shell"><span class="brand"><b>yasuo.zip</b></span><span>本地文件工具 · MIT</span><a href="#top">返回顶部 ↑</a></div></footer>
</template>
