/* eslint-env browser */
import { toReadable } from '../streams.js'
import { detectContentType } from '../mime.js'

/** @type {import('../bindings').Handler} */
export async function handleUnixfsFile (request, env, ctx) {
  const { unixfsEntry: entry, timeoutController: controller, libp2p } = ctx
  if (!entry) throw new Error('missing unixfs entry')
  if (!controller) throw new Error('missing timeout controller')
  if (!libp2p) throw new Error('missing libp2p node')

  /** @type {Record<string, string>} */
  const headers = {
    etag: entry.cid.toString(),
    'Content-Length': entry.size
  }

  console.log('unixfs root', entry.cid.toString())
  const contentIterator = entry.content()[Symbol.asyncIterator]()
  const { done, value: firstChunk } = await contentIterator.next()
  if (done || !firstChunk.length) {
    return new Response(null, { status: 204, headers })
  }

  const fileName = entry.path.split('/').pop()
  const contentType = detectContentType(fileName, firstChunk)
  if (contentType) {
    headers['Content-Type'] = contentType
  }

  // stream the remainder
  const stream = toReadable((async function * () {
    yield firstChunk
    try {
      for await (const chunk of contentIterator) {
        controller.reset()
        yield chunk
      }
    } catch (err) {
      console.error(err.stack)
      throw err
    } finally {
      controller.clear()
      // TODO: need a good way to hook into this from withLibp2p middleware
      libp2p.stop()
    }
  })())

  return new Response(stream, { headers })
}
