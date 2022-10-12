/* eslint-env browser */

import {
  withCorsHeaders,
  withErrorHandler,
  withHttpGet,
  withCdnCache,
  withParsedIpfsUrl,
  createWithTimeoutController,
  composeMiddleware
} from '@web3-storage/gateway-lib/middleware'
import { handleUnixfs, handleBlock, handleCar } from '@web3-storage/gateway-lib/handlers'
import {
  withUnsupportedFeaturesHandler,
  withLibp2p,
  withDagula
} from './middleware.js'
// import { enable } from '@libp2p/logger'
// enable('dag*')

/**
 * @typedef {import('./bindings').Environment} Environment
 * @typedef {import('@web3-storage/gateway-lib').IpfsUrlContext} IpfsUrlContext
 * @typedef {import('@web3-storage/gateway-lib').DagulaContext} DagulaContext
 */

const TIMEOUT = 30_000

export default {
  /** @type {import('@web3-storage/gateway-lib').Handler<import('@web3-storage/gateway-lib').Context, import('./bindings').Environment>} */
  async fetch (request, env, ctx) {
    console.log(request.method, request.url)
    const middleware = composeMiddleware(
      withCdnCache,
      withCorsHeaders,
      withErrorHandler,
      withUnsupportedFeaturesHandler,
      withHttpGet,
      withParsedIpfsUrl,
      withLibp2p,
      withDagula,
      createWithTimeoutController(TIMEOUT)
    )
    return middleware(requestHandler)(request, env, ctx)
  }
}

/** @type {import('@web3-storage/gateway-lib').Handler<DagulaContext & IpfsUrlContext, Environment>} */
async function requestHandler (request, env, ctx) {
  const { headers } = request
  const { searchParams } = ctx

  if (searchParams.get('format') === 'raw' || headers.get('Accept') === 'application/vnd.ipld.raw') {
    return await handleBlock(request, env, ctx)
  }
  if (searchParams.get('format') === 'car' || headers.get('Accept') === 'application/vnd.ipld.car') {
    return await handleCar(request, env, ctx)
  }
  return await handleUnixfs(request, env, ctx)
}
