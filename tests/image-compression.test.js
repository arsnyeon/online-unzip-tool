import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { isolatedWorkspace } from './workspace-fixture.js'

function fixture({ sizeAt = q => 100 + Math.round(q * 1000), size = 2000, type = 'image/jpeg' } = {}) {
  const calls = [], draws = [], nodes = new Map()
  const get = id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id) }
  const file = { size, type, name: 'same.jpg' }
  const canvas = { getContext: () => ({ drawImage: (_, x, y, w, h) => draws.push([w, h]) }),
    toBlob(cb, type, q) { calls.push(q); cb({ size: sizeAt(q), type }) } }
  const context = vm.createContext({ file, document: { createElement: () => canvas, addEventListener() {}, getElementById: get },
    window: { addEventListener() {} }, URL: { createObjectURL: file => `blob:${file.name}`, revokeObjectURL() {} },
    Image: class { width = 1200; height = 800; set src(value) { value === 'blob:broken.png' ? this.onerror() : this.onload() } } })
  const run = isolatedWorkspace(context)
  return { calls, draws, get, file, run, compress: options => run(`compressImage(file, ${JSON.stringify(options)})`) }
}

test('target chooses the highest fitting JPEG quality in bounded passes without resizing', async () => {
  const f = fixture(); assert.equal((await f.compress({ targetBytes: 710 })).size, 710)
  assert.deepEqual(f.draws, [[1200, 800]]); assert.ok(f.calls.length <= 9)
})
test('already-fitting input stays byte-identical; explicit resize keeps aspect ratio', async () => {
  const f = fixture({ type: 'image/webp' }); assert.equal(await f.compress({ targetBytes: 3000 }), f.file)
  assert.equal(f.calls.length, 0)
  const resized = await f.compress({ targetBytes: 3000, maxEdge: 300 })
  assert.equal(resized.type, 'image/webp'); assert.deepEqual(f.draws, [[300, 200]])
})
test('PNG encodes once without lossy quality; equal or larger encodes retain original', async () => {
  for (const bytes of [2000, 2100]) {
    const f = fixture({ type: 'image/png', sizeAt: () => bytes }); assert.equal(await f.compress({ targetBytes: 100 }), f.file)
    assert.deepEqual(f.calls, [undefined])
  }
})
test('unattainable target reports actual savings and preserves duplicate basenames', async () => {
  const f = fixture(); f.run('showResults = () => {}; updateProgress = () => {}')
  await f.run('compressImages([file,file], { targetBytes: 50 })')
  const rows = f.run('Object.values(extractedFiles)'); assert.equal(rows.length, 2)
  assert.notEqual(rows[0].path, rows[1].path); assert.equal(rows[0].size, 110)
  assert.match(rows[0].savingsText, /节省.*94\.5%.*未达到目标/)
})
test('mixed batch keeps good images on both sides of a decode failure and counts only their bytes', async () => {
  const f = fixture(); f.get('image-target').value = '100'
  f.run('globalThis.progress = []; showProcessingUI = () => {}; showResults = () => {}; updateProgress = p => progress.push(p)')
  await f.run(`handleImageCompressFiles([file, {name:'broken.png', size:10, type:'image/png'}, file, {name:'notes.txt', size:400, type:'text/plain'}])`)
  assert.deepEqual(Array.from(f.run('Object.keys(extractedFiles)')), ['same.jpg', 'same (2).jpg'])
  assert.equal(f.get('file-size').textContent, f.run('`${formatFileSize(4000)} → ${formatFileSize(4000)}`'))
  assert.match(f.get('file-name').textContent, /已处理 2 张图片 · 节省 0/)
  assert.equal(f.get('image-skips-count').textContent, '已跳过 2 个文件')
  assert.match(f.get('image-skips-list').textContent, /broken\.png（图片加载失败）/)
  assert.match(f.get('image-skips-list').textContent, /notes\.txt（格式不支持）/)
  assert.equal(f.get('image-skips').open, true); assert.equal(f.get('image-skips').hidden, false)
  assert.equal(f.run('progress.length'), 3); assert.equal(f.run('progress.at(-1)'), 100)
})
test('all failed images give a reason per file, return to selection and never show downloads', async () => {
  const f = fixture(); f.get('image-target').value = 'manual'
  f.run(`globalThis.message = ''; globalThis.reset = false; globalThis.resultsShown = false; showProcessingUI = updateProgress = () => {};
    resetInterface = () => { reset = true }; showError = text => { message = text }; showResults = () => { resultsShown = true }`)
  await f.run(`handleImageCompressFiles([{name:'broken.png', size:1000, type:'image/png'}, {name:'notes.txt', size:1, type:'text/plain'}])`)
  assert.match(f.run('message'), /没有可下载的图片，已跳过 2 个文件/)
  assert.match(f.run('message'), /broken\.png（图片加载失败）/); assert.match(f.run('message'), /notes\.txt（格式不支持）/)
  assert.equal(f.run('reset'), true); assert.equal(f.run('resultsShown'), false)
  assert.equal(f.run('Object.keys(extractedFiles).length'), 0)
})
test('preset, custom, manual and opt-in resize settings validate active controls only', () => {
  const f = fixture(); f.get('quality-slider').value = '50'; f.get('image-max-edge').value = '-1'
  f.get('image-target').value = 'manual'; assert.equal(f.run('readImageOptions().quality'), 0.5)
  assert.equal(f.run('readImageOptions().maxEdge'), 0)
  f.get('image-target').value = '200'; assert.equal(f.run('readImageOptions().targetBytes'), 204800)
  f.get('image-target').value = 'custom'; f.get('image-custom-kb').value = '5'; assert.equal(f.run('readImageOptions().targetBytes'), 5120)
  f.get('image-custom-kb').value = ''; assert.throws(() => f.run('readImageOptions()'), /目标体积/)
  f.get('image-target').value = 'manual'; f.get('image-resize').checked = true
  assert.throws(() => f.run('readImageOptions()'), /最长边/)
})
