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

/** 快速通道支持的解压格式（由 JSZip / pako / 原生解析器处理） */
const FAST_EXTRACT_FORMATS = ['zip', 'gz', 'tar'];

/** 交由 libarchive.js 处理的扩展格式 */
const LIBARCHIVE_FORMATS = ['rar', '7z', 'bz2', 'xz', 'tgz', 'tbz2', 'txz'];

/** 全部支持的解压扩展名（用于上传校验与 accept 属性保持一致） */
const SUPPORTED_EXTRACT_FORMATS = [...FAST_EXTRACT_FORMATS, ...LIBARCHIVE_FORMATS];

/** libarchive.js 引擎最长等待时间（毫秒），超时后提示用户重试 */
const LIBARCHIVE_LOAD_TIMEOUT = 15000;

/* ==========================================================================
 * DOM 元素缓存
 * ========================================================================== */

/** 页面关键 DOM 节点的集中缓存，避免重复查询 */
const elements = {
    dropArea: document.getElementById('drop-area'),
    fileInput: document.getElementById('file-input'),
    uploadBtn: document.getElementById('upload-btn'),
    uploadSection: document.getElementById('upload-section'),
    processingSection: document.getElementById('processing-section'),
    resultSection: document.getElementById('result-section'),
    progressBar: document.getElementById('progress-bar'),
    progressText: document.getElementById('progress-text'),
    processingText: document.getElementById('processing-text'),
    fileList: document.getElementById('file-list'),
    fileName: document.getElementById('file-name'),
    fileSize: document.getElementById('file-size'),
    resultTitle: document.getElementById('result-title'),
    downloadAllBtn: document.getElementById('download-all-btn'),
    errorPopup: document.getElementById('error-popup'),
    errorMessage: document.getElementById('error-message'),
    errorClose: document.getElementById('error-close'),
    compressBtn: document.getElementById('compress-btn'),
    extractBtn: document.getElementById('extract-btn'),
    imageCompressBtn: document.getElementById('image-compress-btn'),
    compressFileInput: document.getElementById('compress-file-input'),
    compressFilesInput: document.getElementById('compress-files-input'),
    imageCompressInput: document.getElementById('image-compress-input'),
    selectFilesBtn: document.getElementById('select-files-btn'),
    selectFolderBtn: document.getElementById('select-folder-btn'),
    selectImagesBtn: document.getElementById('select-images-btn'),
    uploadTitle: document.getElementById('upload-title'),
    uploadDescription: document.getElementById('upload-description'),
    uploadButtons: document.getElementById('upload-buttons'),
    compressButtons: document.getElementById('compress-buttons'),
    imageCompressButtons: document.getElementById('image-compress-buttons'),
    passwordOption: document.getElementById('password-option'),
    archivePassword: document.getElementById('archive-password'),
    extractIcon: document.getElementById('extract-icon'),
    compressIcon: document.getElementById('compress-icon'),
    imageCompressIcon: document.getElementById('image-compress-icon'),
    qualitySlider: document.getElementById('quality-slider'),
    qualityValue: document.getElementById('quality-value'),
    themeToggle: document.getElementById('theme-toggle'),
    year: document.getElementById('year')
};

/* ==========================================================================
 * 应用状态
 * ========================================================================== */

/** 当前解压 / 压缩产生的结果文件集合，键为文件路径 */
let extractedFiles = {};

/** 当前正在处理的用户原始文件 */
let currentFile = null;

/** 当前工作模式：'compress' | 'extract' | 'image-compress' */
let currentMode = 'compress';

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
    const result = {};

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
function showProcessingUI(text) {
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
    const { processingSection, resultSection, resultTitle } = elements;
    if (resultTitle) resultTitle.textContent = title;

    displayFiles();
    processingSection.style.display = 'none';
    resultSection.style.display = 'block';
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
}

/**
 * 弹出错误提示框。
 *
 * @param {string} message 错误描述
 */
