/* eslint-env browser */
import { createLibp2p } from 'libp2p'
import { WebSockets } from 'cf-libp2p-ws-transport'
import { Mplex } from '@libp2p/mplex'
import { createRSAPeerId } from '@libp2p/peer-id-factory'

/** @typedef {(h: Handler) => Handler} Middleware */

/**
 * Adds CORS headers to the response.
 * @type {Middleware}
 */
export function withCorsHeaders (handler) {
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
export function withErrorHandler (handler) {
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
export function withHttpGet (handler) {
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
export function withIpfsPath (handler) {
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
export function withLibp2p (handler) {
  return async (request, env, ctx) => {
    let node
    try {
      const { NOISE } = await import('@chainsafe/libp2p-noise')
      node = await createLibp2p({
        peerId: await createRSAPeerId({ bits: 1024 }),
        transports: [new WebSockets()],
        streamMuxers: [new Mplex({ maxMsgSize: 4 * 1024 * 1024 })],
        connectionEncryption: [NOISE]
      })
      await node.start()
      ctx.libp2p = node
      return await handler(request, env, ctx)
    } catch (err) {
      if (node) node.stop()
      throw err
    }
  }
}

/**
 * @param {...Middleware} middlewares
 * @returns {Middleware}
 */
export function composeMiddleware (...middlewares) {
  return handler => middlewares.reduceRight((h, m) => m(h), handler)
}
