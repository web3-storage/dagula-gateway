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
  libp2p?: any
}

export interface Handler {
  (request: Request, env: Environment, ctx: Context): Promise<Response>
}
