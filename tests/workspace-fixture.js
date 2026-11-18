import vm from 'node:vm'
import { readFileSync } from 'node:fs'

// Keep the existing algorithm fixtures able to stub private functions without
// publishing test hooks or leaking instance state from the shipped controller.
const source = readFileSync(new URL('../js/script.js', import.meta.url), 'utf8')
export function isolatedWorkspace(context) {
  context.AbortController = AbortController
  context.root = { querySelector: selector => context.document.getElementById(selector.match(/"([^"]+)"/)[1]) }
  return vm.runInContext(source.replace('export function mountWorkspace', 'function mountWorkspace')
    .replace(/\n\s*initEventListeners\(\);/, '\nreturn code => eval(code);') + '\nmountWorkspace(root)', context)
}
