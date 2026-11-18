import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { isolatedWorkspace } from './workspace-fixture.js'

import { mountWorkspace } from '../js/script.js'

// Exercise the controller without downloading CDN engines or starting a server.
function load(search = '') {
  const nodes = new Map(), events = new Map()
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, {
      style: {}, classList: { toggle() {} }, listeners: {}, clicks: 0,
      setAttribute() {}, querySelector() {}, click() { this.clicks++ },
      addEventListener(name, cb) { this.listeners[name] = cb },
    })
    return nodes.get(id)
  }
  const context = vm.createContext({ document: {
    getElementById: get, documentElement: { getAttribute() {} },
    addEventListener: (name, cb) => events.set(name, cb),
  }, location: { search }, window: { addEventListener() {} }, URLSearchParams, console })
  const inspect = isolatedWorkspace(context)
  return { get, ready: () => inspect('initEventListeners(); switchMode(' + JSON.stringify(new URLSearchParams(search).get('mode')) + ')'), run: inspect }
}

test('extension aliases pass the same validation as compound names', () => {
  const { run } = load()
  for (const name of ['a.TGZ', 'a.tar.gz', 'a.tbz2', 'a.tar.bz2', 'a.txz', 'a.tar.xz']) {
    assert.equal(run(`SUPPORTED_EXTRACT_FORMATS.includes(getArchiveType('${name}'))`), true)
  }
})

test('recognized mode links open the requested tool, unknown values fall back', () => {
  for (const [query, expected] of [['extract','extract'], ['image','image-compress'], ['image-compress','image-compress'], ['invalid','compress']]) {
    const { ready, run } = load('?mode=' + query)
    ready(); assert.equal(run('currentMode'), expected)
  }
})

test('clicking the password control does not trigger file selection', () => {
  const { ready, get } = load('?mode=extract'); ready()
  const dropClick = get('drop-area').listeners.click
  dropClick({target: {closest: selector => selector.includes('.password-option')}})
  assert.equal(get('file-input').clicks, 0)
  dropClick({target: {closest: () => null}})
  assert.equal(get('file-input').clicks, 1)
})

test('mounted controllers preserve same-mode inputs, isolate instances and dispose tab listeners', () => {
  const left = load(), right = load(), changes = []
  const mount = ({ get }, mode) => mountWorkspace({ querySelector: s => get(s.match(/"([^"]+)"/)[1]) }, mode, m => changes.push(m))
  const first = mount(left, 'extract'), second = mount(right, 'compress')
  left.get('archive-password').value = 'retain'
  first.setMode('extract')
  second.setMode('image-compress')
  assert.equal(left.get('archive-password').value, 'retain')
  assert.match(right.get('upload-title').textContent, /图片/)
  left.get('compress-btn').listeners.click()
  first.setMode('compress')
  assert.deepEqual(changes, ['compress'])
  assert.equal(left.get('archive-password').value, '')
  first.dispose()
  left.get('extract-btn').listeners.click()
  assert.deepEqual(changes, ['compress'])
  second.dispose()
})

test('archive limits allow the boundary and reject oversized batches', () => {
  const { run } = load()
  assert.doesNotThrow(() => run('checkBudget(MAX_ENTRIES, MAX_FILE_SIZE)'))
  assert.throws(() => run('checkBudget(MAX_ENTRIES + 1, 0)'), /10,000/)
  assert.throws(() => run('checkBudget(1, MAX_FILE_SIZE + 1)'), /500 MB/)
})
