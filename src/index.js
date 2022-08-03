/* eslint-env browser */
import { Dagula } from 'dagula'
import { TimeoutController } from 'timeout-abort-controller'
import { fromString } from 'uint8arrays'
import {
  withCorsHeaders,
  withErrorHandler,
  withHttpGet,
  withIpfsPath,
  withLibp2p,
  composeMiddleware
} from './middleware.js'
import { toReadable } from './streams.js'
import { detectContentType } from './mime.js'
// import { enable } from '@libp2p/logger'
// enable('*')

/** @typedef {import('./bindings').Handler} Handler */

const TIMEOUT = 30_000

export default {
  /** @type {Handler} */
  async fetch (request, env, ctx) {
    const middleware = composeMiddleware(
      withCorsHeaders,
      withErrorHandler,
      withHttpGet,
      withIpfsPath,
      withLibp2p
    )
    return middleware(requestHandler)(request, env, ctx)
  }
}

/** @type {Handler} */
async function requestHandler (request, env, ctx) {
  const { ipfsPath, libp2p } = ctx
  if (!ipfsPath) throw new Error('missing IPFS path')
  if (!libp2p) throw new Error('missing libp2p host')

  const dagula = new Dagula(libp2p, env.REMOTE_PEER)
  const controller = new TimeoutController(TIMEOUT)
  try {
    console.log('get', ipfsPath, 'from', env.REMOTE_PEER)
    const entry = await dagula.getUnixfs(ipfsPath, { signal: controller.signal })

    if (entry.type === 'directory') {
      const stream = toReadable((async function * () {
        yield fromString('<!doctype html>\n<ul>')
        try {
          for await (const { cid, path, name } of entry.content()) {
            controller.reset()
            yield fromString(`<li>${cid} <a href="/ipfs/${esc(path)}">${esc(name)}</a></li>\n`)
          }
          yield fromString('</ul>')
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

    if (entry.type !== 'file' && entry.type !== 'raw' && entry.type !== 'identity') {
      throw new Error('unsupported entry type')
    }

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
  } catch (err) {
    controller.clear()
    throw err
  }
}

const esc = unsafe => unsafe.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
