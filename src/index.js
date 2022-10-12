/* eslint-env browser */

import {
  withCorsHeaders,
  withErrorHandler,
  withUnsupportedFeaturesHandler,
  withHttpGet,
  withCdnCache,
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

const TIMEOUT = 30_000

export default {
  /** @type {Handler} */
  async fetch (request, env, ctx) {
    console.log(request.method, request.url)
    const middleware = composeMiddleware(
      withCorsHeaders,
      withErrorHandler,
      withUnsupportedFeaturesHandler,
      withHttpGet,
      withCdnCache,
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

  const { searchParams } = new URL(request.url)
  if (searchParams.get('format') === 'raw') {
    return await handleBlock(request, env, ctx)
  }
  if (searchParams.get('format') === 'car') {
    return await handleCar(request, env, ctx)
  }
  return await handleUnixfs(request, env, ctx)
}
