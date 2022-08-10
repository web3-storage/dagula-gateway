import esbuild from 'esbuild'
import textReplace from 'esbuild-plugin-text-replace'

esbuild.build({
  format: 'esm',
  bundle: true,
  entryPoints: ['./src/index.js'],
  outfile: './dist/worker.mjs',
  plugins: [textReplace({
    include: /.*\.js/,
    pattern: [['@libp2p/multistream-select', '@web3-storage/multistream-select']]
  })]
})
