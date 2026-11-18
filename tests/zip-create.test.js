import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { isolatedWorkspace } from './workspace-fixture.js'

const file = (path, bytes) => ({ name: path.split('/').at(-1), webkitRelativePath: path, size: bytes.length, bytes })

function setup(files, failGeneration = false, method = 'balanced') {
  const optionsUsed = []
  const entries = [], progress = [], errors = []
  class Reader {
    readAsArrayBuffer(file) {
      this.onprogress({ loaded: Math.floor(file.size / 2) })
      this.result = Uint8Array.from(file.bytes).buffer
      this.onload()
    }
  }
  class Zip {
    file(path, data, options) { entries.push({ path, bytes: [...new Uint8Array(data)], folders: options.createFolders }) }
    async generateAsync(options, onUpdate) {
      optionsUsed.push(options);
      onUpdate({ percent: 50 }); onUpdate({ percent: 100 })
      if (failGeneration) throw Error('generation failed')
      return new Blob(['ZIP'])
    }
  }
  const context = vm.createContext({ files, FileReader: Reader, Zip, progress, errors,
    document: { getElementById: id => id === 'zip-method' ? { value: method } : {}, addEventListener() {} },
    window: { addEventListener() {} }, console: { error() {} } })
  const inspect = isolatedWorkspace(context)
  const run = () => inspect(`
    window.JSZip = Zip; updateProgress = n => progress.push(n);
    showResults = () => {}; resetInterface = () => {}; showError = e => errors.push(e);
    compressFiles(files)`)
  return { entries, progress, errors, optionsUsed, run }
}

test('ZIP contains only selected paths and exact binary data; progress tracks reading and generation', async () => {
  const files = [file('资料/a.bin', [0, 255, 0, 13]), file('其他/a.bin', []), file('在线解压缩工具(yasuo.zip).txt', [254, 1, 0, 2])]
  const app = setup(files)
  await app.run()
  assert.deepEqual(app.errors, [])
  assert.deepEqual(app.entries, files.map(f => ({ path: f.webkitRelativePath, bytes: f.bytes, folders: false })))
  assert.deepEqual(app.progress, [12.5, 25, 25, 25, 37.5, 50, 75, 99, 100])
})

test('store mode adds no compression option for media and other precompressed files', async () => {
  const app = setup([file('photos/photo.jpg', [1, 2, 3])], false, 'store')
  await app.run()
  assert.equal(app.optionsUsed[0].compression, 'STORE')
  assert.equal('compressionOptions' in app.optionsUsed[0], false)
})

test('duplicate ZIP paths produce an actionable error, not a partial archive', async () => {
  const app = setup([file('a', [0]), file('a', [1])])
  await app.run()
  assert.match(app.errors[0], /路径重复：a/)
  assert.deepEqual(app.entries, [])
})

test('generation failure never reports completion even if JSZip notified 100%', async () => {
  const app = setup([file('empty', [])], true)
  await app.run()
  assert.match(app.errors[0], /generation failed/)
  assert.equal(Math.max(...app.progress), 99)
})
