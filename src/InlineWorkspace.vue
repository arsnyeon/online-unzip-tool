<script setup>
import { onMounted, onBeforeUnmount, ref, useId, watch } from 'vue'
import { mountWorkspace } from '../js/script.js'

const props = defineProps({ mode: { type: String, default: 'compress' } })
const emit = defineEmits(['update:mode'])
const root = ref(null)
const prefix = useId()
const uid = name => `${prefix}-${name}`
let controller
onMounted(() => {
  controller = mountWorkspace(root.value, props.mode, mode => emit('update:mode', mode))
})
watch(() => props.mode, mode => controller?.setMode(mode))
onBeforeUnmount(() => controller?.dispose())
</script>

<template>
  <div ref="root" class="inline-workspace">
    <nav class="toolbar" role="tablist" aria-label="功能选择">
        <button class="tool-btn active" data-control="compress-btn" role="tab" aria-selected="true" aria-pressed="true" :aria-describedby="uid('compress-desc')" type="button">
            <svg class="work-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7m-9 4v10"/></svg><span>压缩文件</span>
        </button>
        <button class="tool-btn" data-control="extract-btn" role="tab" aria-selected="false" aria-pressed="false" :aria-describedby="uid('extract-desc')" type="button">
            <svg class="work-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M3 8V5h6l2 2h9v3M3 19l2-9h17l-3 9z"/></svg><span>解压文件</span>
        </button>
        <button class="tool-btn" data-control="image-compress-btn" role="tab" aria-selected="false" aria-pressed="false" :aria-describedby="uid('image-compress-desc')" type="button">
            <svg class="work-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M3 4h18v16H3zM3 16l6-6 5 5 3-3 4 4M16 8h.01"/></svg><span>图片压缩</span>
        </button>
    </nav>
    <div class="sr-only">
        <div data-control="compress-desc" :id="uid('compress-desc')">将多个文件或文件夹压缩成 ZIP 格式</div>
        <div data-control="extract-desc" :id="uid('extract-desc')">解压 ZIP、RAR、7Z、TAR、GZ、BZ2、XZ 格式；密码包支持情况取决于格式和加密方式</div>
        <div data-control="image-compress-desc" :id="uid('image-compress-desc')">压缩 JPEG、PNG、WebP 图片，可调节质量</div>
    </div>

    <section class="panel upload-section" data-control="upload-section" :aria-labelledby="uid('upload-title')">
        <div class="panel-head">
            <div class="panel-index" aria-hidden="true">01</div>
            <div>
                <h2 data-control="upload-title" :id="uid('upload-title')">选择文件进行压缩</h2>
                <p class="panel-sub" data-control="upload-description" :id="uid('upload-description')">拖拽文件到此处，或点击按钮选择（最大 500MB）</p>
            </div>
        </div>

        <div class="dropzone" data-control="drop-area" role="group" :aria-describedby="uid('upload-description')">
            <div class="drop-icon" data-control="upload-icon" aria-hidden="true">
                <svg class="work-icon" data-control="extract-icon" viewBox="0 0 24 24"><path d="M3 8V5h6l2 2h9v3M3 19l2-9h17l-3 9z"/></svg>
                <svg class="work-icon" data-control="compress-icon" viewBox="0 0 24 24"><path d="M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7m-9 4v10"/></svg>
                <svg class="work-icon" data-control="image-compress-icon" viewBox="0 0 24 24"><path d="M3 4h18v16H3zM3 16l6-6 5 5 3-3 4 4M16 8h.01"/></svg>
            </div>
            <p class="drop-hint" data-control="drop-hint">把文件拖到这里</p>

            <input type="file" data-control="file-input" accept=".zip,.rar,.7z,.gz,.tar,.bz2,.xz,.tgz,.tbz2,.txz,.tar.gz,.tar.bz2,.tar.xz" hidden aria-label="选择压缩文件">
            <input type="file" data-control="compress-file-input" multiple webkitdirectory hidden aria-label="选择文件夹">
            <input type="file" data-control="compress-files-input" multiple hidden aria-label="选择多个文件">
            <input type="file" data-control="image-compress-input" multiple accept="image/jpeg,image/png,image/webp" hidden aria-label="选择要压缩的图片">

            <div class="password-option" data-control="password-option" style="display: none;">
                <label :for="uid('archive-password')"> 解压密码（加密文件才需填写）</label>
                <input type="password" data-control="archive-password" :id="uid('archive-password')" autocomplete="off" placeholder="留空表示无密码">
            </div>

            <div class="action-row upload-buttons" data-control="upload-buttons">
                <button class="btn btn-primary" data-control="upload-btn" type="button"><svg class="work-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M3 8V5h6l2 2h9v3M3 19l2-9h17l-3 9z"/></svg> 选择压缩文件</button>
            </div>
            <div class="action-row compress-buttons" data-control="compress-buttons">
                <button class="btn btn-primary" data-control="select-files-btn" type="button"><svg class="work-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M5 3h9l5 5v13H5zM14 3v6h5m-10 5h6m-3-3v6"/></svg> 选择文件</button>
                <button class="btn btn-ghost" data-control="select-folder-btn" type="button"><svg class="work-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h6l2 2h10v12H3zM9 14h6m-3-3v6"/></svg> 选择文件夹</button>
                <label class="zip-method">ZIP 打包方式 <select data-control="zip-method"><option value="balanced">标准压缩</option><option value="store">仅打包，不压缩</option></select></label>
            </div>
            <div class="action-row image-compress-buttons" data-control="image-compress-buttons">
                <div class="image-settings" role="group" aria-label="图片压缩设置">
                    <label>压缩方式 <select data-control="image-target"><option value="manual">按质量压缩</option><option value="100">100 KB</option><option value="200">200 KB</option><option value="500">500 KB</option><option value="1024">1 MB</option><option value="custom">自定义</option></select></label>
                    <label data-control="image-custom-row" hidden>目标（KB）<input data-control="image-custom-kb" type="number" min="1" max="512000" step="1" value="300"></label>
                    <div class="quality-control" data-control="image-quality-row">
                        <label :for="uid('quality-slider')">JPEG / WebP 质量 <output data-control="quality-value" :for="uid('quality-slider')">30</output>%</label>
                        <input type="range" data-control="quality-slider" :id="uid('quality-slider')" min="10" max="100" value="30" class="quality-slider" aria-label="JPEG / WebP 压缩质量">
                    </div>
                    <label class="image-resize"><input data-control="image-resize" type="checkbox"> 等比缩小尺寸</label>
                    <label data-control="image-edge-row" hidden>最长边（像素）<input data-control="image-max-edge" type="number" min="1" max="16384" step="1" value="1920"></label>
                </div>
                <p class="image-settings-note">目标体积按每张图片计算。PNG 不受质量设置影响。压缩后若没有变小，将保留原图。</p>
                <button class="btn btn-primary" data-control="select-images-btn" type="button"><svg class="work-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M3 4h18v16H3zM3 16l6-6 5 5 3-3 4 4M16 8h.01"/></svg> 选择图片并压缩</button>
            </div>
        </div>
        <div class="panel-foot">
            <span> 全程本地</span>
            <span> 按需加载组件</span>
            <a href="#features">查看支持格式</a>
        </div>
    </section>

    <section class="panel processing-section" data-control="processing-section" aria-live="polite" :aria-labelledby="uid('processing-text')" style="display: none;">
        <div class="panel-head">
            <div class="panel-index" aria-hidden="true">02</div>
            <div><h2 data-control="processing-text" :id="uid('processing-text')">正在处理…</h2><p class="panel-sub">文件没有上传，请稍候</p></div>
        </div>
        <div class="progress-wrap">
            <div class="progress-bar-container" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-bar" data-control="progress-bar"></div>
            </div>
            <output data-control="progress-text">0%</output>
        </div>
    </section>

    <section class="panel result-section" data-control="result-section" :aria-labelledby="uid('result-title')" style="display: none;">
        <div class="panel-head result-head">
            <div class="panel-index" aria-hidden="true">03</div>
            <div class="result-meta">
                <h2 data-control="result-title" :id="uid('result-title')" tabindex="-1">处理结果</h2>
                <p class="panel-sub"><span data-control="file-name">未选择文件</span> <span data-control="file-size"></span></p>
            </div>
            <button class="btn btn-download" data-control="download-all-btn" type="button"><svg class="work-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v11m-4-4 4 4 4-4M4 15v5h16v-5"/></svg> 下载全部</button>
        </div>
        <details class="image-skips" data-control="image-skips" hidden>
            <summary data-control="image-skips-count"></summary>
            <p data-control="image-skips-list"></p>
        </details>
        <div class="result-filter">
            <label :for="uid('result-search')">搜索文件路径</label>
            <input data-control="result-search" :id="uid('result-search')" type="search" placeholder="输入文件名或文件夹名" :aria-controls="uid('file-list')" autocomplete="off">
        </div>
        <div class="result-tools">
            <button type="button" data-control="select-visible-btn" class="btn btn-ghost">选择可见文件</button>
            <button type="button" data-control="clear-selection-btn" class="btn btn-ghost">清空选择</button>
            <button type="button" data-control="download-selected-btn" class="btn btn-download">下载所选</button>
        </div>
        <p data-control="result-status" role="status" aria-atomic="true"></p>
        <div class="file-explorer">
            <div class="file-list-header" aria-hidden="true">
                <span>文件路径</span><span>大小</span><span class="action-header">操作</span>
            </div>
            <ul class="file-list" data-control="file-list" :id="uid('file-list')" aria-label="结果文件列表"></ul>
            <div data-control="result-empty" hidden><span data-control="result-empty-text"></span>
                <button type="button" data-control="reset-search-btn" class="btn btn-ghost">清除搜索</button>
            </div>
        </div>
        <button type="button" class="btn btn-ghost" data-control="new-task-btn">开始新任务</button>
    </section>

    <dialog class="error-popup" data-control="error-popup" :aria-labelledby="uid('error-title')" :aria-describedby="uid('error-message')" aria-hidden="true">
        <div class="error-content">
            <h3 :id="uid('error-title')">出了点问题</h3>
            <p data-control="error-message" :id="uid('error-message')"></p>
            <button class="btn btn-primary" data-control="error-close" type="button">知道了</button>
        </div>
    </dialog>
  </div>
</template>

<style scoped src="./inline-workspace.css"></style>
