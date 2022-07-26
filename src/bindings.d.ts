import type { Libp2p } from 'libp2p'
import type { Context } from '@web3-storage/gateway-lib'

export {}

export interface Environment {
  REMOTE_PEER: string
  DEBUG: string
}

export interface Libp2pContext extends Context {
  libp2p: Libp2p
}
