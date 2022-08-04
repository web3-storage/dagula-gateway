/* eslint-env browser */
import { Dagula } from 'dagula'
import { TimeoutController } from 'timeout-abort-controller'
import {
  withCorsHeaders,
  withErrorHandler,
  withHttpGet,
  withIpfsPath,
  withLibp2p,
  composeMiddleware
} from './middleware.js'
import { handleUnixfs } from './handlers/unixfs.js'
// import { enable } from '@libp2p/logger'
// enable('dag*')

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

  ctx.dagula = new Dagula(libp2p, env.REMOTE_PEER)
  const controller = ctx.timeoutController = new TimeoutController(TIMEOUT)
  try {
    console.log('get', ipfsPath, 'from', env.REMOTE_PEER)
    // TODO: support for format=raw and format=cbor
    return await handleUnixfs(request, env, ctx)
  } catch (err) {
    controller.clear()
    throw err
  }
}
