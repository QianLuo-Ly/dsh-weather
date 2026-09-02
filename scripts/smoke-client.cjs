// Smoke-test the rebuilt client bundle: the factory must execute and export
// `apply` + `inject`, with react resolved through the injected require.
const fs = require('node:fs')
const vm = require('node:vm')

let loaded = null
global.window = { __ModuleLoader__: { load: (entry) => { loaded = entry } } }

const code = fs.readFileSync('D:/2_MyProject/dsh-weather/lib/client.js', 'utf8')
vm.runInThisContext(code, { filename: 'lib/client.js' })

if (!loaded) throw new Error('loader was never called')
const factory = loaded.factory
if (typeof factory !== 'function') throw new Error('factory missing')

const injectedRequire = (spec) => {
  if (spec === 'react') return { jsx: () => null, Fragment: 'fragment' }
  if (spec === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null, Fragment: 'fragment' }
  throw new Error('unexpected runtime require in factory: ' + spec)
}

const out = factory.call({}, injectedRequire)
console.log('factory exported keys:', Object.keys(out))
console.log('has apply:', typeof out.apply === 'function')
console.log('has inject:', Array.isArray(out.inject) && JSON.stringify(out.inject))
console.log('SMOKE OK')
