/* eslint-env browser */
/* global caches */

import {
  withCorsHeaders,
  withErrorHandler,
  withHttpGet,
  withCdnGet,
  withCidPath,
  withLibp2p,
  createWithTimeoutController,
  withDagula,
  composeMiddleware
} from './middleware.js'
import { handleUnixfs, handleBlock, handleCar } from './handlers/index.js'
// import { enable } from '@libp2p/logger'
// enable('dag*')

/** @typedef {import('./bindings').Handler} Handler */

const CF_CACHE_MAX_OBJECT_SIZE = 512 * Math.pow(1024, 2) // 512MB to bytes
const TIMEOUT = 30_000

export default {
  /** @type {Handler} */
  async fetch (request, env, ctx) {
    console.log(request.method, request.url)
    const middleware = composeMiddleware(
      withCorsHeaders,
      withErrorHandler,
      withHttpGet,
      withCdnGet,
      withCidPath,
      withLibp2p,
      withDagula,
      createWithTimeoutController(TIMEOUT)
    )
    return middleware(requestHandler)(request, env, ctx)
  }
}

/** @type {Handler} */
async function requestHandler (request, env, ctx) {
  const { cidPath } = ctx
  if (!cidPath) throw new Error('missing IPFS path')

  let response
  const { searchParams } = new URL(request.url)
  if (searchParams.get('format') === 'raw') {
    response = await handleBlock(request, env, ctx)
  }
  if (searchParams.get('format') === 'car') {
    response = await handleCar(request, env, ctx)
  }
  response = await handleUnixfs(request, env, ctx)

  ctx.waitUntil(
    putToCache(request, response, caches.default)
  )

  return response
}

/**
 * Put received response to cache.
 *
 * @param {Request} request
 * @param {Response} response
 * @param {Cache} cache
 */
async function putToCache (request, response, cache) {
  const contentLengthMb = Number(response.headers.get('content-length'))

  // Cache request in Cloudflare CDN if smaller than CF_CACHE_MAX_OBJECT_SIZE
  if (contentLengthMb <= CF_CACHE_MAX_OBJECT_SIZE) {
    await cache.put(request, response.clone())
  }
}
