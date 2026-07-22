function secureRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  const webCrypto = globalThis.crypto
  if (!webCrypto?.getRandomValues) {
    throw new Error('이 브라우저는 안전한 난수 생성을 지원하지 않습니다.')
  }
  webCrypto.getRandomValues(bytes)
  return bytes
}

export function randomUuid(): string {
  const bytes = secureRandomBytes(16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
