/* eslint-env browser */
import { createLibp2p } from 'libp2p'
import { WebSockets } from 'cf-libp2p-ws-transport'
import { Mplex } from '@libp2p/mplex'
import { Dagula } from 'dagula'
import { TimeoutController } from 'timeout-abort-controller'

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
async function requestHandler (request, env, { ipfsPath, libp2p }) {
  if (!ipfsPath) throw new Error('missing IPFS path')
  if (!libp2p) throw new Error('missing libp2p host')

  const dagula = new Dagula(libp2p, env.REMOTE_PEER)
  const controller = new TimeoutController(TIMEOUT)
  try {
    console.log('get', ipfsPath)
    const entry = await dagula.getUnixfs(ipfsPath, { signal: controller.signal })
    if (entry.type === 'directory') {
      throw new Error('directory listing not implemented')
    } else if (entry.type !== 'file' && entry.type !== 'raw' && entry.type !== 'identity') {
      throw new Error('unsupported entry type')
    }

    console.log('unixfs root', entry.cid.toString())
    const contentIterator = entry.content()[Symbol.asyncIterator]()
    const { done, value: firstChunk } = await contentIterator.next()
    if (done || !firstChunk.length) {
      return new Response(null, { status: 204 })
    }

    // TODO: mime type sniffing

    // stream the remainder
    const stream = toReadable((async function * () {
      yield firstChunk
      try {
        for await (const chunk of contentIterator) {
          controller.reset()
          yield chunk
        }
      } finally {
        controller.clear()
      }
    })())

    return new Response(stream)
  } catch (err) {
    controller.clear()
    throw err
  }
}

// Middleware /////////////////////////////////////////////////////////////////

/** @typedef {(h: Handler) => Handler} Middleware */

/**
 * Adds CORS headers to the response.
 * @type {Middleware}
 */
function withCorsHeaders (handler) {
  return async (request, env, ctx) => {
    let response = await handler(request, env, ctx)
    // Clone the response so that it's no longer immutable (like if it comes
    // from cache or fetch)
    response = new Response(response.body, response)
    const origin = request.headers.get('origin')
    if (origin) {
      response.headers.set('Access-Control-Allow-Origin', origin)
      response.headers.set('Vary', 'Origin')
    } else {
      response.headers.set('Access-Control-Allow-Origin', '*')
    }
    response.headers.set('Access-Control-Expose-Headers', 'Link')
    return response
  }
}

/**
 * Catches any errors, logs them and returns a suitable response.
 * @type {Middleware}
 */
function withErrorHandler (handler) {
  return async (request, env, ctx) => {
    try {
      return await handler(request, env, ctx)
    } catch (err) {
      console.error(err.stack)
      const msg = env.DEBUG === 'true' ? err.stack : err.message
      return new Response(msg, { status: err.status || 500 })
    }
  }
}

/**
 * Validates the request uses a HTTP GET method.
 * @type {Middleware}
 */
function withHttpGet (handler) {
  return (request, env, ctx) => {
    if (request.method !== 'GET') {
      throw new Error('method not allowed', { status: 405 })
    }
    return handler(request, env, ctx)
  }
}

/**
 * Extracts an IPFS path ('<cid>[/optional/path]') from the request and stores
 * it on the context under `ipfsPath`.
 * @type {Middleware}
 */
function withIpfsPath (handler) {
  return (request, env, ctx) => {
    const path = new URL(request.url).pathname
    if (!path.startsWith('/ipfs/')) {
      throw new Error('not found', { status: 404 })
    }
    ctx.ipfsPath = decodeURI(path.slice(6))
    return handler(request, env, ctx)
  }
}

/**
 * Instantiates a new Libp2p node and attaches it to context as `libp2p`.
 * @type {Middleware}
 */
function withLibp2p (handler) {
  return async (request, env, ctx) => {
    let node
    try {
      const { Noise } = await import('@chainsafe/libp2p-noise')
      const wsTransport = new WebSockets()
      // TODO: use NODE ED25519 to generate key
      // https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
      node = await createLibp2p({
        transports: [wsTransport],
        streamMuxers: [new Mplex({ maxMsgSize: 4 * 1024 * 1024 })],
        connectionEncryption: [new Noise()]
      })
      await node.start()
      ctx.libp2p = node
      return await handler(request, env, ctx)
    } finally {
      if (node) ctx.waitUntil(node.stop())
    }
  }
}

// Utilities //////////////////////////////////////////////////////////////////

/**
 * @param {...Middleware} middlewares
 * @returns {Middleware}
 */
function composeMiddleware (...middlewares) {
  return handler => middlewares.reduceRight((h, m) => m(h), handler)
}

/**
 * @param {AsyncIterable<Uint8Array>} iterable
 */
function toReadable (iterable) {
  /** @type {AsyncIterator<Uint8Array>} */
  let iterator
  return new ReadableStream({
    async pull (controller) {
      iterator = iterator || iterable[Symbol.asyncIterator]()
      const { value, done } = await iterator.next()
      if (done) return controller.close()
      controller.enqueue(value)
    }
  })
}
