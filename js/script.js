/**
 * 在线解压缩工具核心脚本
 *
 * 提供三大功能：压缩包解压、文件压缩、图片压缩。
 * 所有文件处理均在浏览器本地完成，不会上传到服务器。
 *
 * @author  ArsnYeon
 * @website https://yasuo.zip/
 * @source  https://github.com/arsnyeon/online-unzip-tool
 * @license MIT License
 *
 * 版权声明：
 * 本代码遵循 MIT 开源协议，允许自由使用、修改和分发。
 * 但请保留此版权声明和作者信息，禁止删除此文本注释。
 *
 * 功能清单：
 * 1. 文件上传（支持拖拽与点击选择）
 * 2. 文件大小校验（单文件上限 500MB）
 * 3. 解压：ZIP（JSZip）、GZ（pako）、TAR（原生解析）为快速通道；
 *    RAR / 7Z / BZ2 / XZ / 加密包由 libarchive.js（WASM）处理
 * 4. 压缩：多文件 / 文件夹压缩为 ZIP（JSZip）
 * 5. 图片压缩：JPEG / PNG / WebP，可调质量，Canvas 实现
 * 6. 处理结果浏览与单个 / 批量下载
 */

/* ==========================================================================
 * 常量定义
 * ========================================================================== */

/** 单个文件允许的最大体积（500MB） */
const MAX_FILE_SIZE = 500 * 1024 * 1024;
const MAX_ENTRIES = 10000;
function checkBudget(count, bytes = 0) {
    if (count > MAX_ENTRIES || bytes > MAX_FILE_SIZE) {
        throw new RangeError('超过处理上限（10,000 个条目或 500 MB），请使用桌面工具');
    }
}

/** 快速通道支持的解压格式（由 JSZip / pako / 原生解析器处理） */
const FAST_EXTRACT_FORMATS = ['zip', 'gz', 'tar'];

/** 交由 libarchive.js 处理的扩展格式 */
const LIBARCHIVE_FORMATS = ['rar', '7z', 'bz2', 'xz', 'tar.gz', 'tar.bz2', 'tar.xz'];

/** 全部支持的解压扩展名（用于上传校验与 accept 属性保持一致） */
const SUPPORTED_EXTRACT_FORMATS = [...FAST_EXTRACT_FORMATS, ...LIBARCHIVE_FORMATS];

/** libarchive.js 引擎最长等待时间（毫秒），超时后提示用户重试 */
const LIBARCHIVE_LOAD_TIMEOUT = 15000;

/* ==========================================================================
 * DOM 元素缓存
 * ========================================================================== */

const engineLoads = new Map();

export function mountWorkspace(root, initialMode = 'compress', onModeChange = () => {}) {
const control = name => root.querySelector(`[data-control="${name}"]`);
const listeners = new AbortController();
let disposed = false;
let generation = 0;
const elements = {
    dropArea: control('drop-area'),
    fileInput: control('file-input'),
    uploadBtn: control('upload-btn'),
    uploadSection: control('upload-section'),
    processingSection: control('processing-section'),
    resultSection: control('result-section'),
    progressBar: control('progress-bar'),
    progressText: control('progress-text'),
    processingText: control('processing-text'),
    fileList: control('file-list'),
    fileName: control('file-name'),
    fileSize: control('file-size'),
    resultTitle: control('result-title'),
    downloadAllBtn: control('download-all-btn'),
    errorPopup: control('error-popup'),
    errorMessage: control('error-message'),
    errorClose: control('error-close'),
    compressBtn: control('compress-btn'),
    extractBtn: control('extract-btn'),
    imageCompressBtn: control('image-compress-btn'),
    compressFileInput: control('compress-file-input'),
    compressFilesInput: control('compress-files-input'),
    imageCompressInput: control('image-compress-input'),
    selectFilesBtn: control('select-files-btn'),
    selectFolderBtn: control('select-folder-btn'),
    selectImagesBtn: control('select-images-btn'),
    uploadTitle: control('upload-title'),
    uploadDescription: control('upload-description'),
    uploadButtons: control('upload-buttons'),
    compressButtons: control('compress-buttons'),
    imageCompressButtons: control('image-compress-buttons'),
    passwordOption: control('password-option'),
    archivePassword: control('archive-password'),
    extractIcon: control('extract-icon'),
    compressIcon: control('compress-icon'),
    imageCompressIcon: control('image-compress-icon'),
    qualitySlider: control('quality-slider'),
    qualityValue: control('quality-value')
};

/* ==========================================================================
 * 应用状态
 * ========================================================================== */

/** 当前解压 / 压缩产生的结果文件集合，键为文件路径 */
let extractedFiles = Object.create(null);

/** 当前正在处理的用户原始文件 */
let currentFile = null;

/** 当前工作模式：'compress' | 'extract' | 'image-compress' */
let currentMode;

/* ==========================================================================
 * 通用工具函数
 * ========================================================================== */

/**
 * 智能检测字节序列的文本编码并解码，主要用于兼容性压缩包内的中文文件名。
 *
 * 检测顺序：ASCII → UTF-8 → 常见中文/日文编码 → latin1 兜底。
 *
 * @param {Uint8Array} bytes 待解码的字节数组
 * @returns {string} 解码后的字符串
 */
function smartDecodeFileName(bytes) {
    // 1. ASCII 是最常见且最安全的情况，直接解码
    let isAscii = true;
    for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] > 127) {
            isAscii = false;
            break;
        }
    }
    if (isAscii) {
        return new TextDecoder('ascii').decode(bytes);
    }

    // 2. 尝试严格模式的 UTF-8（现代压缩工具的事实标准）
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
        // 严格解码失败，继续尝试其他编码
    }

    // 3. 依次尝试常见的多字节编码，用替换字符比例做启发式判断
    const encodings = ['gbk', 'gb2312', 'big5', 'shift-jis'];
    for (const encoding of encodings) {
        try {
            const decoded = new TextDecoder(encoding).decode(bytes);
            const replacementCount = (decoded.match(/\uFFFD/g) || []).length;
            // 替换字符占比低于 10% 时认为解码正确
            if (replacementCount / decoded.length < 0.1) {
                return decoded;
            }
        } catch (error) {
            // 当前环境不支持该编码，尝试下一个
        }
    }

    // 4. 全部失败时使用 latin1 兜底，保证不抛异常
    return new TextDecoder('latin1').decode(bytes);
}

