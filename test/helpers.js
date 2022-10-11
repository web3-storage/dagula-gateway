import anyTest from 'ava'

import { Miniflare } from 'miniflare'
import { create as createIpfs } from 'ipfs-core'
import { createRepo } from 'ipfs-repo'
import { MemoryLock } from 'ipfs-repo/locks/memory'
import { MemoryDatastore } from 'datastore-core/memory'
import { BlockstoreDatastoreAdapter } from 'blockstore-datastore-adapter'
import { Multicodecs } from 'ipfs-core-utils/multicodecs'
import * as dagPB from '@ipld/dag-pb'
import * as dagCBOR from '@ipld/dag-cbor'
import * as dagJSON from '@ipld/dag-json'
import * as raw from 'multiformats/codecs/raw'
import { nanoid } from 'nanoid'

/**
 * @param {Record<string, string>} env
 */
export function getMiniflare (env) {
  return new Miniflare({
    bindings: env,
    scriptPath: 'dist/worker.mjs',
    packagePath: true,
    wranglerConfigPath: true,
    // We don't want to rebuild our worker for each test, we're already doing
    // it once before we run all tests in package.json, so disable it here.
    // This will override the option in wrangler.toml.
    buildCommand: undefined,
    wranglerConfigEnv: 'test',
    modules: true,
    // https://github.com/cloudflare/miniflare/issues/292
    // globalAsyncIO: true,
    globalTimers: true
  })
}

export function getIpfs () {
  const codecs = new Multicodecs({
    codecs: [dagPB, dagCBOR, dagJSON, raw],
    loadCodec: () => Promise.reject(new Error('No extra codecs configured'))
  })
  const loadCodec = (codeOrName) => codecs.getCodec(codeOrName)
  const backends = {
    datastore: new MemoryDatastore(),
    blocks: new BlockstoreDatastoreAdapter(
      new MemoryDatastore()
    ),
    pins: new MemoryDatastore(),
    keys: new MemoryDatastore(),
    root: new MemoryDatastore()
  }
  const repoPath = 'ipfs-test-' + nanoid()
  const repo = createRepo(repoPath, loadCodec, backends, { repoLock: MemoryLock })
  return createIpfs({
    silent: true,
    repo,
    config: {
      Addresses: { Swarm: ['/ip4/127.0.0.1/tcp/0/ws'] },
      Bootstrap: []
    },
    preload: { enabled: false }
  })
}

/**
 * @typedef {{
 *   ipfs: import('ipfs-core').IPFS
 *   miniflare: import('miniflare').Miniflare
 * }} Context
 *
 * @typedef {import("ava").TestFn<Context>} TestFn
 */

export const test = /** @type {TestFn} */ (anyTest)
