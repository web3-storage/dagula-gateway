/* eslint-env browser */
import { CarWriter } from '@ipld/car'
import { toReadable } from '../streams.js'
import { hasPathComponents } from '../path.js'

/** @type {import('../bindings').Handler} */
export async function handleCar (request, env, ctx) {
  const { cidPath, dagula, timeoutController: controller, libp2p } = ctx
  if (!cidPath) throw new Error('missing IPFS path')
  if (!dagula) throw new Error('missing dagula')
  if (!libp2p) throw new Error('missing libp2p node')
  if (!controller) throw new Error('missing timeout controller')

  let cid
  if (hasPathComponents(cidPath)) {
    const entry = await dagula.getUnixfs(cidPath, { signal: controller.signal })
    cid = entry.cid
  } else {
    cid = cidPath.endsWith('/') ? cidPath.slice(0, -1) : cidPath
  }

  // Weak Etag W/ because we can't guarantee byte-for-byte identical
  // responses, but still want to benefit from HTTP Caching. Two CAR
  // responses for the same CID and selector will be logically equivalent,
  // but when CAR is streamed, then in theory, blocks may arrive from
  // datastore in non-deterministic order.
  const etag = `W/"${cid}.car"`
  if (request.headers.get('If-None-Match') === etag) {
    await libp2p.stop()
    return new Response(null, { status: 304 })
  }

  const { writer, out } = CarWriter.create(cid)
  ;(async () => {
    try {
      for await (const block of dagula.get(cid, { signal: controller.signal })) {
        controller.reset()
        await writer.put(block)
      }
    } catch (err) {
      console.error('writing CAR', err)
    } finally {
      await writer.close()
      await libp2p.stop()
    }
  })()

  const { searchParams } = new URL(request.url)

  const name = searchParams.get('filename') || `${cid}.car`
  const utf8Name = encodeURIComponent(name)
  // eslint-disable-next-line no-control-regex
  const asciiName = encodeURIComponent(name.replace(/[^\x00-\x7F]/g, '_'))

  const headers = {
    // Make it clear we don't support range-requests over a car stream
    'Accept-Ranges': 'none',
    'Content-Type': 'application/vnd.ipld.car; version=1',
    'X-Content-Type-Options': 'nosniff',
    Etag: etag,
    'Cache-Control': 'public, max-age=29030400, immutable',
    'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`
  }

  return new Response(toReadable(out), { headers })
}