/**
 * 将字节数格式化为易读的文件大小字符串。
 *
 * @param {number} bytes 字节数
 * @returns {string} 形如 "1.50 MB" 的字符串
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, index)).toFixed(2) + ' ' + units[index];
}

/**
 * 根据文件路径推断 MIME 类型。
 *
 * @param {string} path 文件路径或文件名
 * @returns {string} MIME 类型，未知类型返回 application/octet-stream
 */
function getMimeType(path) {
    const extension = path.split('.').pop().toLowerCase();
    const mimeTypes = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
        pdf: 'application/pdf', txt: 'text/plain',
        html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ppt: 'application/vnd.ms-powerpoint',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        mp3: 'audio/mpeg', mp4: 'video/mp4',
        zip: 'application/zip', rar: 'application/vnd.rar',
        '7z': 'application/x-7z-compressed',
        tar: 'application/x-tar', gz: 'application/gzip',
        bz2: 'application/x-bzip2', xz: 'application/x-xz',
        json: 'application/json', xml: 'application/xml'
    };

    return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * 根据文件名返回对应的 Font Awesome 图标类名。
 *
 * @param {string} fileName 文件名
 * @returns {string} 图标 class 字符串
 */
function getFileIcon(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();

    const iconMap = {
        // 图片
        jpg: 'fas fa-file-image', jpeg: 'fas fa-file-image',
        png: 'fas fa-file-image', gif: 'fas fa-file-image',
        svg: 'fas fa-file-image', webp: 'fas fa-file-image',
        // 文档
        pdf: 'fas fa-file-pdf', doc: 'fas fa-file-word', docx: 'fas fa-file-word',
        txt: 'fas fa-file-alt', rtf: 'fas fa-file-alt',
        // 表格
        xls: 'fas fa-file-excel', xlsx: 'fas fa-file-excel', csv: 'fas fa-file-csv',
        // 演示文稿
        ppt: 'fas fa-file-powerpoint', pptx: 'fas fa-file-powerpoint',
        // 代码
        html: 'fas fa-file-code', htm: 'fas fa-file-code', css: 'fas fa-file-code',
        js: 'fas fa-file-code', json: 'fas fa-file-code', xml: 'fas fa-file-code',
        py: 'fas fa-file-code', java: 'fas fa-file-code', c: 'fas fa-file-code',
        cpp: 'fas fa-file-code',
        // 音频 / 视频
        mp3: 'fas fa-file-audio', wav: 'fas fa-file-audio', ogg: 'fas fa-file-audio',
        mp4: 'fas fa-file-video', avi: 'fas fa-file-video',
        mov: 'fas fa-file-video', wmv: 'fas fa-file-video',
        // 压缩包
        zip: 'fas fa-file-archive', rar: 'fas fa-file-archive',
        '7z': 'fas fa-file-archive', tar: 'fas fa-file-archive',
        gz: 'fas fa-file-archive', bz2: 'fas fa-file-archive', xz: 'fas fa-file-archive'
    };

    return iconMap[extension] || 'fas fa-file';
}

/**
 * 识别压缩包的归档类型，兼容 .tar.gz 等复合扩展名。
 *
 * @param {string} name 文件名
 * @returns {string} 归一化的类型标识，例如 'zip' / 'tar.gz' / 'rar'
 */
function getArchiveType(name) {
    const lower = name.toLowerCase();
    if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
    if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2')) return 'tar.bz2';
    if (lower.endsWith('.tar.xz') || lower.endsWith('.txz')) return 'tar.xz';
    return lower.split('.').pop();
}

/**
 * 将 libarchive.js 返回的嵌套文件对象拍平为「路径 → 文件信息」的映射。
 *
 * @param {Object} tree libarchive.js 的 extractFiles() 结果
 * @param {string} prefix 当前路径前缀（递归使用）
 * @returns {Object} 拍平后的文件映射
 */
function flattenArchiveTree(tree, prefix = '') {
    const result = Object.create(null);

    for (const [key, value] of Object.entries(tree)) {
        const path = prefix ? `${prefix}/${key}` : key;
        if (value instanceof File) {
            result[path] = {
                name: value.name || path.split('/').pop(),
                path: path,
                size: value.size,
                type: value.type || getMimeType(path),
                content: value
            };
        } else if (value && typeof value === 'object') {
            Object.assign(result, flattenArchiveTree(value, path));
        }
    }

    return result;
}

/* ==========================================================================
 * UI 状态控制
 * ========================================================================== */

/**
 * 显示「处理中」界面并重置进度条。
 *
 * @param {string} text 处理提示文字
 */
// Each job owns the shared result list until it finishes; switching modes mid-job
// would otherwise allow a late completion to overwrite the next job's results.
function setProcessingBusy(busy) {
    for (const button of [elements.compressBtn, elements.extractBtn, elements.imageCompressBtn]) {
        button.disabled = busy;
    }
}

function showProcessingUI(text) {
    setProcessingBusy(true);
    const { uploadSection, processingSection, resultSection, processingText } = elements;
    uploadSection.style.display = 'none';
    processingSection.style.display = 'block';
    resultSection.style.display = 'none';
    processingText.textContent = text;
    updateProgress(0);
}

/**
 * 显示「处理结果」界面。
 *
 * @param {string} title 结果区标题
 */
function showResults(title) {
    setProcessingBusy(false);
    const { processingSection, resultSection, resultTitle } = elements;
    if (resultTitle) resultTitle.textContent = title;

    resetResultBrowser();
    resultPaths = Object.keys(extractedFiles).sort();
    displayFiles();
    processingSection.style.display = 'none';
    resultSection.style.display = 'block';
    if (elements.errorPopup.getAttribute('aria-hidden') !== 'false') resultTitle.focus();
}

