/* eslint-env browser */

/**
 * @param {AsyncIterable<Uint8Array>} iterable
 */
export function toReadable (iterable) {
  /** @type {AsyncIterator<Uint8Array>} */
  let iterator
  return new ReadableStream({
    async pull (controller) {
      iterator = iterator || iterable[Symbol.asyncIterator]()
      const { value, done } = await iterator.next()
      if (done) return controller.close()
      controller.enqueue(value)
    }
  })
}
