import { connect, constants, type ClientHttp2Session, type IncomingHttpHeaders } from 'node:http2'
import type { TLSSocket } from 'node:tls'
import { BridgeError, type CertificateInfo, type EchoReplyDecoded, type NormalizedConnection } from './types.ts'
import { certificateInfo, tlsWarnings, verifyPinnedCertificate } from './tls.ts'
import { encodeGenerationConfiguration } from './grpc-config.ts'
import { decodeDrawThingsTensor, drawThingsTensorToPng, encodeRgbPng } from './dt-tensor.ts'
import {
  decodeEchoReply,
  decodeGrpcFrames,
  decodeImageGenerationResponse,
  encodeEchoRequest,
  encodeImageGenerationRequest,
  frameGrpcMessage,
  GrpcFrameDecoder,
  type GrpcGenerationSignpost,
} from './protobuf.ts'

const MAX_GRPC_RESPONSE_BYTES = 64 * 1024 * 1024
const MAX_GRPC_GENERATION_WIRE_BYTES = 512 * 1024 * 1024
// A 4096×4096 ARGB Float16 tensor is exactly 128 MiB of payload plus the
// 68-byte NNC header.
const MAX_GENERATION_TENSOR_BYTES = 128 * 1024 * 1024 + 68
// The request validator permits at most 100 batches × 4 images. Account for
// each serialized NNC header in addition to the 512 MiB aggregate payload.
const MAX_TOTAL_TENSOR_BYTES = 512 * 1024 * 1024 + 400 * 68
// 64M permitted RGBA pixels can occupy about 256 MiB before PNG compression
// and about 342 MiB after base64 expansion in the incompressible worst case.
const MAX_GENERATED_IMAGE_BASE64_BYTES = 384 * 1024 * 1024

export interface GrpcEchoResult {
  echo: EchoReplyDecoded
  certificate?: CertificateInfo
  warnings: string[]
}

export interface GrpcGenerationProgress {
  signpost?: GrpcGenerationSignpost
  previewImage?: string
  downloadSize?: number | string
}

export interface GrpcGenerationResult {
  images: string[]
  scaleFactor?: number
}

function decodeGrpcMessage(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function grpcTimeoutHeader(timeoutMs: number): string {
  const milliseconds = Math.min(99_999_999, Math.max(1, Math.ceil(timeoutMs)))
  return `${milliseconds}m`
}

function requireGrpcStatus(
  headers: IncomingHttpHeaders,
  trailers: IncomingHttpHeaders,
): string {
  const value = trailers['grpc-status'] ?? headers['grpc-status']
  if (value === undefined) {
    throw new BridgeError(
      'GRPC_STATUS_MISSING',
      'Draw Things gRPC ended without a grpc-status trailer.',
      502,
    )
  }
  return String(value)
}

function waitForConnect(
  session: ClientHttp2Session,
  connection: NormalizedConnection,
): Promise<CertificateInfo | undefined> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onConnect = () => {
      cleanup()
      try {
        if (!connection.tls) {
          resolve(undefined)
          return
        }
        const socket = session.socket as TLSSocket
        const certificate = certificateInfo(socket)
        verifyPinnedCertificate(connection, certificate)
        resolve(certificate)
      } catch (error) {
        reject(error)
      }
    }
    const cleanup = () => {
      session.off('error', onError)
      session.off('connect', onConnect)
    }
    session.once('error', onError)
    session.once('connect', onConnect)
  })
}

