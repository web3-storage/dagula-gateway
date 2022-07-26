import test from 'ava'
import { fromString, equals } from 'uint8arrays'
import crypto from 'crypto'
import { getMiniflare, getIpfs } from './helpers.js'

/**
 * @typedef {import('ava').ExecutionContext<{
 *   ipfs: import('ipfs-core').IPFS
 *   miniflare: import('miniflare').Miniflare
 * }>} ExecutionContext
 */

test.beforeEach(async (/** @type {ExecutionContext} */ t) => {
  t.context.ipfs = await getIpfs()
  const { addresses } = await t.context.ipfs.id()
  const remotePeer = addresses.find(a => a.toString().includes('/ws'))?.toString()
  console.log('IPFS swarm address:', remotePeer)
  t.context.miniflare = getMiniflare({ REMOTE_PEER: remotePeer })
})

test('should fetch a small file', async (/** @type {ExecutionContext} */ t) => {
  const { ipfs, miniflare } = t.context
  const payload = `test${Date.now()}`
  const { cid } = await ipfs.add({ content: fromString(payload) })

  const res = await miniflare.dispatchFetch(`http://localhost:8787/ipfs/${cid}`)
  t.is(200, res.status)

  const data = await res.text()
  t.is(data, payload)
})

test('should fetch a large file of multiple blocks', async (/** @type {ExecutionContext} */ t) => {
  const { ipfs, miniflare } = t.context
  const payload = crypto.randomBytes(1024 * 1024 * 2)
  const { cid } = await ipfs.add({ content: payload })

  const res = await miniflare.dispatchFetch(`http://localhost:8787/ipfs/${cid}`)
  t.is(200, res.status)

  const data = new Uint8Array(await res.arrayBuffer())
  t.true(equals(data, payload))
})

test('should set Content-Length header', async (/** @type {ExecutionContext} */ t) => {
  const { ipfs, miniflare } = t.context
  const totalBytes = 32
  const payload = crypto.randomBytes(totalBytes)
  const { cid } = await ipfs.add({ content: payload })

  const res = await miniflare.dispatchFetch(`http://localhost:8787/ipfs/${cid}`)
  t.is(200, res.status)

  const contentLength = parseInt(res.headers.get('Content-Length'))
  t.is(contentLength, totalBytes)
})

test.afterEach(async (/** @type {ExecutionContext} */ t) => {
  await t.context.ipfs.stop()
})
