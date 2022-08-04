import type { TimeoutController } from 'timeout-abort-controller'
import type { UnixFSEntry } from 'ipfs-unixfs-exporter'
import type { Dagula } from 'dagula'
import type { Libp2p } from 'libp2p'

export {}

export interface Environment {
  REMOTE_PEER: string
  DEBUG: string
}

export interface Context {
  waitUntil(promise: Promise<void>): void
  /**
   * Parsed IPFS path: '<cid>[/optional/path]'
   */
  ipfsPath?: string
  libp2p?: Libp2p
  dagula?: Dagula
  timeoutController?: TimeoutController
  unixfsEntry?: UnixFSEntry
}

export interface Handler {
  (request: Request, env: Environment, ctx: Context): Promise<Response>
}