export async function echoGrpc(connection: NormalizedConnection): Promise<GrpcEchoResult> {
  if (connection.protocol !== 'grpc') {
    throw new BridgeError('GRPC_MODE_REQUIRED', 'This operation requires the Draw Things gRPC mode.')
  }
  const displayHost = connection.host === '::1' ? '[::1]' : connection.host
  const authority = `${connection.tls ? 'https' : 'http'}://${displayHost}:${connection.port}`
  const session = connect(authority, connection.tls ? {
    rejectUnauthorized: connection.verifyTls,
    ALPNProtocols: ['h2'],
  } : undefined)
  // A failed h2c probe can emit a second session error after the connect promise
  // has already rejected. Keep a terminal listener so discovery never leaks an
  // uncaught EventEmitter "error" into the bridge process.
  session.on('error', () => {})

  let timeout: NodeJS.Timeout | undefined
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        const error = new BridgeError('UPSTREAM_TIMEOUT', 'Draw Things gRPC Echo timed out.', 504)
        session.destroy(error)
        reject(error)
      }, connection.timeoutMs)
      timeout.unref()
    })
    const certificate = await Promise.race([waitForConnect(session, connection), timeoutPromise])
    const request = session.request({
      [constants.HTTP2_HEADER_METHOD]: 'POST',
      [constants.HTTP2_HEADER_PATH]: '/ImageGenerationService/Echo',
      [constants.HTTP2_HEADER_SCHEME]: connection.tls ? 'https' : 'http',
      'content-type': 'application/grpc',
      te: 'trailers',
      'grpc-accept-encoding': 'gzip',
      'grpc-timeout': grpcTimeoutHeader(connection.timeoutMs),
      'user-agent': 'draw-things-web-bridge/0.1.0',
    })

    const responsePromise = new Promise<{ data: Buffer; headers: IncomingHttpHeaders; trailers: IncomingHttpHeaders }>((resolve, reject) => {
      const chunks: Buffer[] = []
      let received = 0
      let headers: IncomingHttpHeaders = {}
      let trailers: IncomingHttpHeaders = {}
      request.on('response', (value) => { headers = value })
      request.on('trailers', (value) => { trailers = value })
      request.on('data', (chunk: Buffer) => {
        received += chunk.length
        if (received > MAX_GRPC_RESPONSE_BYTES) {
          request.close(constants.NGHTTP2_CANCEL)
          reject(new BridgeError('UPSTREAM_RESPONSE_TOO_LARGE', 'Draw Things gRPC response is too large.', 502))
          return
        }
        chunks.push(Buffer.from(chunk))
      })
      request.once('error', reject)
      request.once('end', () => resolve({ data: Buffer.concat(chunks), headers, trailers }))
      request.end(frameGrpcMessage(encodeEchoRequest(connection.clientName, connection.sharedSecret)))
    })

    const response = await Promise.race([responsePromise, timeoutPromise])
    const httpStatus = Number(response.headers[constants.HTTP2_HEADER_STATUS] ?? 0)
    if (httpStatus !== 200) {
      throw new BridgeError('GRPC_HTTP_ERROR', `Draw Things gRPC endpoint returned HTTP ${httpStatus}.`, 502)
    }
    const contentType = String(response.headers['content-type'] ?? '')
    if (!contentType.toLowerCase().startsWith('application/grpc')) {
      throw new BridgeError('NOT_GRPC_SERVER', 'The selected local endpoint did not return gRPC content.', 502)
    }
    const grpcStatus = requireGrpcStatus(response.headers, response.trailers)
    if (grpcStatus !== '0') {
      throw new BridgeError(
        'GRPC_STATUS_ERROR',
        decodeGrpcMessage(response.trailers['grpc-message'] ?? response.headers['grpc-message'])
          || `Draw Things gRPC returned status ${grpcStatus}.`,
        502,
        { grpcStatus },
      )
    }
    const frames = decodeGrpcFrames(response.data, String(response.headers['grpc-encoding'] ?? '') || undefined)
    if (frames.length !== 1 || !frames[0]) {
      throw new BridgeError('GRPC_FRAME_ERROR', 'Draw Things Echo returned an unexpected number of messages.', 502)
    }
    return {
      echo: decodeEchoReply(frames[0]),
      certificate,
      warnings: tlsWarnings(connection, certificate),
    }
  } finally {
    if (timeout) clearTimeout(timeout)
    session.close()
  }
}

/**
 * Runs Draw Things' native server-streaming GenerateImage RPC.
 *
 * The native service returns serialized NNC tensors rather than browser image files.
 * Each complete tensor is decoded and converted to PNG before it leaves the connector.
 */
