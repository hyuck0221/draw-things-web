import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { clear() {} },
})

const root = resolve(import.meta.dirname, '..')

describe('downloadable connector bundle', () => {
  it('embeds the pinned FPZIP WASM and license in one JavaScript file', async () => {
    const source = await readFile(resolve(root, 'bridge/fpzip.ts'), 'utf8')
    const match = source.match(/FPZIP_WASM_GZIP_BASE64 = '([^']+)'/)
    expect(match?.[1]).toBeTruthy()
    const base64 = match![1]!
    const gzip = Buffer.from(base64, 'base64')
    const wasm = gunzipSync(gzip)
    expect(gzip).toHaveLength(11_660)
    expect(wasm).toHaveLength(86_086)
    expect(createHash('sha256').update(wasm).digest('hex'))
      .toBe('9bad25087f8f94a22c0d7320f1c280ac8df92f25be8d4be96dff7b1517a09eee')

    const bundlePath = resolve(root, 'public/bridge/draw-things-bridge.mjs')
    const bundle = await readFile(bundlePath, 'utf8')
    const bundleSize = (await stat(bundlePath)).size
    expect(bundle.startsWith('#!/usr/bin/env node')).toBe(true)
    expect(bundle).toContain(base64)
    expect(bundle).toContain('FPZIP 1.3.0 - BSD 3-Clause License')
    expect(bundle).toContain('FPZIP_DECODE_FAILED')
    expect(bundle).not.toContain('fpzip_wasm.wasm')
    expect(bundleSize).toBeGreaterThan(100 * 1024)
    expect(bundleSize).toBeLessThan(512 * 1024)

    const runtimeFiles = await readdir(resolve(root, 'public/bridge'))
    expect(runtimeFiles).toEqual(['draw-things-bridge.mjs'])
    expect(runtimeFiles.some((file) => file.endsWith('.wasm'))).toBe(false)
  })
})