/**
 * 更新进度条宽度与百分比文字。
 *
 * @param {number} percent 进度百分比（0-100）
 */
function updateProgress(percent) {
    const { progressBar, progressText } = elements;
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    progressBar.style.width = clamped + '%';
    progressText.textContent = clamped + '%';
    progressBar.parentElement.setAttribute('aria-valuenow', String(clamped));
}

/**
 * 弹出错误提示框。
 *
 * @param {string} message 错误描述
 */
function showError(message) {
    const { errorMessage, errorPopup } = elements;
    errorMessage.textContent = message;
    if (!errorPopup.open) errorPopup.showModal();
    errorPopup.setAttribute('aria-hidden', 'false');
    elements.errorClose.focus();
}

/**
 * 将界面重置为初始的上传状态，并清空所有文件输入框。
 */
function resetInterface() {
    setProcessingBusy(false);
    if (elements.archivePassword) elements.archivePassword.value = '';
    const {
        uploadSection, processingSection, resultSection,
        fileInput, compressFilesInput, compressFileInput, imageCompressInput
    } = elements;

    uploadSection.style.display = 'block';
    processingSection.style.display = 'none';
    resultSection.style.display = 'none';

    currentFile = null;
    extractedFiles = Object.create(null);
    resetResultBrowser();
    fileInput.value = '';
    if (compressFilesInput) compressFilesInput.value = '';
    if (compressFileInput) compressFileInput.value = '';
    if (imageCompressInput) imageCompressInput.value = '';
    const imageSkips = control('image-skips');
    if (imageSkips) imageSkips.hidden = true;
}

/**
 * 切换工具模式（压缩 / 解压 / 图片压缩），同步按钮状态、文案与无障碍属性。
 *
 * @param {'compress'|'extract'|'image-compress'} mode 目标模式
 */
function switchMode(requested, notify = false) {
    const mode = requested === 'image' ? 'image-compress' : ['extract', 'image-compress'].includes(requested) ? requested : 'compress';
    if (disposed || currentMode === mode) return;
    generation++;
    currentMode = mode;
    const {
        compressBtn, extractBtn, imageCompressBtn, uploadTitle, uploadDescription,
        uploadButtons, compressButtons, imageCompressButtons, passwordOption,
        extractIcon, compressIcon, imageCompressIcon, fileInput
    } = elements;

    // 更新选中态与无障碍状态，保证 tab 角色的语义一致
    compressBtn?.classList.toggle('active', mode === 'compress');
    extractBtn?.classList.toggle('active', mode === 'extract');
    imageCompressBtn?.classList.toggle('active', mode === 'image-compress');
    compressBtn?.setAttribute('aria-pressed', String(mode === 'compress'));
    extractBtn?.setAttribute('aria-pressed', String(mode === 'extract'));
    imageCompressBtn?.setAttribute('aria-pressed', String(mode === 'image-compress'));
    compressBtn?.setAttribute('aria-selected', String(mode === 'compress'));
    extractBtn?.setAttribute('aria-selected', String(mode === 'extract'));
    imageCompressBtn?.setAttribute('aria-selected', String(mode === 'image-compress'));

    // 密码框仅在解压模式显示
    if (passwordOption) {
        passwordOption.style.display = mode === 'extract' ? 'flex' : 'none';
    }

    // 更新上传区文案与图标
    if (mode === 'compress') {
        uploadTitle.textContent = '选择文件进行压缩';
        uploadDescription.textContent = '选择多个文件或一个文件夹，合计最多 500 MB。';
        uploadButtons.style.display = 'none';
        compressButtons.style.display = 'flex';
        imageCompressButtons.style.display = 'none';
        extractIcon.style.display = 'none';
        compressIcon.style.display = 'block';
        imageCompressIcon.style.display = 'none';
    } else if (mode === 'extract') {
        uploadTitle.textContent = '选择压缩文件进行解压';
        uploadDescription.textContent = '一次选择一个压缩包，最多 500 MB。加密文件请先填写密码。';
        uploadButtons.style.display = 'flex';
        compressButtons.style.display = 'none';
        imageCompressButtons.style.display = 'none';
        extractIcon.style.display = 'block';
        compressIcon.style.display = 'none';
        imageCompressIcon.style.display = 'none';
        fileInput.accept = '.zip,.rar,.7z,.gz,.tar,.bz2,.xz,.tgz,.tbz2,.txz,.tar.gz,.tar.bz2,.tar.xz';
    } else if (mode === 'image-compress') {
        uploadTitle.textContent = '选择图片进行压缩';
        uploadDescription.textContent = '选择 JPEG、PNG 或 WebP 图片，整批最多 500 MB。';
        uploadButtons.style.display = 'none';
        compressButtons.style.display = 'none';
        imageCompressButtons.style.display = 'flex';
        extractIcon.style.display = 'none';
        compressIcon.style.display = 'none';
        imageCompressIcon.style.display = 'block';
    }

    resetInterface();
    if (notify) onModeChange(mode);
}

/* ==========================================================================
 * 解压流程
 * ========================================================================== */

/**
 * 处理用户选择的待解压文件：校验大小与格式后进入解压流程。
 *
 * @param {FileList} files 用户选择的文件列表（仅取第一个）
 */
function handleFiles(files) {
    const file = files[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
        showError(`文件大小超过限制（${formatFileSize(MAX_FILE_SIZE)}）`);
        return;
    }

    const type = getArchiveType(file.name);
    if (!SUPPORTED_EXTRACT_FORMATS.includes(type)) {
        showError('目前支持的格式：ZIP、RAR、7Z、GZ、TAR、BZ2、XZ（含加密压缩包）');
        return;
    }

    currentFile = file;
    elements.fileName.textContent = file.name;
    elements.fileSize.textContent = formatFileSize(file.size);
    showProcessingUI('正在解压中...');
    extractArchive(file);
}

/**
 * 按归档类型分派到对应的解压实现。
 *
 * @param {File} file 待解压文件
 */
