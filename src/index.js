/* eslint-env browser */
import { Dagula } from 'dagula'
import { TimeoutController } from 'timeout-abort-controller'
import {
  withCorsHeaders,
  withErrorHandler,
  withHttpGet,
  withCidPath,
  withLibp2p,
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
    const middleware = composeMiddleware(
      withCorsHeaders,
      withErrorHandler,
      withHttpGet,
      withCidPath,
      withLibp2p
    )
    return middleware(requestHandler)(request, env, ctx)
  }
}

/** @type {Handler} */
async function requestHandler (request, env, ctx) {
  const { cidPath, libp2p } = ctx
  if (!cidPath) throw new Error('missing IPFS path')
  if (!libp2p) throw new Error('missing libp2p host')

  ctx.dagula = new Dagula(libp2p, env.REMOTE_PEER)
  const controller = ctx.timeoutController = new TimeoutController(TIMEOUT)
  try {
    console.log('get', cidPath, 'from', env.REMOTE_PEER)
    const { searchParams } = new URL(request.url)

    if (searchParams.get('format') === 'raw') {
      return await handleBlock(request, env, ctx)
    }
    if (searchParams.get('format') === 'car') {
      return await handleCar(request, env, ctx)
    }
    return await handleUnixfs(request, env, ctx)
  } catch (err) {
    controller.clear()
    throw err
  }
}
