import { fromString, equals } from 'uint8arrays'
import crypto from 'crypto'
import { test, getMiniflare, getIpfs } from './helpers.js'

test.beforeEach(async (t) => {
  t.context.ipfs = await getIpfs()
  const { addresses } = await t.context.ipfs.id()
  const remotePeer = addresses.find(a => a.toString().includes('/ws'))?.toString()
  console.log('IPFS swarm address:', remotePeer)
  t.context.miniflare = getMiniflare({ REMOTE_PEER: remotePeer })
})

test('should fetch a small file', async (t) => {
  const { ipfs, miniflare } = t.context
  const payload = `test${Date.now()}`
  const { cid } = await ipfs.add({ content: fromString(payload) })

  const res = await miniflare.dispatchFetch(`http://localhost:8787/ipfs/${cid}`)
  t.is(200, res.status)

  const data = await res.text()
  t.is(data, payload)
})

test('should fetch a large file of multiple blocks', async (t) => {
  const { ipfs, miniflare } = t.context
  const payload = crypto.randomBytes(1024 * 1024 * 2)
  const { cid } = await ipfs.add({ content: payload })

  const res = await miniflare.dispatchFetch(`http://localhost:8787/ipfs/${cid}`)
  t.is(200, res.status)

  const data = new Uint8Array(await res.arrayBuffer())
  t.true(equals(data, payload))
})

test('should set Content-Length header', async (t) => {
  const { ipfs, miniflare } = t.context
  const totalBytes = 32
  const payload = crypto.randomBytes(totalBytes)
  const { cid } = await ipfs.add({ content: payload })

  const res = await miniflare.dispatchFetch(`http://localhost:8787/ipfs/${cid}`)
  t.is(200, res.status)

  const contentLength = parseInt(res.headers.get('Content-Length'))
  t.is(contentLength, totalBytes)
})

test('should set Content-Type header', async (t) => {
  const { ipfs, miniflare } = t.context
  const payload = `<!doctype html>\n<p>test${Date.now()}</p>`
  const { cid } = await ipfs.add({ path: 'test.html', content: payload }, { wrapWithDirectory: true })

  const res = await miniflare.dispatchFetch(`http://localhost:8787/ipfs/${cid}/test.html`)
  t.is(200, res.status)

  const contentType = res.headers.get('Content-Type')
  t.is(contentType, 'text/html')
})

test('should fail to request with unsupported features', async (t) => {
  const { ipfs, miniflare } = t.context
  const payload = `test${Date.now()}`
  const { cid } = await ipfs.add({ content: fromString(payload) })

  // Range request
  const resRange = await miniflare.dispatchFetch(`http://localhost:8787/ipfs/${cid}`, {
    headers: {
      range: 'bytes=0-10'
    }
  })
  t.is(501, resRange.status)
})

test.afterEach(async (t) => {
  await t.context.ipfs.stop()
})