async function extractArchive(file) {
    const job = generation;
    try {
        extractedFiles = Object.create(null);
        const type = getArchiveType(file.name);
        const password = elements.archivePassword?.value || '';

        switch (type) {
            case 'zip':
                if (password) await extractWithLibArchive(file, password);
                else await extractZip(file);
                break;
            case 'gz':
                await extractGzip(file);
                break;
            case 'tar':
                await extractTar(file);
                break;
            default:
                // RAR / 7Z / BZ2 / XZ / 复合 tar 包 / 未知格式统一交给 libarchive
                await extractWithLibArchive(file, password);
        }

        if (job !== generation) return;

        showResults('解压结果');
    } catch (error) {
        if (job !== generation) return;
        console.error('解压失败:', error);
        showError('解压失败: ' + error.message);
        resetInterface();
    }
}

/**
 * 使用 JSZip 解压 ZIP 文件。
 *
 * @param {File} file 待解压的 ZIP 文件
 */
async function extractZip(file) {
    const job = generation;
    try {
        const JSZip = await getZipEngine();
        const zip = await new JSZip().loadAsync(file, {
            decodeFileName: smartDecodeFileName
        });

        if (job !== generation) return;

        const entries = Object.entries(zip.files);
        const total = entries.length;
        checkBudget(total, entries.reduce((sum, [, entry]) => sum + (entry._data?.uncompressedSize || 0), 0));
        let expanded = 0;

        for (let i = 0; i < total; i++) {
            const [path, zipEntry] = entries[i];

            // 目录项直接跳过
            if (!zipEntry.dir) {
                const content = await zipEntry.async('blob');
                if (job !== generation) return;
                expanded += content.size;
                checkBudget(total, expanded);
                extractedFiles[path] = {
                    name: path.split('/').pop(),
                    path: path,
                    size: content.size,
                    type: content.type || getMimeType(path),
                    content: content
                };
            }

            updateProgress(((i + 1) / total) * 100);
        }
    } catch (error) {
        if (error instanceof RangeError) throw error;
        console.error('ZIP解压失败:', error);
        throw new Error('ZIP解压失败，请确认文件完好或输入正确密码');
    }
}

/**
 * 使用 pako 解压单文件 GZIP。
 *
 * @param {File} file 待解压的 GZ 文件
 */
