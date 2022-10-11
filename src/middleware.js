/* eslint-env browser */
/* global TransformStream caches */
import { createLibp2p } from 'libp2p'
import { WebSockets } from 'cf-libp2p-ws-transport'
import { Mplex } from '@libp2p/mplex'
import { createRSAPeerId } from '@libp2p/peer-id-factory'
import { TimeoutController } from 'timeout-abort-controller'
import { Dagula } from 'dagula'

/** @typedef {(h: import('./bindings.d').Handler) => import('./bindings.d').Handler} Middleware */

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
      if (!err.status || err.status >= 500) console.error(err.stack)
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
      throw Object.assign(new Error('method not allowed'), { status: 405 })
    }
    return handler(request, env, ctx)
  }
}

/**
 * Extracts an IPFS CID path ('<cid>[/optional/path]') from the request and
 * stores it on the context under `cidPath`.
 * @type {Middleware}
 */
export function withCidPath (handler) {
  return (request, env, ctx) => {
    const path = new URL(request.url).pathname
    if (!path.startsWith('/ipfs/')) {
      throw Object.assign(new Error('not found'), { status: 404 })
    }
    ctx.cidPath = decodeURI(path.slice(6))
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
      const response = await handler(request, env, ctx)
      if (!response.body) {
        node.stop()
        return response
      }
      return new Response(
        response.body.pipeThrough(
          new TransformStream({
            flush () {
              // console.log('stopping libp2p')
              node.stop()
            }
          })
        ),
        response
      )
    } catch (err) {
      if (node) node.stop()
      throw err
    }
  }
}

/**
 * Creates a middleware that adds an TimeoutController (an AbortController) to
 * the context that times out after the passed milliseconds. Consumers can
 * optionally call `.reset()` on the controller to restart the timeout.
 * @param {number} timeout Timeout in milliseconds.
 */
export function createWithTimeoutController (timeout) {
  /** @type {Middleware} */
  return handler => {
    return async (request, env, ctx) => {
      const controller = ctx.timeoutController = new TimeoutController(timeout)
      const response = await handler(request, env, ctx)
      if (!response.body) return response
      return new Response(
        response.body.pipeThrough(
          new TransformStream({
            flush () {
              // console.log('clearing timeout controller')
              controller.clear()
            }
          })
        ),
        response
      )
    }
  }
}

/**
 * Creates a new Dagula instance and adds it to the context.
 * @type {Middleware}
 */
export function withDagula (handler) {
  return (request, env, ctx) => {
    const { libp2p } = ctx
    if (!libp2p) throw new Error('missing libp2p host')
    ctx.dagula = new Dagula(libp2p, env.REMOTE_PEER)
    return handler(request, env, ctx)
  }
}

/**
 * Intercepts request if content cached by just returning cached response.
 * Otherwise proceeds to handler.
 * @type {Middleware}
 */
export function withCdnGet (handler) {
  return async (request, env, ctx) => {
    // Should skip cache if instructed by headers
    if ((request.headers.get('Cache-Control') || '').includes('no-cache')) {
      return handler(request, env, ctx)
    }

    // Get from cache and return if existent
    const cache = caches.default
    const response = await cache.match(request)
    if (response) {
      return response
    }

    return handler(request, env, ctx)
  }
}

/**
 * @param {...Middleware} middlewares
 * @returns {Middleware}
 */
export function composeMiddleware (...middlewares) {
  return handler => middlewares.reduceRight((h, m) => m(h), handler)
}
