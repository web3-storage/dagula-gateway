/* eslint-env browser */
import { hasPathComponents } from '../path.js'

/** @type {import('../bindings').Handler} */
export async function handleBlock (request, env, ctx) {
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

  const etag = `"${cid}.raw"`
  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304 })
  }

  const block = await dagula.getBlock(cid, { signal: controller.signal })
  const { searchParams } = new URL(request.url)

  const name = searchParams.get('filename') || `${cid}.bin`
  const utf8Name = encodeURIComponent(name)
  // eslint-disable-next-line no-control-regex
  const asciiName = encodeURIComponent(name.replace(/[^\x00-\x7F]/g, '_'))

  const headers = {
    'Content-Type': 'application/vnd.ipld.raw',
    'X-Content-Type-Options': 'nosniff',
    Etag: etag,
    'Cache-Control': 'public, max-age=29030400, immutable',
    'Content-Length': block.length,
    'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`
  }

  return new Response(new Blob([block]), { headers })
}
