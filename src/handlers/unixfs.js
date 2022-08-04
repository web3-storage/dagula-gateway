/* eslint-env browser */
import { handleUnixfsFile } from './unixfs-file.js'
import { handleUnixfsDir } from './unixfs-dir.js'

/** @type {import('../bindings').Handler} */
export async function handleUnixfs (request, env, ctx) {
  const { ipfsPath, dagula, timeoutController: controller } = ctx
  if (!ipfsPath) throw new Error('missing IPFS path')
  if (!dagula) throw new Error('missing dagula')
  if (!controller) throw new Error('missing timeout controller')

  const entry = ctx.unixfsEntry = await dagula.getUnixfs(ipfsPath, { signal: controller.signal })

  if (!['file', 'raw', 'directory', 'identity'].includes(entry.type)) {
    throw new Error('unsupported entry type')
  }

  if (entry.type === 'directory') {
    return await handleUnixfsDir(request, env, ctx)
  }

  return await handleUnixfsFile(request, env, ctx)
}
