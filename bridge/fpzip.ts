import { gunzipSync } from 'node:zlib'
import { BridgeError } from './types.ts'

/*!
 * FPZIP 1.3.0 - BSD 3-Clause License
 *
 * Copyright (c) 2018-2019, Lawrence Livermore National Security, LLC
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * * Neither the name of the copyright holder nor the names of its contributors
 *   may be used to endorse or promote products derived from this software without
 *   specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * Full license and DOE notice: THIRD_PARTY_NOTICES.md
 */

// fpzip 1.3.0 decoder compiled to WebAssembly. The compressed binary is embedded so the
// downloadable connector remains a single file. See THIRD_PARTY_NOTICES.md.
const FPZIP_WASM_GZIP_BASE64 = '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'

const MAX_FPZIP_INPUT_BYTES = 128 * 1024 * 1024
// Draw Things serializes Float16 tensors through FPZIP as Float32 values, so a
// 4096×4096 ARGB tensor expands to 256 MiB while decoding.
const MAX_FPZIP_OUTPUT_BYTES = 256 * 1024 * 1024

interface WasmMemory {
  readonly buffer: ArrayBuffer
  grow(deltaPages: number): number
}

interface FpzipExports {
  d: WasmMemory
  e(): void
  f(input: number): number
  g(stream: number): void
  h(stream: number): number
  i(stream: number, output: number): number
  j(size: number): number
  k(pointer: number): void
}

interface FpzipRuntime {
  exports: FpzipExports
  heap(): Uint8Array
}

let runtimePromise: Promise<FpzipRuntime> | undefined

async function createRuntime(): Promise<FpzipRuntime> {
  const wasm = gunzipSync(Buffer.from(FPZIP_WASM_GZIP_BASE64, 'base64'))
  const state: { memory?: WasmMemory; heap: Uint8Array } = { heap: new Uint8Array() }
  const updateHeap = () => {
    if (!state.memory) throw new BridgeError('FPZIP_INITIALIZATION_FAILED', 'FPZIP memory is unavailable.', 500)
    state.heap = new Uint8Array(state.memory.buffer)
  }
  const resizeHeap = (requestedSize: number) => {
    if (!state.memory || !Number.isSafeInteger(requestedSize) || requestedSize < 0 || requestedSize > 2_147_483_648) return 0
    if (requestedSize <= state.memory.buffer.byteLength) return 1
    try {
      state.memory.grow(Math.ceil((requestedSize - state.memory.buffer.byteLength) / 65_536))
      updateHeap()
      return 1
    } catch {
      return 0
    }
  }
  const wasmApi = (globalThis as unknown as {
    WebAssembly?: {
      instantiate(
        bytes: Uint8Array,
        imports: Record<string, Record<string, unknown>>,
      ): Promise<{ instance: { exports: unknown } }>
    }
  }).WebAssembly
  if (!wasmApi) throw new BridgeError('FPZIP_INITIALIZATION_FAILED', 'WebAssembly is unavailable.', 500)
  const instantiated = await wasmApi.instantiate(wasm, {
    a: {
      a: (pointer: number) => { throw new BridgeError('FPZIP_DECODE_FAILED', `FPZIP exception at ${pointer}.`, 502) },
      b: () => { throw new BridgeError('FPZIP_DECODE_FAILED', 'FPZIP aborted.', 502) },
      c: resizeHeap,
    },
  })
  const exports = instantiated.instance.exports as FpzipExports
  state.memory = exports.d
  updateHeap()
  exports.e()
  return { exports, heap: () => state.heap }
}

function checkedProduct(values: number[]): number {
  let result = 1
  for (const value of values) {
    if (!Number.isInteger(value) || value < 1 || result > Number.MAX_SAFE_INTEGER / value) {
      throw new BridgeError('FPZIP_DECODE_FAILED', 'FPZIP dimensions are invalid.', 502)
    }
    result *= value
  }
  return result
}

export async function decompressFpzip(data: Buffer, expectedElements: number): Promise<Float32Array | Float64Array> {
  if (data.length === 0 || data.length > MAX_FPZIP_INPUT_BYTES) {
    throw new BridgeError('FPZIP_DECODE_FAILED', 'FPZIP input is empty or too large.', 502)
  }
  runtimePromise ??= createRuntime()
  const runtime = await runtimePromise
  const { exports } = runtime
  let inputPointer = 0
  let streamPointer = 0
  let outputPointer = 0
  try {
    inputPointer = exports.j(data.length)
    if (!inputPointer) throw new BridgeError('FPZIP_DECODE_FAILED', 'FPZIP input allocation failed.', 502)
    runtime.heap().set(data, inputPointer)
    streamPointer = exports.f(inputPointer)
    if (!streamPointer || exports.h(streamPointer) === 0) {
      throw new BridgeError('FPZIP_DECODE_FAILED', 'FPZIP header is invalid.', 502)
    }
    const header = new Int32Array(runtime.heap().buffer, streamPointer, 6)
    const [type, , nx, ny, nz, nf] = header
    if (type !== 0 && type !== 1) throw new BridgeError('FPZIP_DECODE_FAILED', 'FPZIP scalar type is unsupported.', 502)
    const elements = checkedProduct([nx!, ny!, nz!, nf!])
    if (elements !== expectedElements) {
      throw new BridgeError('FPZIP_DECODE_FAILED', 'FPZIP dimensions do not match the Draw Things tensor header.', 502)
    }
    const bytesPerElement = type === 0 ? 4 : 8
    const outputBytes = elements * bytesPerElement
    if (outputBytes > MAX_FPZIP_OUTPUT_BYTES) {
      throw new BridgeError('FPZIP_DECODE_FAILED', 'FPZIP output exceeds the connector safety limit.', 502)
    }
    outputPointer = exports.j(outputBytes)
    if (!outputPointer) throw new BridgeError('FPZIP_DECODE_FAILED', 'FPZIP output allocation failed.', 502)
    const bytesRead = exports.i(streamPointer, outputPointer)
    if (bytesRead !== data.length) {
      throw new BridgeError('FPZIP_DECODE_FAILED', 'FPZIP payload could not be decompressed.', 502)
    }
    const copied = runtime.heap().slice(outputPointer, outputPointer + outputBytes)
    return type === 0
      ? new Float32Array(copied.buffer, copied.byteOffset, elements)
      : new Float64Array(copied.buffer, copied.byteOffset, elements)
  } finally {
    if (outputPointer) exports.k(outputPointer)
    if (streamPointer) exports.g(streamPointer)
    if (inputPointer) exports.k(inputPointer)
  }
}