async function extractGzip(file) {
    const job = generation;
    try {
        const pako = await loadEngine('pako', 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js');

        const compressed = new Uint8Array(await file.arrayBuffer());
        if (job !== generation) return;
        const inflater = new pako.Inflate();
        const chunks = [];
        let expanded = 0;
        inflater.onData = chunk => {
            expanded += chunk.length;
            checkBudget(1, expanded);
            chunks.push(chunk);
        };
        inflater.push(compressed, true);
        if (inflater.err || !inflater.ended) throw new Error('GZIP 数据不完整');

        // 去掉 .gz 后缀还原原始文件名
        let originalName = file.name;
        if (originalName.toLowerCase().endsWith('.gz')) {
            originalName = originalName.slice(0, -3);
        }

        const blob = new Blob(chunks);
        extractedFiles[originalName] = {
            name: originalName,
            path: originalName,
            size: blob.size,
            type: getMimeType(originalName),
            content: blob
        };

        updateProgress(100);
    } catch (error) {
        if (error instanceof RangeError) throw error;
        console.error('GZIP解压失败:', error);
        throw new Error('GZIP解压失败，可能是文件损坏或格式不支持');
    }
}

/**
 * 原生解析未压缩的 TAR 归档。
 *
 * 按 512 字节头部块逐条读取文件名、大小与类型，进度按已解析字节比例更新。
 *
 * @param {File} file 待解压的 TAR 文件
 */
async function extractTar(file) {
    const job = generation;
    try {
        const arrayBuffer = await file.arrayBuffer();
        if (job !== generation) return;
        const view = new DataView(arrayBuffer);
        let offset = 0;
        let count = 0;

        while (offset < arrayBuffer.byteLength - 512) {
            // 连续 512 个零字节表示归档结束
            let isEnd = true;
            for (let i = 0; i < 512 && offset + i < arrayBuffer.byteLength; i++) {
                if (view.getUint8(offset + i) !== 0) {
                    isEnd = false;
                    break;
                }
            }
            if (isEnd) break;
            checkBudget(++count);

            // 头部前 100 字节是文件名（智能编码解码）
            const nameBytes = new Uint8Array(100);
            let nameLength = 0;
            for (let i = 0; i < 100; i++) {
                const byte = view.getUint8(offset + i);
                if (byte === 0) break;
                nameBytes[i] = byte;
                nameLength++;
            }
            const fileName = smartDecodeFileName(nameBytes.slice(0, nameLength));
            if (!fileName) break;

            // 124-135 字节是以八进制表示的文件大小
            let sizeStr = '';
            for (let i = 124; i < 136; i++) {
                const byte = view.getUint8(offset + i);
                if (byte === 0 || byte === 32) break;
                sizeStr += String.fromCharCode(byte);
            }
            if (!/^[0-7]+$/.test(sizeStr.trim())) throw new Error('无效的文件大小');
            const fileSize = parseInt(sizeStr.trim(), 8);
            if (offset + 512 + fileSize > file.size) throw new Error('文件内容不完整');

            // 156 字节是文件类型标识（0 / '0' 表示普通文件）
            const fileType = view.getUint8(offset + 156);
            offset += 512; // 跳过头部块

            // 仅提取有内容的普通文件，跳过目录项
            if (!fileName.endsWith('/') && (fileType === 0 || fileType === 48)) {
                const fileData = new Uint8Array(arrayBuffer.slice(offset, offset + fileSize));
                const blob = new Blob([fileData]);
                extractedFiles[fileName] = {
                    name: fileName.split('/').pop(),
                    path: fileName,
                    size: blob.size,
                    type: getMimeType(fileName),
                    content: blob
                };
            }

            // 文件内容占据 512 字节整数倍的数据块
            offset += Math.ceil(fileSize / 512) * 512;
            updateProgress(Math.min(99, (offset / arrayBuffer.byteLength) * 100));
        }

        if (Object.keys(extractedFiles).length === 0) {
            throw new Error('未找到有效的文件');
        }
        updateProgress(100);
    } catch (error) {
        if (error instanceof RangeError) throw error;
        console.error('TAR解压失败:', error);
        throw new Error('TAR解压失败，可能是文件损坏或格式不支持');
    }
}

// Download only the engine needed by the selected operation. No external
// resource must block mode selection, password input, or the native TAR reader.

function loadEngine(name, url) {
    if (window[name]) return Promise.resolve(window[name]);
    if (!engineLoads.has(name)) {
        engineLoads.set(name, new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.crossOrigin = 'anonymous';
            const fail = () => {
                clearTimeout(timer);
                script.remove();
                engineLoads.delete(name);
                reject(new Error('处理引擎未加载，请检查网络并重试'));
            };
            const timer = setTimeout(fail, LIBARCHIVE_LOAD_TIMEOUT);
            script.onerror = fail;
            script.onload = () => { clearTimeout(timer); resolve(window[name]); };
            document.head.appendChild(script);
        }));
    }
    return engineLoads.get(name);
}
const getZipEngine = () => loadEngine('JSZip', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
async function waitForLibArchive() {
    const { Archive } = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/dist/libarchive.js');
    Archive.init({ workerUrl: new URL('js/libarchive-worker-shim.js', document.baseURI).href });
    return Archive;
}

/**
 * 使用 libarchive.js 解压扩展格式（RAR/7Z/BZ2/XZ/复合 tar 包等）。
 *
 * 支持通过 usePassword 处理加密压缩包。
 *
 * @param {File} file 待解压文件
 * @param {string} password 用户输入的解压密码，可为空
 */
async function extractWithLibArchive(file, password) {
    const job = generation;
    const Archive = await waitForLibArchive();
    const archive = await Archive.open(file);

    try {
        // 检测加密状态；若用户提供了密码则应用之
        if (password) {
            await archive.usePassword(password);
        }

        // 先获取文件总数，用于精确计算解压进度（此操作不解压内容）
        let totalEntries = 0;
        try {
            const filesArray = await archive.getFilesArray();
            checkBudget(filesArray.length, filesArray.reduce((sum, item) => sum + (Number(item.file?.size) || 0), 0));
            totalEntries = filesArray.filter(item => item.file && item.file.size > 0).length;
        } catch (error) {
            if (error instanceof RangeError) throw error;
            // 部分格式不支持预列举，回落为不确定进度的平滑递增
            console.warn('无法预取文件列表，进度将以递增方式显示:', error);
        }

        let extractedCount = 0;
        const tree = await archive.extractFiles((entry) => {
            // 单文件解压完成回调：即时反馈进度
            if (job === generation && entry && entry.path) {
                extractedCount++;
                const percent = totalEntries > 0
                    ? (extractedCount / totalEntries) * 100
                    : Math.min(90, extractedCount * 5);
                updateProgress(Math.min(99, percent));
            }
        });

        if (job !== generation) return;

        extractedFiles = flattenArchiveTree(tree);
        updateProgress(100);

        if (Object.keys(extractedFiles).length === 0) {
            throw new Error('未找到有效的文件');
        }
    } finally {
        // 确保 worker 被释放，避免内存泄漏
        if (typeof archive.close === 'function') {
            await archive.close();
        }
    }
}

/* ==========================================================================
 * 压缩流程（文件 → ZIP）
 * ========================================================================== */

/**
 * 处理待压缩文件：校验总大小后进入压缩流程。
 *
 * @param {FileList} files 待压缩的文件列表
 */
function handleCompressFiles(files) {
    if (files.length > MAX_ENTRIES) return showError('每批最多 10,000 个条目');
    const totalSize = Array.from(files).reduce((sum, file) => sum + file.size, 0);

    if (totalSize > MAX_FILE_SIZE) {
        showError(`文件总大小超过限制（${formatFileSize(MAX_FILE_SIZE)}）`);
        return;
    }

    showProcessingUI('正在压缩中...');
    compressFiles(files);
}

/**
 * 将多个文件 / 文件夹压缩为 ZIP。
 *
 * 仅打包所选文件，保留文件夹的相对路径结构。
 *
 * @param {FileList} files 待压缩的文件列表
 */
async function compressFiles(files) {
    const job = generation;
    try {
        // FileList 可能随文件选择框重置而改变，在异步操作前固定本次选择。
        files = Array.from(files);
        const paths = new Set();
        const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
        const entries = files.map(file => {
            const path = file.webkitRelativePath || file.name;
            if (paths.has(path)) throw new Error(`文件路径重复：${path}。请重命名后再试。`);
            paths.add(path);
            return { file, path };
        });

        const JSZip = await getZipEngine();
        const zip = new JSZip();
        let bytesRead = 0;
        for (const { file, path } of entries) {
            const content = await readFileAsArrayBuffer(file, loaded => {
                if (job === generation && totalBytes) updateProgress(50 * (bytesRead + loaded) / totalBytes);
            });
            if (job !== generation) return;
            zip.file(path, content, { createFolders: false });
            bytesRead += file.size;
            updateProgress(totalBytes ? 50 * bytesRead / totalBytes : 50);
        }

        const storeOnly = control('zip-method')?.value === 'store';
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: storeOnly ? 'STORE' : 'DEFLATE',
            ...(storeOnly ? {} : { compressionOptions: { level: 6 } })
        }, ({ percent }) => job === generation && updateProgress(Math.min(99, 50 + percent / 2)));
        if (job !== generation) return;
        updateProgress(100);

        // 单文件用原文件名，多文件 / 文件夹统一用 yasuo.zip
        const zipName = (files.length === 1 && !files[0].webkitRelativePath)
            ? files[0].name.replace(/\.[^/.]+$/, '') + '.zip'
            : 'yasuo.zip';

        extractedFiles = {
            [zipName]: {
                name: zipName, path: zipName,
                size: zipBlob.size, type: 'application/zip', content: zipBlob
            }
        };

        elements.fileName.textContent = zipName;
        elements.fileSize.textContent = formatFileSize(zipBlob.size);
        showResults('压缩结果');
    } catch (error) {
        if (job !== generation) return;
        console.error('压缩失败:', error);
        showError('压缩失败: ' + error.message);
        resetInterface();
    }
}

