// Hand-rolled client bundle: wraps client-source.js + ui.css + fish-paths.js in the
// DSH module-loader factory. No dependencies; run with `node client/build.mjs`.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'

const dir = new URL('./', import.meta.url)
// Normalize CRLF so the bundle is byte-identical no matter how git checked the sources out.
const read = async (name) => (await readFile(new URL(name, dir), 'utf8')).replace(/\r\n/g, '\n')
const source = await read('client-source.js')
const css = await read('ui.css')
const fish = await read('fish-paths.js')
const artifact =
  "window.__ModuleLoader__.load({\n id: 'dsh-daily-report',\n factory(require) {\n" +
  ' const CSS_TEXT = ' + JSON.stringify(css) + ';\n' +
  fish + '\n' +
  source + '\n }\n});\n'
new Script(artifact, { filename: 'client.js' }) // syntax check
await writeFile(new URL('client.js', dir), artifact, 'utf8')
console.log('Built ' + fileURLToPath(new URL('client.js', dir)) + ' (' + Buffer.byteLength(artifact) + ' bytes)')
