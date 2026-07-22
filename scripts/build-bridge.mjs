import { chmod, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(projectRoot, 'public/bridge/draw-things-bridge.mjs')

await mkdir(dirname(output), { recursive: true })
await build({
  entryPoints: [resolve(projectRoot, 'bridge/server.ts')],
  outfile: output,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  treeShaking: true,
  legalComments: 'inline',
  minify: false,
  sourcemap: false,
  banner: { js: '#!/usr/bin/env node' },
})
await chmod(output, 0o755)

process.stdout.write(`Built ${output}\n`)