/**
 * 以 ArrayBuffer 形式读取文件。
 *
 * @param {File} file 待读取文件
 * @param {(loaded: number) => void} onProgress 已读取字节数回调
 * @returns {Promise<ArrayBuffer>} 文件内容
 */
function readFileAsArrayBuffer(file, onProgress) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onprogress = event => onProgress(event.loaded);
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error(`无法读取文件：${file.name}`));
        reader.onabort = () => reject(new Error(`读取已取消：${file.name}`));
        reader.readAsArrayBuffer(file);
    });
}

/* ==========================================================================
 * 压缩流程（图片 → 有损优化）
 * ========================================================================== */

/**
 * 处理待压缩图片：逐一校验，跳过无效文件而非整体拒绝。
 *
 * @param {FileList} files 待压缩的图片文件列表
 */
function handleImageCompressFiles(files) {
    try { checkBudget(files.length, Array.from(files).reduce((sum, file) => sum + file.size, 0)); }
    catch (error) { return showError(error.message); }
    const validFiles = [];
    const skipped = [];
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (!supportedTypes.includes(file.type)) {
            skipped.push(`${file.name}（格式不支持）`);
            continue;
        }
        if (file.size > MAX_FILE_SIZE) {
            skipped.push(`${file.name}（超过 ${formatFileSize(MAX_FILE_SIZE)}）`);
            continue;
        }

        validFiles.push(file);
    }

    if (validFiles.length === 0) {
        showError(`没有可下载的图片。请选择可读取的 JPG、PNG 或 WebP 文件。\n${skipped.join('\n')}`);
        return;
    }

    let options;
    try { options = readImageOptions(); }
    catch (error) { return showError(error.message); }
    showProcessingUI('正在压缩图片...');
    return compressImages(validFiles, options, skipped);
}

/**
 * 批量压缩图片，统计整体压缩率。
 *
 * @param {Array<File>} files 有效的图片文件数组
 */
async function compressImages(files, options, skipped = []) {
    const job = generation;
    try {
        const total = files.length;
        extractedFiles = Object.create(null);

        for (let i = 0; i < total; i++) {
            const file = files[i];
            let blob;
            try {
                blob = await compressImage(file, options);
            } catch (error) {
                if (job !== generation) return;
                skipped.push(`${file.name}（${error.message || '无法处理此图片'}）`);
            }
            if (job !== generation) return;
            updateProgress(((i + 1) / total) * 100);
            if (!blob) continue;

            // 生成带标识的新文件名，避免覆盖原文件
            const dotIndex = file.name.lastIndexOf('.');
            const nameWithoutExt = dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name;
            const ext = dotIndex > 0 ? file.name.slice(dotIndex) : '';
            const base = blob === file ? nameWithoutExt : `${nameWithoutExt}(yasuo.zip)`;
            let compressedName = base + ext;
            for (let n = 2; compressedName in extractedFiles; n++) compressedName = `${base} (${n})${ext}`;
            const saved = file.size - blob.size;
            const targetStatus = options.targetBytes ? (blob.size <= options.targetBytes ? ' · 已达到目标' : ' · 未达到目标') : '';
            const savingsText = `${formatFileSize(file.size)} → ${formatFileSize(blob.size)} · 节省 ${formatFileSize(saved)}（${file.size ? (100 * saved / file.size).toFixed(1) : 0}%）${blob === file ? ' · 保留原图' : ''}${targetStatus}`;

            extractedFiles[compressedName] = {
                name: compressedName,
                path: compressedName,
                size: blob.size,
                type: blob.type,
                content: blob,
                originalSize: file.size,
                savingsText
            };
        }

        const results = Object.values(extractedFiles);
        if (!results.length) {
            resetInterface();
            showError(`没有可下载的图片，已跳过 ${skipped.length} 个文件。请检查原图后重试。\n${skipped.join('\n')}`);
            return;
        }
        const totalOriginal = results.reduce((sum, file) => sum + file.originalSize, 0);
        const totalCompressed = results.reduce((sum, file) => sum + file.size, 0);
        const savings = totalOriginal - totalCompressed;
        const ratio = totalOriginal ? (100 * savings / totalOriginal).toFixed(1) : '0';

        elements.fileName.textContent = `已处理 ${results.length} 张图片 · 节省 ${formatFileSize(savings)}（${ratio}%）`;
        elements.fileSize.textContent = `${formatFileSize(totalOriginal)} → ${formatFileSize(totalCompressed)}`;
        const report = control('image-skips');
        report.hidden = !skipped.length;
        report.open = skipped.length > 0;
        control('image-skips-count').textContent = `已跳过 ${skipped.length} 个文件`;
        control('image-skips-list').textContent = skipped.join('\n');
        showResults('图片压缩结果');
    } catch (error) {
        if (job !== generation) return;
        console.error('图片压缩失败:', error);
        showError('图片压缩失败: ' + error.message);
        resetInterface();
    }
}

function syncImageOptions() {
    const mode = control('image-target').value;
    control('image-custom-row').hidden = mode !== 'custom';
    control('image-quality-row').hidden = mode !== 'manual';
    control('image-edge-row').hidden = !control('image-resize').checked;
}

function readImageOptions() {
    const integer = (value, max, label) => {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`${label}须为 1 至 ${max} 的整数`);
        return n;
    };
    const mode = control('image-target').value;
    const kb = mode === 'manual' ? 0 : integer(mode === 'custom' ? control('image-custom-kb').value : mode, 512000, '目标体积（KB）');
    return {
        targetBytes: kb * 1024,
        quality: Number(elements.qualitySlider.value) / 100,
        maxEdge: control('image-resize').checked ? integer(control('image-max-edge').value, 16384, '最长边（像素）') : 0
    };
}

