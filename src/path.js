/**
 * Determine if the passed IPFS CID path has components after the CID.
 * `<cid>` - false
 * `<cid>/` - false
 * `<cid>/file.txt` - true
 * @param {string} cidPath
 */
export function hasPathComponents (cidPath) {
  const slashIndex = cidPath.indexOf('/')
  if (slashIndex === -1) return false
  return slashIndex !== cidPath.length - 1
}
