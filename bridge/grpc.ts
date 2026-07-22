import { connect, constants, type ClientHttp2Session, type IncomingHttpHeaders } from 'node:http2'
import type { TLSSocket } from 'node:tls'
import { BridgeError, type CertificateInfo, type EchoReplyDecoded, type NormalizedConnection } from './types.ts'
import { certificateInfo, tlsWarnings, verifyPinnedCertificate } from './tls.ts'
import { decodeEchoReply, decodeGrpcFrames, encodeEchoRequest, frameGrpcMessage } from './protobuf.ts'

const MAX_GRPC_RESPONSE_BYTES = 64 * 1024 * 1024

export interface GrpcEchoResult {
  echo: EchoReplyDecoded
  certificate?: CertificateInfo
  warnings: string[]
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
    const grpcStatus = String(response.trailers['grpc-status'] ?? response.headers['grpc-status'] ?? '0')
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
