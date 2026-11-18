import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { isolatedWorkspace } from './workspace-fixture.js'

function workspace(paths = ['Alpha/report.txt', 'Beta/report.txt', 'notes.txt']) {
  const nodes = new Map(), zipEntries = [], downloads = [], errors = []
  let focused, finish
  function node(tag) {
    return { tag, children: [], listeners: {}, style: {}, classList: {toggle() {}}, value: '',
      append(...children) { this.children.push(...children) }, appendChild(child) { this.append(child) },
      replaceChildren(fragment) { this.children = fragment.children },
      setAttribute(key, value) { this[key] = value }, getAttribute(key) { return this[key] },
      addEventListener(event, fn) { this.listeners[event] = fn }, focus() { focused = this },
    }
  }
  const get = id => { if (!nodes.has(id)) nodes.set(id, node(id)); return nodes.get(id) }
  class Zip {
    file(path, content) { zipEntries.push([path, content]) }
    generateAsync() { return new Promise(resolve => { finish = resolve }) }
  }
  const ctx = vm.createContext({ paths, downloads, errors, window: { JSZip: Zip, addEventListener() {} },
    document: { getElementById: get, createElement: node, createTextNode: node,
      createDocumentFragment: () => node('fragment'), addEventListener() {} } })
  const run = isolatedWorkspace(ctx)
  run(`downloadFile = f => downloads.push(f); showError = e => errors.push(e); currentMode = 'compress'; bindResultControls();
    for (const path of paths) extractedFiles[path] = { name: path.split('/').pop(), path, size: 8, content: path };
    showResults('结果')`)
  const click = id => get(id).listeners.click()
  const filter = query => { get('result-search').value = query; get('result-search').listeners.input() }
  const rows = () => get('file-list').children
  return { get, run, click, filter, rows, focused: () => focused, finish: () => finish('ZIP'), zipEntries, downloads, errors }
}

test('filter full paths, retain hidden selections, clear all and start fresh', () => {
  const app = workspace(), { get, click, filter, rows } = app
  assert.equal(app.focused(), get('result-title'))
  assert.equal(get('download-selected-btn').disabled, true)
  filter(' ALPHA/ '); assert.equal(rows().length, 1)
  click('select-visible-btn'); filter('Beta')
  const box = rows()[0].children[0].children[0]; box.checked = true; box.listeners.change()
  filter('no such path'); assert.equal(get('result-empty').hidden, false)
  assert.equal(get('select-visible-btn').disabled, true)
  assert.match(get('result-status').textContent, /0 \/ 3.*已选 2/)
  click('reset-search-btn'); assert.equal(app.focused(), get('result-search'))
  assert.deepEqual(rows().map(row => row.children[0].children[0].checked), [true, true, false])
  filter('notes'); click('clear-selection-btn'); assert.equal(get('download-selected-btn').disabled, true)
  click('select-visible-btn'); click('new-task-btn'); assert.equal(get('result-search').value, '')
  assert.equal(app.run('selectedPaths.size'), 0); assert.equal(app.focused(), get('select-files-btn'))
})

test('selected ZIP contains only matching selections and keeps full paths', async () => {
  const app = workspace()
  app.filter('report'); app.click('select-visible-btn'); app.filter('notes')
  const pending = app.click('download-selected-btn'); await Promise.resolve()
  assert.equal(app.get('download-all-btn').disabled, true)
  assert.equal(app.get('download-selected-btn').disabled, true)
  assert.deepEqual(app.zipEntries, ['Alpha/report.txt', 'Beta/report.txt'].map(p => [p, p]))
  app.finish(); await pending
  assert.equal(app.downloads[0].name, 'files_selected.zip'); assert.equal(app.get('download-selected-btn').disabled, false)
})

test('nested single selection keeps its path; leaving results cancels stale download', async () => {
  const app = workspace(); app.filter('Beta'); app.click('select-visible-btn')
  const pending = app.click('download-selected-btn'); await Promise.resolve()
  assert.deepEqual(app.zipEntries, [['Beta/report.txt', 'Beta/report.txt']]); app.click('new-task-btn')
  app.finish(); await pending; assert.deepEqual(app.downloads, [])
})

test('empty results have no download actions and unsafe ZIP paths are rejected', async () => {
  const empty = workspace([])
  assert.equal(empty.get('reset-search-btn').hidden, true); assert.equal(empty.get('download-all-btn').disabled, true)
  const app = workspace(['../outside']); app.click('select-visible-btn'); await app.click('download-selected-btn')
  assert.match(app.errors[0], /文件路径/); assert.deepEqual(app.zipEntries, []); assert.deepEqual(app.downloads, [])
})
