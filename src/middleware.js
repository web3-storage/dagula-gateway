/* eslint-env browser */
/* global TransformStream */
import { createLibp2p } from 'libp2p'
import { WebSockets } from 'cf-libp2p-ws-transport'
import { Mplex } from '@libp2p/mplex'
import { createRSAPeerId } from '@libp2p/peer-id-factory'
import { Dagula } from 'dagula'
import { HttpError } from '@web3-storage/gateway-lib/util'

/**
 * @typedef {import('./bindings').Environment} Environment
 * @typedef {import('@web3-storage/gateway-lib').Context} Context
 * @typedef {import('./bindings').Libp2pContext} Libp2pContext
 * @typedef {import('@web3-storage/gateway-lib').DagulaContext} DagulaContext
 */

/**
 * Validates the request does not contain unsupported features.
 * Returns 501 Not Implemented in case it has.
 * @type {import('@web3-storage/gateway-lib').Middleware<Context>}
 */
export function withUnsupportedFeaturesHandler (handler) {
  return (request, env, ctx) => {
    // Range request https://github.com/web3-storage/dagula-gateway/issues/3
    if (request.headers.get('range')) {
      throw new HttpError('Not Implemented', { status: 501 })
    }

    return handler(request, env, ctx)
  }
}

/**
 * Instantiates a new Libp2p node and attaches it to context as `libp2p`.
 * @type {import('@web3-storage/gateway-lib').Middleware<Libp2pContext, Context>}
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
      const response = await handler(request, env, { ...ctx, libp2p: node })
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
 * Creates a new Dagula instance and adds it to the context.
 * @type {import('@web3-storage/gateway-lib').Middleware<Libp2pContext & DagulaContext, Libp2pContext, Environment>}
 */
export function withDagula (handler) {
  return async (request, env, ctx) => {
    const { libp2p } = ctx
    if (!libp2p) throw new Error('missing libp2p host')
    const dagula = await Dagula.fromNetwork(libp2p, { peer: env.REMOTE_PEER })
    return handler(request, env, { ...ctx, dagula })
  }
}
