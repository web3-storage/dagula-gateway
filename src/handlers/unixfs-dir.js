/* eslint-env browser */
import { fromString } from 'uint8arrays/from-string'
import Handlebars from 'handlebars/runtime.js'
import bytes from 'bytes'
import '../../templates/bundle.cjs'
import { toReadable } from '../streams.js'

Handlebars.registerHelper('encodeURI', encodeURI)
Handlebars.registerHelper('encodeURIComponent', encodeURIComponent)
Handlebars.registerHelper('iconFromExt', name => {
  const ext = name.slice(name.lastIndexOf('.') + 1)
  return knownIcons[ext] ? `ipfs-${ext}` : 'ipfs-_blank'
})
Handlebars.registerHelper('shortHash', h => h.length < 9 ? h : `${h.slice(0, 4)}\u2026${h.slice(-4)}`)
Handlebars.registerHelper('formatBytes', n => bytes(n, { unitSeparator: ' ' }))

const knownIcons = Object.fromEntries([
  'aac', 'aiff', 'ai', 'avi', 'bmp', 'c', 'cpp', 'css', 'dat', 'dmg', 'doc',
  'dotx', 'dwg', 'dxf', 'eps', 'exe', 'flv', 'gif', 'h', 'hpp', 'html', 'ics',
  'iso', 'java', 'jpg', 'jpeg', 'js', 'key', 'less', 'mid', 'mkv', 'mov',
  'mp3', 'mp4', 'mpg', 'odf', 'ods', 'odt', 'otp', 'ots', 'ott', 'pdf', 'php',
  'png', 'ppt', 'psd', 'py', 'qt', 'rar', 'rb', 'rtf', 'sass', 'scss', 'sql',
  'tga', 'tgz', 'tiff', 'txt', 'wav', 'wmv', 'xls', 'xlsx', 'xml', 'yml', 'zip'
].map(ext => [ext, true]))

/** @type {import('../bindings').Handler} */
export async function handleUnixfsDir (request, env, ctx) {
  const { unixfsEntry: entry, timeoutController: controller, libp2p } = ctx
  if (!entry) throw new Error('missing unixfs entry')
  if (entry.type !== 'directory') throw new Error('non unixfs directory entry')
  if (!controller) throw new Error('missing timeout controller')
  if (!libp2p) throw new Error('missing libp2p node')

  const isSubdomain = new URL(request.url).hostname.includes('.ipfs.')
  /** @param {string} p CID path like "<cid>[/optional/path]" */
  const entryPath = p => isSubdomain ? p.split('/').slice(1).join('/') : `/ipfs/${p}`

  const stream = toReadable((async function * () {
    const parts = entry.path.split('/')
    yield fromString(
      Handlebars.templates['unixfs-dir-header']({
        path: entryPath(entry.path),
        name: entry.name,
        hash: entry.cid.toString(),
        size: entry.size,
        backLink: parts.length > 1 ? entryPath(parts.slice(0, -1).join('/')) : '',
        breadcrumbs: ['ipfs', ...parts].map((name, i, parts) => {
          const path = i > 0 ? entryPath(parts.slice(1, i + 1).join('/')) : null
          return { name, path }
        })
      })
    )
    try {
      for await (const dirEntry of entry.content()) {
        controller.reset()
        yield fromString(
          Handlebars.templates['unixfs-dir-entries']({
            entries: [{
              path: entryPath(dirEntry.path),
              name: dirEntry.name,
              hash: dirEntry.cid.toString(),
              size: dirEntry.size
            }]
          })
        )
      }
      yield fromString(Handlebars.templates['unixfs-dir-footer']())
    } catch (err) {
      console.error(err.stack)
      throw err
    } finally {
      controller.clear()
      // TODO: need a good way to hook into this from withLibp2p middleware
      libp2p.stop()
    }
  })())

  return new Response(stream)
}
