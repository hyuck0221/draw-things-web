import { createHash } from 'node:crypto'
import type { PeerCertificate, TLSSocket } from 'node:tls'
import { BridgeError, type CertificateInfo, type NormalizedConnection } from './types.ts'

function displayName(value: PeerCertificate['subject']): string | undefined {
  if (!value) return undefined
  const commonName = value.CN
  if (Array.isArray(commonName)) return commonName.join(', ')
  return commonName ?? Object.entries(value).map(([key, item]) => `${key}=${item}`).join(', ')
}

export function certificateInfo(socket: TLSSocket): CertificateInfo {
  const certificate = socket.getPeerCertificate(true)
  const fingerprint = certificate.fingerprint256
    ?? (certificate.raw ? createHash('sha256').update(certificate.raw).digest('hex').toUpperCase().match(/.{2}/g)?.join(':') : undefined)
  return {
    fingerprintSha256: fingerprint,
    authorized: socket.authorized,
    authorizationError: typeof socket.authorizationError === 'string'
      ? socket.authorizationError
      : socket.authorizationError?.message,
    subject: displayName(certificate.subject),
    issuer: displayName(certificate.issuer),
    validFrom: certificate.valid_from,
    validTo: certificate.valid_to,
  }
}

export function verifyPinnedCertificate(
  connection: NormalizedConnection,
  certificate: CertificateInfo,
): void {
  if (!connection.tlsFingerprintSha256) return
  if (!certificate.fingerprintSha256 || certificate.fingerprintSha256 !== connection.tlsFingerprintSha256) {
    throw new BridgeError(
      'TLS_FINGERPRINT_MISMATCH',
      'The Draw Things TLS certificate no longer matches the pinned SHA-256 fingerprint.',
      502,
      {
        expected: connection.tlsFingerprintSha256,
        actual: certificate.fingerprintSha256,
      },
    )
  }
}

export function tlsWarnings(
  connection: NormalizedConnection,
  certificate?: CertificateInfo,
): string[] {
  if (!connection.tls) return []
  if (connection.verifyTls && certificate?.authorized) return []
  if (connection.tlsFingerprintSha256) {
    return certificate?.authorized
      ? []
      : ['The local TLS certificate is self-signed or privately issued; its SHA-256 fingerprint was verified.']
  }
  return [
    'TLS is encrypted but the local certificate is not verified. Confirm and save the SHA-256 fingerprint before sending prompts.',
  ]
}
