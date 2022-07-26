export default {
  files: ['test/*.spec.js'],
  timeout: '30s',
  concurrency: 5,
  verbose: true,
  nodeArguments: ['--experimental-vm-modules']
}