async function compressImage(file, { quality, targetBytes, maxEdge }) {
    const url = URL.createObjectURL(file);
    const canvas = document.createElement('canvas');
    try {
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = url;
        });
        if (img.width * img.height > 40000000) throw new Error('图片超过 4000 万像素，请使用桌面工具');
        const scale = maxEdge ? Math.min(1, maxEdge / Math.max(img.width, img.height)) : 1;
        if (targetBytes && file.size <= targetBytes && scale === 1) return file;
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('浏览器无法创建画布');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const format = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
        const encode = q => new Promise((resolve, reject) => canvas.toBlob(blob => {
            if (!blob) reject(new Error('图片编码失败'));
            else resolve(blob.type === format ? blob : file);
        }, format, q));
        let best;
        if (format === 'image/png' || !targetBytes) {
            best = await encode(format === 'image/png' ? undefined : quality);
        } else {
            // 先确认质量边界，再寻找符合体积限制的最高整数质量。
            best = await encode(1);
            if (best.size > targetBytes) {
                const floor = await encode(0.01);
                if (floor.size < best.size) best = floor;
                if (floor.size <= targetBytes) {
                    let low = 2, high = 99;
                    while (low <= high) {
                        const mid = Math.floor((low + high) / 2);
                        const trial = await encode(mid / 100);
                        if (trial.size <= targetBytes) { best = trial; low = mid + 1; }
                        else high = mid - 1;
                    }
                }
            }
        }
        return best.size < file.size ? best : file;
    } finally {
        canvas.width = canvas.height = 0;
        URL.revokeObjectURL(url);
    }
}

/* ==========================================================================
 * 结果展示与下载
 * ========================================================================== */

const resultControl = control;
const selectedPaths = new Set();
let resultPaths = [];
let visiblePaths = [];
let resultDownloadBusy = false;

function resetResultBrowser() {
    selectedPaths.clear();
    resultPaths = [];
    visiblePaths = [];
    resultDownloadBusy = false;
    resultControl('result-search').value = '';
    elements.fileList.textContent = '';
}

function updateResultControls() {
    resultControl('result-status').textContent = `显示 ${visiblePaths.length} / ${resultPaths.length} 个文件 · 已选 ${selectedPaths.size} 个`;
    resultControl('select-visible-btn').disabled = visiblePaths.every(path => selectedPaths.has(path));
    resultControl('clear-selection-btn').disabled = !selectedPaths.size;
    resultControl('download-selected-btn').disabled = !selectedPaths.size || resultDownloadBusy;
    elements.downloadAllBtn.disabled = !resultPaths.length || resultDownloadBusy;
}

function displayFiles() {
    const query = resultControl('result-search').value.trim().toLowerCase();
    visiblePaths = resultPaths.filter(path => path.toLowerCase().includes(query));
    const rows = document.createDocumentFragment();
    for (const path of visiblePaths) rows.appendChild(createFileItem(extractedFiles[path]));
    elements.fileList.replaceChildren(rows);
    resultControl('result-empty').hidden = visiblePaths.length !== 0;
    resultControl('result-empty-text').textContent = resultPaths.length ? '没有匹配此路径的文件。' : '本次处理没有可下载的文件。';
    resultControl('reset-search-btn').hidden = !resultPaths.length;
    updateResultControls();
}

function bindResultControls() {
    const search = resultControl('result-search');
    listen(search, 'input', displayFiles);
    listen(resultControl('reset-search-btn'), 'click', () => {
        search.value = '';
        displayFiles();
        search.focus();
    });
    listen(resultControl('select-visible-btn'), 'click', () => {
        for (const path of visiblePaths) selectedPaths.add(path);
        displayFiles();
    });
    listen(resultControl('clear-selection-btn'), 'click', () => {
        selectedPaths.clear();
        displayFiles();
    });
    listen(resultControl('download-selected-btn'), 'click', () => downloadResultPaths([...selectedPaths], true));
    listen(resultControl('new-task-btn'), 'click', () => {
        resetInterface();
        const trigger = currentMode === 'extract' ? elements.uploadBtn : currentMode === 'compress' ? elements.selectFilesBtn : elements.selectImagesBtn;
        trigger.focus();
    });
}

/**
 * 创建单个文件列表项。
 *
 * 全程使用 DOM API 与 textContent 构建节点，避免压缩包内恶意文件名引发 XSS。
 *
 * @param {Object} file 文件信息对象
 * @returns {HTMLElement} 文件列表项节点
 */
function createFileItem(file) {
    const fileItem = document.createElement('li');
    fileItem.className = 'file-item';

    const selection = document.createElement('input');
    selection.type = 'checkbox';
    selection.checked = selectedPaths.has(file.path);
    selection.addEventListener('change', () => {
        if (selection.checked) selectedPaths.add(file.path);
        else selectedPaths.delete(file.path);
        updateResultControls();
    });
    // The wrapping label exposes the complete path to keyboard and screen-reader users.
    const nameCell = document.createElement('label');
    nameCell.className = 'file-name';
    const icon = document.createElement('i');
    icon.className = getFileIcon(file.name);
    icon.setAttribute('aria-hidden', 'true');
    const nameText = document.createElement('span');
    nameText.textContent = file.path;
    nameText.title = file.path;
    nameCell.append(selection, icon, nameText);

    const sizeCell = document.createElement('div');
    sizeCell.className = 'file-size';
    sizeCell.textContent = file.savingsText || formatFileSize(file.size);

    // 操作列：通过事件监听器绑定下载，避免内联 onclick 的路径引号问题
    const actionCell = document.createElement('div');
    actionCell.className = 'file-action';
    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.setAttribute('aria-label', `下载 ${file.path}`);
    const btnIcon = document.createElement('i');
    btnIcon.className = 'fas fa-download';
    btnIcon.setAttribute('aria-hidden', 'true');
    downloadBtn.append(btnIcon, document.createTextNode(' 下载'));
    downloadBtn.addEventListener('click', () => downloadFile(file));
    actionCell.appendChild(downloadBtn);

    fileItem.append(nameCell, sizeCell, actionCell);
    return fileItem;
}