function showError(message) {
    const { errorMessage, errorPopup } = elements;
    errorMessage.textContent = message;
    errorPopup.style.display = 'flex';
}

/**
 * 将界面重置为初始的上传状态，并清空所有文件输入框。
 */
function resetInterface() {
    const {
        uploadSection, processingSection, resultSection,
        fileInput, compressFilesInput, compressFileInput, imageCompressInput
    } = elements;

    uploadSection.style.display = 'block';
    processingSection.style.display = 'none';
    resultSection.style.display = 'none';

    fileInput.value = '';
    if (compressFilesInput) compressFilesInput.value = '';
    if (compressFileInput) compressFileInput.value = '';
    if (imageCompressInput) imageCompressInput.value = '';
}

/**
 * 切换工具模式（压缩 / 解压 / 图片压缩），同步按钮状态、文案与无障碍属性。
 *
 * @param {'compress'|'extract'|'image-compress'} mode 目标模式
 */
function switchMode(mode) {
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
        uploadDescription.innerHTML = '拖拽文件到此处上传<br>(支持多种文件格式，最大500MB)';
        uploadButtons.style.display = 'none';
        compressButtons.style.display = 'flex';
        imageCompressButtons.style.display = 'none';
        extractIcon.style.display = 'none';
        compressIcon.style.display = 'block';
        imageCompressIcon.style.display = 'none';
    } else if (mode === 'extract') {
        uploadTitle.textContent = '选择压缩文件进行解压';
        uploadDescription.innerHTML = '拖拽压缩文件到此处上传<br>(支持ZIP/RAR/7Z/GZ/TAR/BZ2/XZ，最大500MB)';
        uploadButtons.style.display = 'flex';
        compressButtons.style.display = 'none';
        imageCompressButtons.style.display = 'none';
        extractIcon.style.display = 'block';
        compressIcon.style.display = 'none';
        imageCompressIcon.style.display = 'none';
        fileInput.accept = '.zip,.rar,.7z,.gz,.tar,.bz2,.xz,.tgz,.tar.gz,.tar.bz2,.tar.xz';
    } else if (mode === 'image-compress') {
        uploadTitle.textContent = '选择图片进行压缩';
        uploadDescription.innerHTML = '拖拽图片到此处上传<br>(支持JPG、PNG、WebP格式，最大500MB)';
        uploadButtons.style.display = 'none';
        compressButtons.style.display = 'none';
        imageCompressButtons.style.display = 'flex';
        extractIcon.style.display = 'none';
        compressIcon.style.display = 'none';
        imageCompressIcon.style.display = 'block';
    }

    resetInterface();
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
    try {
        extractedFiles = {};
        const type = getArchiveType(file.name);
        const password = elements.archivePassword?.value?.trim() || '';

        switch (type) {
            case 'zip':
                await extractZip(file);
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

        showResults('解压结果');
    } catch (error) {
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
    try {
        const zip = await new JSZip().loadAsync(file, {
            decodeFileName: smartDecodeFileName
        });

        const entries = Object.entries(zip.files);
        const total = entries.length;

        for (let i = 0; i < total; i++) {
            const [path, zipEntry] = entries[i];

            // 目录项直接跳过
            if (!zipEntry.dir) {
                const content = await zipEntry.async('blob');
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
    try {
        if (typeof pako === 'undefined') {
            throw new Error('GZIP 解压库未加载，请刷新页面重试');
        }

        const compressed = new Uint8Array(await file.arrayBuffer());
        const decompressed = pako.ungzip(compressed);

        // 去掉 .gz 后缀还原原始文件名
        let originalName = file.name;
        if (originalName.toLowerCase().endsWith('.gz')) {
            originalName = originalName.slice(0, -3);
        }

        const blob = new Blob([decompressed]);
        extractedFiles[originalName] = {
            name: originalName,
            path: originalName,
            size: blob.size,
            type: getMimeType(originalName),
            content: blob
        };

        updateProgress(100);
    } catch (error) {
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
    try {
        const arrayBuffer = await file.arrayBuffer();
        const view = new DataView(arrayBuffer);
        let offset = 0;

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
            const fileSize = parseInt(sizeStr.trim(), 8) || 0;

            // 156 字节是文件类型标识（0 / '0' 表示普通文件）
            const fileType = view.getUint8(offset + 156);
            offset += 512; // 跳过头部块

            // 仅提取有内容的普通文件，跳过目录项
            if (fileSize > 0 && !fileName.endsWith('/') && (fileType === 0 || fileType === 48)) {
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
        console.error('TAR解压失败:', error);
        throw new Error('TAR解压失败，可能是文件损坏或格式不支持');
    }
}

/**
 * 等待 libarchive.js（WASM 引擎）加载完成。
 *
 * 由于引擎通过 CDN 以 ES Module 异步加载，这里采用轮询方式等待就绪。
 *
 * @returns {Promise<Object>} libarchive 的 Archive 类
 */
async function waitForLibArchive() {
    const start = Date.now();
    while (!window.LibArchive) {
        if (Date.now() - start > LIBARCHIVE_LOAD_TIMEOUT) {
            throw new Error('多格式解压引擎加载超时，请检查网络后重试');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return window.LibArchive;
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
            totalEntries = filesArray.filter(item => item.file && item.file.size > 0).length;
        } catch (error) {
            // 部分格式不支持预列举，回落为不确定进度的平滑递增
            console.warn('无法预取文件列表，进度将以递增方式显示:', error);
        }

        let extractedCount = 0;
        const tree = await archive.extractFiles((entry) => {
            // 单文件解压完成回调：即时反馈进度
            if (entry && entry.path) {
                extractedCount++;
                const percent = totalEntries > 0
                    ? (extractedCount / totalEntries) * 100
                    : Math.min(90, extractedCount * 5);
                updateProgress(Math.min(99, percent));
            }
        });

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
 * 保留文件夹的相对路径结构，并在包内附加说明文本。
 *
 * @param {FileList} files 待压缩的文件列表
 */
async function compressFiles(files) {
    try {
        const zip = new JSZip();
        const total = files.length;

        for (let i = 0; i < total; i++) {
            const file = files[i];
            const filePath = file.webkitRelativePath || file.name;
            const content = await readFileAsArrayBuffer(file);

            zip.file(filePath, content);
            updateProgress(((i + 1) / total) * 100);
        }

        zip.file('在线解压缩工具(yasuo.zip).txt',
            '本压缩包由【在线解压缩工具yasuo.zip】在线压缩，感谢您的使用！');

        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });

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
        console.error('压缩失败:', error);
        showError('压缩失败: ' + error.message);
        resetInterface();
    }
}

/**
 * 以 ArrayBuffer 形式读取文件。
 *
 * @param {File} file 待读取文件
 * @returns {Promise<ArrayBuffer>} 文件内容
 */
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
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
        showError('没有找到有效的图片文件\n支持的格式：JPG、PNG、WebP');
        return;
    }

    // 部分文件被跳过时给出汇总提示，但不阻断有效文件处理
    if (skipped.length > 0) {
        showError(`已跳过 ${skipped.length} 个无效文件：\n${skipped.join('\n')}\n\n有效文件将正常处理`);
    }

    showProcessingUI('正在压缩图片...');
    compressImages(validFiles);
}

/**
 * 批量压缩图片，统计整体压缩率。
 *
 * @param {Array<File>} files 有效的图片文件数组
 */
async function compressImages(files) {
    try {
        const quality = parseInt(elements.qualitySlider.value, 10) / 100;
        const total = files.length;
        extractedFiles = {};

        for (let i = 0; i < total; i++) {
            const file = files[i];
            const blob = await compressImage(file, quality);

            // 生成带标识的新文件名，避免覆盖原文件
            const dotIndex = file.name.lastIndexOf('.');
            const nameWithoutExt = dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name;
            const ext = dotIndex > 0 ? file.name.slice(dotIndex) : '';
            const compressedName = `${nameWithoutExt}(yasuo.zip)${ext}`;

            extractedFiles[compressedName] = {
                name: compressedName,
                path: compressedName,
                size: blob.size,
                type: blob.type,
                content: blob,
                originalSize: file.size,
                compressionRatio: ((file.size - blob.size) / file.size * 100).toFixed(1)
            };

            updateProgress(((i + 1) / total) * 100);
        }

        const totalOriginal = files.reduce((sum, file) => sum + file.size, 0);
        const totalCompressed = Object.values(extractedFiles).reduce((sum, file) => sum + file.size, 0);
        const ratio = ((totalOriginal - totalCompressed) / totalOriginal * 100).toFixed(1);

        elements.fileName.textContent = `${files.length}个图片文件 (压缩率: ${ratio}%)`;
        elements.fileSize.textContent = `${formatFileSize(totalCompressed)} (原始: ${formatFileSize(totalOriginal)})`;
        showResults('图片压缩结果');
    } catch (error) {
        console.error('图片压缩失败:', error);
        showError('图片压缩失败: ' + error.message);
        resetInterface();
    }
}

/**
 * 使用 Canvas 压缩单张图片，输出格式与原格式一致。
 *
 * @param {File} file 图片文件
 * @param {number} quality 压缩质量（0-1）
 * @returns {Promise<Blob>} 压缩后的图片 Blob
 */
function compressImage(file, quality) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = function () {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            // 保持原始格式，仅 JPEG/WebP 对质量参数敏感
            let outputFormat = 'image/jpeg';
            if (file.type === 'image/png') outputFormat = 'image/png';
            else if (file.type === 'image/webp') outputFormat = 'image/webp';

            canvas.toBlob(
                (blob) => (blob ? resolve(blob) : reject(new Error('图片压缩失败'))),
                outputFormat,
                quality
            );
            URL.revokeObjectURL(img.src);
        };

        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            reject(new Error('图片加载失败'));
        };

        img.src = URL.createObjectURL(file);
    });
}