export async function generateGrpcImages(
  connection: NormalizedConnection,
  prompt: string,
  negativePrompt: string,
  parameters: Record<string, unknown>,
  signal?: AbortSignal,
  onProgress?: (progress: GrpcGenerationProgress) => void | Promise<void>,
): Promise<GrpcGenerationResult> {
  if (connection.protocol !== 'grpc') {
    throw new BridgeError('GRPC_MODE_REQUIRED', 'This operation requires the Draw Things gRPC mode.')
  }
  if (signal?.aborted) throw new BridgeError('ABORTED', 'Draw Things gRPC generation was cancelled.', 499)

  const configuration = encodeGenerationConfiguration(parameters)
  const requestBody = frameGrpcMessage(encodeImageGenerationRequest({
    prompt,
    negativePrompt,
    configuration,
    user: connection.clientName,
    sharedSecret: connection.sharedSecret,
    chunked: true,
  }))
  const displayHost = connection.host === '::1' ? '[::1]' : connection.host
  const authority = `${connection.tls ? 'https' : 'http'}://${displayHost}:${connection.port}`
  const session = connect(authority, connection.tls ? {
    rejectUnauthorized: connection.verifyTls,
    ALPNProtocols: ['h2'],
  } : undefined)
  session.on('error', () => {})

  let timeout: NodeJS.Timeout | undefined
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        const error = new BridgeError('UPSTREAM_TIMEOUT', 'Draw Things gRPC generation timed out.', 504)
        session.destroy(error)
        reject(error)
      }, connection.timeoutMs)
      timeout.unref()
    })
    let connectAbortListener: (() => void) | undefined
    const connectAbortPromise = signal ? new Promise<never>((_, reject) => {
      let handled = false
      connectAbortListener = () => {
        if (handled) return
        handled = true
        const error = new BridgeError('ABORTED', 'Draw Things gRPC generation was cancelled.', 499)
        reject(error)
        session.destroy(error)
      }
      signal.addEventListener('abort', connectAbortListener, { once: true })
      if (signal.aborted) connectAbortListener()
    }) : undefined
    try {
      await Promise.race([
        waitForConnect(session, connection),
        timeoutPromise,
        ...(connectAbortPromise ? [connectAbortPromise] : []),
      ])
    } finally {
      if (connectAbortListener) signal?.removeEventListener('abort', connectAbortListener)
    }
    if (signal?.aborted) throw new BridgeError('ABORTED', 'Draw Things gRPC generation was cancelled.', 499)

    const request = session.request({
      [constants.HTTP2_HEADER_METHOD]: 'POST',
      [constants.HTTP2_HEADER_PATH]: '/ImageGenerationService/GenerateImage',
      [constants.HTTP2_HEADER_SCHEME]: connection.tls ? 'https' : 'http',
      'content-type': 'application/grpc',
      te: 'trailers',
      'grpc-accept-encoding': 'gzip',
      'grpc-timeout': grpcTimeoutHeader(connection.timeoutMs),
      'user-agent': 'draw-things-web-bridge/0.1.0',
    })

    const responsePromise = new Promise<GrpcGenerationResult>((resolve, reject) => {
      let headers: IncomingHttpHeaders = {}
      let trailers: IncomingHttpHeaders = {}
      let decoder: GrpcFrameDecoder | undefined
      let receivedWireBytes = 0
      let totalTensorBytes = 0
      let totalBase64Bytes = 0
      let pendingTensorChunks: Buffer[] = []
      let pendingTensorBytes = 0
      let scaleFactor: number | undefined
      const images: string[] = []
      let processing = Promise.resolve()
      let settled = false

      const cleanup = () => signal?.removeEventListener('abort', onAbort)
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        cleanup()
        if (!request.closed && !request.destroyed) request.close(constants.NGHTTP2_CANCEL)
        reject(error)
      }
      const onAbort = () => fail(new BridgeError('ABORTED', 'Draw Things gRPC generation was cancelled.', 499))
      request.once('error', fail)
      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) {
        onAbort()
        return
      }

      const emitProgress = async (progress: GrpcGenerationProgress) => {
        if (settled || signal?.aborted) return
        if (onProgress) await onProgress(progress)
      }
      const appendTensorBytes = (bytes: number) => {
        totalTensorBytes += bytes
        if (totalTensorBytes > MAX_TOTAL_TENSOR_BYTES) {
          throw new BridgeError('UPSTREAM_RESPONSE_TOO_LARGE', 'Draw Things returned too much tensor data.', 502)
        }
      }
      const finishTensor = async (parts: Buffer[]) => {
        const tensorBytes = parts.reduce((total, part) => total + part.length, 0)
        if (tensorBytes === 0 || tensorBytes > MAX_GENERATION_TENSOR_BYTES) {
          throw new BridgeError('UPSTREAM_RESPONSE_TOO_LARGE', 'Draw Things returned an invalid or oversized image tensor.', 502)
        }
        const png = await drawThingsTensorToPng(parts.length === 1 ? parts[0]! : Buffer.concat(parts, tensorBytes))
        if (settled || signal?.aborted) return
        const encoded = png.toString('base64')
        totalBase64Bytes += Buffer.byteLength(encoded, 'ascii')
        if (totalBase64Bytes > MAX_GENERATED_IMAGE_BASE64_BYTES) {
          throw new BridgeError('UPSTREAM_RESPONSE_TOO_LARGE', 'Generated PNG results exceed the connector safety limit.', 502)
        }
        images.push(encoded)
      }
      const processFrame = async (frame: Buffer) => {
        if (settled || signal?.aborted) return
        const response = decodeImageGenerationResponse(frame)
        if (response.scaleFactor !== undefined) scaleFactor = response.scaleFactor
        if (response.currentSignpost || response.downloadSize !== undefined) {
          await emitProgress({
            ...(response.currentSignpost ? { signpost: response.currentSignpost } : {}),
            ...(response.downloadSize !== undefined ? { downloadSize: response.downloadSize } : {}),
          })
        }
        if (response.previewImage) {
          if (response.previewImage.length > MAX_GENERATION_TENSOR_BYTES) {
            throw new BridgeError('UPSTREAM_RESPONSE_TOO_LARGE', 'Draw Things preview tensor is too large.', 502)
          }
          // Sampling progress is commonly a model-specific latent (4, 16, or more
          // channels), not a browser image. Only attempt the explicitly RGB shape;
          // an optional/malformed preview must never abort the final generation.
          const previewChannels = response.previewImage.length >= 36
            ? response.previewImage.readUInt32LE(32)
            : 0
          if (previewChannels === 3) {
            try {
              const previewTensor = await decodeDrawThingsTensor(response.previewImage)
              if (settled || signal?.aborted) return
              await emitProgress({ previewImage: encodeRgbPng(previewTensor).toString('base64') })
            } catch {
              // Keep processing the authoritative final image tensor.
            }
          }
        }
        if (response.generatedImages.length === 0) return
        if (response.chunkState === 'unknown') {
          throw new BridgeError('GRPC_CHUNK_STATE_ERROR', 'Draw Things returned an unknown image chunk state.', 502)
        }
        for (const chunk of response.generatedImages) {
          if (settled || signal?.aborted) return
          appendTensorBytes(chunk.length)
          if (response.chunkState === 'more') {
            pendingTensorBytes += chunk.length
            if (pendingTensorBytes > MAX_GENERATION_TENSOR_BYTES) {
              throw new BridgeError('UPSTREAM_RESPONSE_TOO_LARGE', 'Draw Things image tensor chunks are too large.', 502)
            }
            pendingTensorChunks.push(chunk)
            continue
          }
          if (pendingTensorChunks.length > 0) {
            pendingTensorBytes += chunk.length
            if (pendingTensorBytes > MAX_GENERATION_TENSOR_BYTES) {
              throw new BridgeError('UPSTREAM_RESPONSE_TOO_LARGE', 'Draw Things image tensor chunks are too large.', 502)
            }
            await finishTensor([...pendingTensorChunks, chunk])
            pendingTensorChunks = []
            pendingTensorBytes = 0
          } else {
            await finishTensor([chunk])
          }
        }
      }

      request.on('response', (value) => {
        headers = value
        decoder = new GrpcFrameDecoder(String(value['grpc-encoding'] ?? '') || undefined)
      })
      request.on('trailers', (value) => { trailers = value })
      request.on('data', (chunk: Buffer) => {
        if (settled) return
        receivedWireBytes += chunk.length
        if (receivedWireBytes > MAX_GRPC_GENERATION_WIRE_BYTES) {
          fail(new BridgeError('UPSTREAM_RESPONSE_TOO_LARGE', 'Draw Things gRPC generation response is too large.', 502))
          return
        }
        try {
          if (!decoder) throw new BridgeError('GRPC_FRAME_ERROR', 'Draw Things sent gRPC data before response headers.', 502)
          const frames = decoder.push(Buffer.from(chunk))
          processing = processing.then(async () => {
            for (const frame of frames) {
              if (settled || signal?.aborted) break
              await processFrame(frame)
            }
          })
          void processing.catch(fail)
        } catch (error) {
          fail(error)
        }
      })
      request.once('end', () => {
        void processing.then(() => {
          if (settled) return
          decoder?.finish()
          if (pendingTensorChunks.length > 0) {
            throw new BridgeError('GRPC_CHUNK_STATE_ERROR', 'Draw Things ended before the last image tensor chunk.', 502)
          }
          const httpStatus = Number(headers[constants.HTTP2_HEADER_STATUS] ?? 0)
          if (httpStatus !== 200) {
            throw new BridgeError('GRPC_HTTP_ERROR', `Draw Things gRPC endpoint returned HTTP ${httpStatus}.`, 502)
          }
          const contentType = String(headers['content-type'] ?? '')
          if (!contentType.toLowerCase().startsWith('application/grpc')) {
            throw new BridgeError('NOT_GRPC_SERVER', 'The selected local endpoint did not return gRPC content.', 502)
          }
          const grpcStatus = requireGrpcStatus(headers, trailers)
          if (grpcStatus !== '0') {
            throw new BridgeError(
              'GRPC_STATUS_ERROR',
              decodeGrpcMessage(trailers['grpc-message'] ?? headers['grpc-message'])
                || `Draw Things gRPC returned status ${grpcStatus}.`,
              502,
              { grpcStatus },
            )
          }
          if (images.length === 0) {
            throw new BridgeError('GRPC_EMPTY_RESULT', 'Draw Things gRPC completed without a generated image.', 502)
          }
          settled = true
          cleanup()
          resolve({ images, ...(scaleFactor === undefined ? {} : { scaleFactor }) })
        }).catch(fail)
      })
      request.end(requestBody)
    })

    return await Promise.race([responsePromise, timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
    session.close()
  }
}