/**
 * 触发单个文件下载。
 *
 * @param {Object} file 文件信息对象
 */
function downloadFile(file) {
    const url = URL.createObjectURL(file.content);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    root.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/**
 * 下载全部结果文件。单个文件直接下载，多个文件打包为 ZIP。
 */
function downloadAllFiles() {
    return downloadResultPaths(resultPaths, false);
}

async function downloadResultPaths(paths, selectedOnly) {
    if (!paths.length || resultDownloadBusy) return;
    const files = extractedFiles;
    if (paths.length === 1 && (!selectedOnly || !/[\\/]/.test(paths[0]))) {
        downloadFile(files[paths[0]]);
        return;
    }
    resultDownloadBusy = true;
    updateResultControls();
    const baseName = currentFile?.name.replace(/\.[^/.]+$/, '') || 'files';
    try {
        const JSZip = await getZipEngine();
        if (files !== extractedFiles) return;
        const zip = new JSZip();
        for (const path of paths) {
            if (/^[\\/]|^[a-z]:|[\x00-\x1f]/i.test(path) || path.split(/[\\/]/).includes('..')) {
                throw new Error('文件路径不安全，请单独下载该文件');
            }
            zip.file(path, files[path].content, { createFolders: false });
        }
        const content = await zip.generateAsync({ type: 'blob' });
        if (files === extractedFiles) downloadFile({ name: baseName + (selectedOnly ? '_selected.zip' : '_extracted.zip'), content });
    } catch (error) {
        if (files === extractedFiles) showError('创建 ZIP 失败：' + error.message);
    } finally {
        if (files === extractedFiles) {
            resultDownloadBusy = false;
            updateResultControls();
        }
    }
}

/* ==========================================================================
 * 事件绑定与初始化
 * ========================================================================== */

/**
 * 集中绑定页面所有交互事件。
 */
function listen(node, event, handler) {
    node?.addEventListener(event, handler, { signal: listeners.signal });
}

function initEventListeners() {
    const {
        dropArea, fileInput, uploadBtn, downloadAllBtn, errorClose,
        compressBtn, extractBtn, imageCompressBtn,
        selectFilesBtn, selectFolderBtn, selectImagesBtn,
        compressFilesInput, compressFileInput, imageCompressInput,
        qualitySlider, qualityValue
    } = elements;

    // 上传按钮：仅解压模式使用
    listen(uploadBtn, 'click', () => {
        if (currentMode === 'extract') fileInput.click();
    });
    listen(fileInput, 'change', handleFileSelect);

    // 拖拽上传
    ['dragover', 'dragleave', 'drop'].forEach(eventName => {
        listen(dropArea, eventName, handleDragEvent);
    });

    // 点击上传区空白处触发选择（图片模式仅支持拖拽 / 按钮）
    listen(dropArea, 'click', (e) => {
        if (!e.target.closest('button, input, label, .password-option') && currentMode === 'extract') {
            fileInput.click();
        }
    });

    // 通用按钮
    bindResultControls();
    listen(downloadAllBtn, 'click', downloadAllFiles);
    listen(errorClose, 'click', () => elements.errorPopup.close());
    listen(elements.errorPopup, 'close', () => elements.errorPopup.setAttribute('aria-hidden', 'true'));

    // 模式切换按钮
    listen(compressBtn, 'click', () => switchMode('compress', true));
    listen(extractBtn, 'click', () => switchMode('extract', true));
    listen(imageCompressBtn, 'click', () => switchMode('image-compress', true));

    // 文件 / 文件夹 / 图片选择按钮
    listen(selectFilesBtn, 'click', () => compressFilesInput.click());
    listen(selectFolderBtn, 'click', () => compressFileInput.click());
    listen(selectImagesBtn, 'click', () => imageCompressInput.click());
    listen(compressFilesInput, 'change', handleCompressFilesSelect);
    listen(compressFileInput, 'change', handleCompressFolderSelect);
    listen(imageCompressInput, 'change', handleImageCompressSelect);

    // 压缩质量滑块
    listen(qualitySlider, 'input', (e) => {
        qualityValue.textContent = e.target.value;
    });

}

/**
 * 处理拖拽事件，按当前模式分派文件。
 *
 * @param {DragEvent} e 拖拽事件对象
 */
function handleDragEvent(e) {
    e.preventDefault();
    e.stopPropagation();

    const { dropArea } = elements;

    if (e.type === 'dragover') {
        dropArea.classList.add('drag-over');
    } else if (e.type === 'dragleave') {
        dropArea.classList.remove('drag-over');
    } else if (e.type === 'drop') {
        dropArea.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;

        if (currentMode === 'extract') {
            handleFiles(files);
        } else if (currentMode === 'compress') {
            handleCompressFiles(files);
        } else if (currentMode === 'image-compress') {
            handleImageCompressFiles(files);
        }
    }
}

/** 文件选择框变化：解压模式 */
function handleFileSelect(e) {
    if (e.target.files.length) handleFiles(e.target.files);
}

/** 文件选择框变化：多文件压缩 */
function handleCompressFilesSelect(e) {
    if (e.target.files.length) handleCompressFiles(e.target.files);
}

/** 文件选择框变化：文件夹压缩 */
function handleCompressFolderSelect(e) {
    if (e.target.files.length) handleCompressFiles(e.target.files);
}

/** 文件选择框变化：图片压缩 */
function handleImageCompressSelect(e) {
    if (e.target.files.length) handleImageCompressFiles(e.target.files);
}

initEventListeners();
listen(elements.imageCompressButtons, 'change', syncImageOptions);
syncImageOptions();
switchMode(initialMode);
return {
    setMode: switchMode,
    dispose() {
        disposed = true;
        generation++;
        extractedFiles = Object.create(null);
        listeners.abort();
    }
};
}