/* ==========================================================================
 * 结果展示与下载
 * ========================================================================== */

/**
 * 渲染处理结果文件列表。
 */
function displayFiles() {
    const { fileList } = elements;
    fileList.innerHTML = '';

    Object.keys(extractedFiles).sort().forEach(path => {
        fileList.appendChild(createFileItem(extractedFiles[path]));
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
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';

    // 文件名列
    const nameCell = document.createElement('div');
    nameCell.className = 'file-name';
    const icon = document.createElement('i');
    icon.className = getFileIcon(file.name);
    icon.setAttribute('aria-hidden', 'true');
    const nameText = document.createElement('span');
    nameText.textContent = file.path;
    nameText.title = file.path;
    nameCell.append(icon, nameText);

    // 大小列（图片压缩结果附带压缩率）
    const sizeCell = document.createElement('div');
    sizeCell.className = 'file-size';
    sizeCell.textContent = formatFileSize(file.size);
    if (file.originalSize && file.compressionRatio) {
        const ratio = document.createElement('small');
        ratio.style.color = 'var(--secondary-color)';
        ratio.textContent = ` (-${file.compressionRatio}%)`;
        sizeCell.appendChild(ratio);
    }

    // 操作列：通过事件监听器绑定下载，避免内联 onclick 的路径引号问题
    const actionCell = document.createElement('div');
    actionCell.className = 'file-action';
    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
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
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * 下载全部结果文件。单个文件直接下载，多个文件打包为 ZIP。
 */
async function downloadAllFiles() {
    try {
        const keys = Object.keys(extractedFiles);
        if (keys.length === 0) return;

        if (keys.length === 1) {
            downloadFile(extractedFiles[keys[0]]);
            return;
        }

        const zip = new JSZip();
        keys.forEach(path => zip.file(path, extractedFiles[path].content));
        const zipBlob = await zip.generateAsync({ type: 'blob' });

        const zipName = currentFile
            ? currentFile.name.replace(/\.[^/.]+$/, '') + '_extracted.zip'
            : 'files.zip';
        downloadFile({ name: zipName, content: zipBlob });
    } catch (error) {
        console.error('创建ZIP失败:', error);
        showError('创建ZIP失败: ' + error.message);
    }
}

/* ==========================================================================
 * 事件绑定与初始化
 * ========================================================================== */

/**
 * 集中绑定页面所有交互事件。
 */
function initEventListeners() {
    const {
        dropArea, fileInput, uploadBtn, downloadAllBtn, errorClose,
        compressBtn, extractBtn, imageCompressBtn,
        selectFilesBtn, selectFolderBtn, selectImagesBtn,
        compressFilesInput, compressFileInput, imageCompressInput,
        qualitySlider, qualityValue
    } = elements;

    // 上传按钮：仅解压模式使用
    uploadBtn.addEventListener('click', () => {
        if (currentMode === 'extract') fileInput.click();
    });
    fileInput.addEventListener('change', handleFileSelect);

    // 拖拽上传
    ['dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, handleDragEvent);
    });

    // 点击上传区空白处触发选择（图片模式仅支持拖拽 / 按钮）
    dropArea.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON' && !e.target.closest('button') && currentMode === 'extract') {
            fileInput.click();
        }
    });

    // 通用按钮
    downloadAllBtn.addEventListener('click', downloadAllFiles);
    errorClose.addEventListener('click', () => { elements.errorPopup.style.display = 'none'; });

    // 模式切换按钮
    compressBtn?.addEventListener('click', () => switchMode('compress'));
    extractBtn?.addEventListener('click', () => switchMode('extract'));
    imageCompressBtn?.addEventListener('click', () => switchMode('image-compress'));

    // 文件 / 文件夹 / 图片选择按钮
    selectFilesBtn?.addEventListener('click', () => compressFilesInput.click());
    selectFolderBtn?.addEventListener('click', () => compressFileInput.click());
    selectImagesBtn?.addEventListener('click', () => imageCompressInput.click());
    compressFilesInput?.addEventListener('change', handleCompressFilesSelect);
    compressFileInput?.addEventListener('change', handleCompressFolderSelect);
    imageCompressInput?.addEventListener('change', handleImageCompressSelect);

    // 压缩质量滑块
    qualitySlider?.addEventListener('input', (e) => {
        qualityValue.textContent = e.target.value;
    });

    // 主题切换
    elements.themeToggle?.addEventListener('click', toggleTheme);

    // 页脚年份
    if (elements.year) {
        elements.year.textContent = String(new Date().getFullYear());
    }

    // 根据当前主题同步切换按钮图标
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const icon = elements.themeToggle?.querySelector('i');
    if (icon) {
        icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        elements.themeToggle?.setAttribute('aria-label', isDark ? '切换到浅色主题' : '切换到深色主题');
    }
}

/**
 * 切换深浅主题，并持久化用户选择到 localStorage。
 * 启动时已根据系统偏好或历史选择设置 data-theme，这里只做反转。
 */
function toggleTheme() {
    const root = document.documentElement;
    const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';

    root.setAttribute('data-theme', next);
    localStorage.setItem('yasuo-theme', next);

    const icon = elements.themeToggle?.querySelector('i');
    if (icon) {
        icon.className = next === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        elements.themeToggle.setAttribute('aria-label', next === 'dark' ? '切换到浅色主题' : '切换到深色主题');
    }
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

// 页面初始化：DOM 就绪后绑定事件（默认即为压缩模式）
document.addEventListener('DOMContentLoaded', initEventListeners);
