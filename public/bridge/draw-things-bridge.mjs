#!/usr/bin/env node

// bridge/server.ts
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { resolve as resolve2 } from "node:path";
import { pathToFileURL } from "node:url";

// bridge/grpc.ts
import { connect, constants } from "node:http2";

// bridge/types.ts
var LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1"];
var BridgeError = class extends Error {
  code;
  status;
  details;
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
};

// bridge/tls.ts
import { createHash } from "node:crypto";
function displayName(value) {
  if (!value) return void 0;
  const commonName = value.CN;
  if (Array.isArray(commonName)) return commonName.join(", ");
  return commonName ?? Object.entries(value).map(([key, item]) => `${key}=${item}`).join(", ");
}
function certificateInfo(socket) {
  const certificate = socket.getPeerCertificate(true);
  const fingerprint = certificate.fingerprint256 ?? (certificate.raw ? createHash("sha256").update(certificate.raw).digest("hex").toUpperCase().match(/.{2}/g)?.join(":") : void 0);
  return {
    fingerprintSha256: fingerprint,
    authorized: socket.authorized,
    authorizationError: typeof socket.authorizationError === "string" ? socket.authorizationError : socket.authorizationError?.message,
    subject: displayName(certificate.subject),
    issuer: displayName(certificate.issuer),
    validFrom: certificate.valid_from,
    validTo: certificate.valid_to
  };
}
function verifyPinnedCertificate(connection, certificate) {
  if (!connection.tlsFingerprintSha256) return;
  if (!certificate.fingerprintSha256 || certificate.fingerprintSha256 !== connection.tlsFingerprintSha256) {
    throw new BridgeError(
      "TLS_FINGERPRINT_MISMATCH",
      "The Draw Things TLS certificate no longer matches the pinned SHA-256 fingerprint.",
      502,
      {
        expected: connection.tlsFingerprintSha256,
        actual: certificate.fingerprintSha256
      }
    );
  }
}
function tlsWarnings(connection, certificate) {
  if (!connection.tls) return [];
  if (connection.verifyTls && certificate?.authorized) return [];
  if (connection.tlsFingerprintSha256) {
    return certificate?.authorized ? [] : ["The local TLS certificate is self-signed or privately issued; its SHA-256 fingerprint was verified."];
  }
  return [
    "TLS is encrypted but the local certificate is not verified. Confirm and save the SHA-256 fingerprint before sending prompts."
  ];
}

// bridge/protobuf.ts
import { gunzipSync } from "node:zlib";
var EMPTY_METADATA = {
  models: [],
  loras: [],
  controlNets: [],
  textualInversions: [],
  upscalers: []
};
function encodeVarint(value) {
  let remaining = BigInt(value);
  if (remaining < 0n) throw new BridgeError("PROTOBUF_ENCODE_ERROR", "Cannot encode a negative varint.");
  const bytes = [];
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining > 0n) byte |= 128;
    bytes.push(byte);
  } while (remaining > 0n);
  return Buffer.from(bytes);
}
function encodeStringField(field, value) {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([encodeVarint(field << 3 | 2), encodeVarint(bytes.length), bytes]);
}
function encodeEchoRequest(name, sharedSecret) {
  const fields = [encodeStringField(1, name)];
  if (sharedSecret !== void 0) fields.push(encodeStringField(2, sharedSecret));
  return Buffer.concat(fields);
}
function readVarint(buffer, cursor) {
  let result = 0n;
  let shift = 0n;
  for (let index = 0; index < 10; index += 1) {
    if (cursor.offset >= buffer.length) {
      throw new BridgeError("PROTOBUF_DECODE_ERROR", "Truncated protobuf varint.", 502);
    }
    const byte = buffer[cursor.offset++];
    result |= BigInt(byte & 127) << shift;
    if ((byte & 128) === 0) return result;
    shift += 7n;
  }
  throw new BridgeError("PROTOBUF_DECODE_ERROR", "Protobuf varint exceeds 10 bytes.", 502);
}
function readLengthDelimited(buffer, cursor) {
  const lengthValue = readVarint(buffer, cursor);
  if (lengthValue > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new BridgeError("PROTOBUF_DECODE_ERROR", "Protobuf field length is too large.", 502);
  }
  const length = Number(lengthValue);
  const end = cursor.offset + length;
  if (length < 0 || end > buffer.length) {
    throw new BridgeError("PROTOBUF_DECODE_ERROR", "Truncated protobuf field.", 502);
  }
  const value = buffer.subarray(cursor.offset, end);
  cursor.offset = end;
  return value;
}
function skipField(buffer, cursor, wireType) {
  switch (wireType) {
    case 0:
      readVarint(buffer, cursor);
      return;
    case 1:
      cursor.offset += 8;
      break;
    case 2:
      readLengthDelimited(buffer, cursor);
      return;
    case 5:
      cursor.offset += 4;
      break;
    default:
      throw new BridgeError("PROTOBUF_DECODE_ERROR", `Unsupported protobuf wire type ${wireType}.`, 502);
  }
  if (cursor.offset > buffer.length) {
    throw new BridgeError("PROTOBUF_DECODE_ERROR", "Truncated protobuf fixed-width field.", 502);
  }
}
function jsonMetadata(bytes) {
  if (bytes.length === 0) return [];
  const json = bytes.toString("utf8");
  try {
    return JSON.parse(json);
  } catch {
    return {
      parseError: "Draw Things returned invalid JSON metadata.",
      rawBase64: bytes.toString("base64")
    };
  }
}
function decodeMetadataOverride(buffer) {
  const result = { ...EMPTY_METADATA };
  const cursor = { offset: 0 };
  while (cursor.offset < buffer.length) {
    const tag = Number(readVarint(buffer, cursor));
    const field = tag >>> 3;
    const wireType = tag & 7;
    if (wireType !== 2 || field < 1 || field > 5) {
      skipField(buffer, cursor, wireType);
      continue;
    }
    const value = jsonMetadata(readLengthDelimited(buffer, cursor));
    if (field === 1) result.models = value;
    if (field === 2) result.loras = value;
    if (field === 3) result.controlNets = value;
    if (field === 4) result.textualInversions = value;
    if (field === 5) result.upscalers = value;
  }
  return result;
}
function bigintToJson(value) {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
}
function decodeThresholds(buffer) {
  const cursor = { offset: 0 };
  let community = 0;
  let plus = 0;
  let expireAt = 0;
  while (cursor.offset < buffer.length) {
    const tag = Number(readVarint(buffer, cursor));
    const field = tag >>> 3;
    const wireType = tag & 7;
    if ((field === 1 || field === 2) && wireType === 1) {
      if (cursor.offset + 8 > buffer.length) {
        throw new BridgeError("PROTOBUF_DECODE_ERROR", "Truncated threshold value.", 502);
      }
      const value = buffer.readDoubleLE(cursor.offset);
      cursor.offset += 8;
      if (field === 1) community = value;
      if (field === 2) plus = value;
    } else if (field === 3 && wireType === 0) {
      expireAt = bigintToJson(readVarint(buffer, cursor));
    } else {
      skipField(buffer, cursor, wireType);
    }
  }
  return { community, plus, expireAt };
}
function decodeEchoReply(buffer) {
  const result = {
    message: "",
    files: [],
    metadata: { ...EMPTY_METADATA },
    sharedSecretMissing: false,
    serverIdentifier: "0"
  };
  const cursor = { offset: 0 };
  while (cursor.offset < buffer.length) {
    const tag = Number(readVarint(buffer, cursor));
    const field = tag >>> 3;
    const wireType = tag & 7;
    if (field === 1 && wireType === 2) {
      result.message = readLengthDelimited(buffer, cursor).toString("utf8");
    } else if (field === 2 && wireType === 2) {
      result.files.push(readLengthDelimited(buffer, cursor).toString("utf8"));
    } else if (field === 3 && wireType === 2) {
      result.metadata = decodeMetadataOverride(readLengthDelimited(buffer, cursor));
    } else if (field === 4 && wireType === 0) {
      result.sharedSecretMissing = readVarint(buffer, cursor) !== 0n;
    } else if (field === 5 && wireType === 2) {
      result.thresholds = decodeThresholds(readLengthDelimited(buffer, cursor));
    } else if (field === 6 && wireType === 0) {
      result.serverIdentifier = readVarint(buffer, cursor).toString();
    } else {
      skipField(buffer, cursor, wireType);
    }
  }
  return result;
}
function frameGrpcMessage(payload) {
  const header = Buffer.allocUnsafe(5);
  header[0] = 0;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}
function decodeGrpcFrames(data, encoding, maximumMessageBytes = 64 * 1024 * 1024) {
  const frames = [];
  let offset = 0;
  while (offset < data.length) {
    if (data.length - offset < 5) {
      throw new BridgeError("GRPC_FRAME_ERROR", "Truncated gRPC frame header.", 502);
    }
    const compressed = data[offset];
    const length = data.readUInt32BE(offset + 1);
    offset += 5;
    if (length > maximumMessageBytes || offset + length > data.length) {
      throw new BridgeError("GRPC_FRAME_ERROR", "Invalid or oversized gRPC frame.", 502);
    }
    const payload = data.subarray(offset, offset + length);
    offset += length;
    if (compressed === 0) {
      frames.push(payload);
    } else if (compressed === 1 && encoding?.toLowerCase() === "gzip") {
      const decompressed = gunzipSync(payload, { maxOutputLength: maximumMessageBytes });
      frames.push(decompressed);
    } else {
      throw new BridgeError(
        "GRPC_COMPRESSION_UNSUPPORTED",
        `Unsupported gRPC compression encoding: ${encoding ?? "missing"}.`,
        502
      );
    }
  }
  return frames;
}

// bridge/grpc.ts
var MAX_GRPC_RESPONSE_BYTES = 64 * 1024 * 1024;
function decodeGrpcMessage(value) {
  if (typeof value !== "string") return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function grpcTimeoutHeader(timeoutMs) {
  const milliseconds = Math.min(99999999, Math.max(1, Math.ceil(timeoutMs)));
  return `${milliseconds}m`;
}
function waitForConnect(session, connection) {
  return new Promise((resolve3, reject) => {
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onConnect = () => {
      cleanup();
      try {
        if (!connection.tls) {
          resolve3(void 0);
          return;
        }
        const socket = session.socket;
        const certificate = certificateInfo(socket);
        verifyPinnedCertificate(connection, certificate);
        resolve3(certificate);
      } catch (error) {
        reject(error);
      }
    };
    const cleanup = () => {
      session.off("error", onError);
      session.off("connect", onConnect);
    };
    session.once("error", onError);
    session.once("connect", onConnect);
  });
}
async function echoGrpc(connection) {
  if (connection.protocol !== "grpc") {
    throw new BridgeError("GRPC_MODE_REQUIRED", "This operation requires the Draw Things gRPC mode.");
  }
  const displayHost = connection.host === "::1" ? "[::1]" : connection.host;
  const authority = `${connection.tls ? "https" : "http"}://${displayHost}:${connection.port}`;
  const session = connect(authority, connection.tls ? {
    rejectUnauthorized: connection.verifyTls,
    ALPNProtocols: ["h2"]
  } : void 0);
  session.on("error", () => {
  });
  let timeout;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        const error = new BridgeError("UPSTREAM_TIMEOUT", "Draw Things gRPC Echo timed out.", 504);
        session.destroy(error);
        reject(error);
      }, connection.timeoutMs);
      timeout.unref();
    });
    const certificate = await Promise.race([waitForConnect(session, connection), timeoutPromise]);
    const request = session.request({
      [constants.HTTP2_HEADER_METHOD]: "POST",
      [constants.HTTP2_HEADER_PATH]: "/ImageGenerationService/Echo",
      [constants.HTTP2_HEADER_SCHEME]: connection.tls ? "https" : "http",
      "content-type": "application/grpc",
      te: "trailers",
      "grpc-accept-encoding": "gzip",
      "grpc-timeout": grpcTimeoutHeader(connection.timeoutMs),
      "user-agent": "draw-things-web-bridge/0.1.0"
    });
    const responsePromise = new Promise((resolve3, reject) => {
      const chunks = [];
      let received = 0;
      let headers = {};
      let trailers = {};
      request.on("response", (value) => {
        headers = value;
      });
      request.on("trailers", (value) => {
        trailers = value;
      });
      request.on("data", (chunk) => {
        received += chunk.length;
        if (received > MAX_GRPC_RESPONSE_BYTES) {
          request.close(constants.NGHTTP2_CANCEL);
          reject(new BridgeError("UPSTREAM_RESPONSE_TOO_LARGE", "Draw Things gRPC response is too large.", 502));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      request.once("error", reject);
      request.once("end", () => resolve3({ data: Buffer.concat(chunks), headers, trailers }));
      request.end(frameGrpcMessage(encodeEchoRequest(connection.clientName, connection.sharedSecret)));
    });
    const response = await Promise.race([responsePromise, timeoutPromise]);
    const httpStatus = Number(response.headers[constants.HTTP2_HEADER_STATUS] ?? 0);
    if (httpStatus !== 200) {
      throw new BridgeError("GRPC_HTTP_ERROR", `Draw Things gRPC endpoint returned HTTP ${httpStatus}.`, 502);
    }
    const contentType = String(response.headers["content-type"] ?? "");
    if (!contentType.toLowerCase().startsWith("application/grpc")) {
      throw new BridgeError("NOT_GRPC_SERVER", "The selected local endpoint did not return gRPC content.", 502);
    }
    const grpcStatus = String(response.trailers["grpc-status"] ?? response.headers["grpc-status"] ?? "0");
    if (grpcStatus !== "0") {
      throw new BridgeError(
        "GRPC_STATUS_ERROR",
        decodeGrpcMessage(response.trailers["grpc-message"] ?? response.headers["grpc-message"]) || `Draw Things gRPC returned status ${grpcStatus}.`,
        502,
        { grpcStatus }
      );
    }
    const frames = decodeGrpcFrames(response.data, String(response.headers["grpc-encoding"] ?? "") || void 0);
    if (frames.length !== 1 || !frames[0]) {
      throw new BridgeError("GRPC_FRAME_ERROR", "Draw Things Echo returned an unexpected number of messages.", 502);
    }
    return {
      echo: decodeEchoReply(frames[0]),
      certificate,
      warnings: tlsWarnings(connection, certificate)
    };
  } finally {
    if (timeout) clearTimeout(timeout);
    session.close();
  }
}

// bridge/http-upstream.ts
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";

// bridge/security.ts
import { createHash as createHash2, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
var DEFAULT_BRIDGE_PORT = 47821;
var DEFAULT_DRAW_THINGS_PORT = 7859;
var MAX_CONTROL_BODY_BYTES = 256 * 1024;
var MAX_GENERATE_BODY_BYTES = 128 * 1024 * 1024;
var MAX_UPSTREAM_RESPONSE_BYTES = 512 * 1024 * 1024;
var DEFAULT_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://[::1]:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://[::1]:4173"
];
var SAFE_REQUEST_HEADERS = /* @__PURE__ */ new Set([
  "authorization",
  "content-type",
  "x-draw-things-bridge-token",
  "x-draw-things-pairing-token"
]);
function normalizeOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new BridgeError("INVALID_ORIGIN", `Invalid origin: ${value}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin === "null") {
    throw new BridgeError("INVALID_ORIGIN", `Only http(s) origins are supported: ${value}`);
  }
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new BridgeError("INVALID_ORIGIN", `Origin must not include credentials, a path, query, or fragment: ${value}`);
  }
  return parsed.origin;
}
function isLoopbackBindAddress(value) {
  return value === "127.0.0.1" || value === "::1";
}
function normalizeBridgeBindAddress(value) {
  if (value !== void 0 && typeof value !== "string") {
    throw new BridgeError("INVALID_BRIDGE_BIND", "Bridge bind must be a string address.");
  }
  const raw = typeof value === "string" ? value.trim().replace(/^\[|\]$/g, "").toLowerCase() : "127.0.0.1";
  if (raw === "localhost" || raw === "127.0.0.1") return "127.0.0.1";
  if (raw === "::1") return "::1";
  if (raw === "100.100.100.100") {
    throw new BridgeError("INVALID_BRIDGE_BIND", "The Tailscale Quad100 service address cannot be used as a connector bind address.");
  }
  if (isIP(raw) === 4) {
    const octets = raw.split(".").map(Number);
    if (octets[0] === 100 && (octets[1] ?? 0) >= 64 && (octets[1] ?? 0) <= 127) return raw;
  }
  if (isIP(raw) === 6 && raw.startsWith("fd7a:115c:a1e0:")) {
    return new URL(`http://[${raw}]`).hostname.replace(/^\[|\]$/g, "");
  }
  throw new BridgeError(
    "INVALID_BRIDGE_BIND",
    "Bridge bind must be 127.0.0.1, ::1, or this Mac's Tailscale IP. Wildcard, LAN, and public addresses are rejected."
  );
}
function normalizeLoopbackHost(value) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "127.0.0.1";
  const unbracketed = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  if (!LOOPBACK_HOSTS.includes(unbracketed)) {
    throw new BridgeError(
      "LOOPBACK_REQUIRED",
      "The local connector only permits localhost, 127.0.0.1, or ::1."
    );
  }
  return unbracketed;
}
function normalizeFingerprint(value) {
  if (value === void 0 || value === null || value === "") return void 0;
  if (typeof value !== "string") {
    throw new BridgeError("INVALID_TLS_FINGERPRINT", "TLS fingerprint must be a SHA-256 string.");
  }
  const normalized = value.replaceAll(":", "").trim().toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(normalized)) {
    throw new BridgeError(
      "INVALID_TLS_FINGERPRINT",
      "TLS fingerprint must contain exactly 64 hexadecimal SHA-256 characters."
    );
  }
  return normalized.match(/.{2}/g)?.join(":");
}
function normalizePort(value) {
  const port = value === void 0 ? DEFAULT_DRAW_THINGS_PORT : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BridgeError("INVALID_PORT", "Port must be an integer from 1 to 65535.");
  }
  return port;
}
function normalizeTimeout(value, fallback, maximum) {
  const timeout = value === void 0 ? fallback : Number(value);
  if (!Number.isInteger(timeout) || timeout < 250 || timeout > maximum) {
    throw new BridgeError(
      "INVALID_TIMEOUT",
      `Timeout must be an integer from 250 to ${maximum} milliseconds.`
    );
  }
  return timeout;
}
function normalizeConnection(value, purpose = "control") {
  if (!isPlainObject(value)) {
    throw new BridgeError("INVALID_CONNECTION", "connection must be a JSON object.");
  }
  const protocol = value.protocol;
  if (protocol !== "http" && protocol !== "grpc") {
    throw new BridgeError("INVALID_PROTOCOL", 'protocol must be either "http" or "grpc".');
  }
  const sharedSecret = value.sharedSecret;
  if (sharedSecret !== void 0 && (typeof sharedSecret !== "string" || sharedSecret.length > 4096)) {
    throw new BridgeError("INVALID_SHARED_SECRET", "sharedSecret must be a string up to 4096 characters.");
  }
  const clientName = value.clientName ?? "draw-things-web";
  if (typeof clientName !== "string" || clientName.length < 1 || clientName.length > 128 || [...clientName].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  })) {
    throw new BridgeError("INVALID_CLIENT_NAME", "clientName must contain 1-128 printable characters.");
  }
  const fallbackTimeout = purpose === "generation" ? 15 * 6e4 : 4e3;
  const maximumTimeout = purpose === "generation" ? 60 * 6e4 : 6e4;
  return {
    protocol,
    host: normalizeLoopbackHost(value.host),
    port: normalizePort(value.port),
    tls: value.tls === true,
    verifyTls: value.verifyTls === true || value.allowSelfSignedCertificate === false,
    tlsFingerprintSha256: normalizeFingerprint(value.tlsFingerprintSha256),
    sharedSecret,
    clientName,
    timeoutMs: normalizeTimeout(value.timeoutMs, fallbackTimeout, maximumTimeout)
  };
}
function publicConnection(connection) {
  const { sharedSecret, ...safe } = connection;
  return { ...safe, hasSharedSecret: Boolean(sharedSecret) };
}
function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function assertSafeJson(value, depth = 0) {
  if (depth > 64) throw new BridgeError("JSON_TOO_DEEP", "JSON nesting exceeds 64 levels.");
  if (Array.isArray(value)) {
    for (const item of value) assertSafeJson(item, depth + 1);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      throw new BridgeError("UNSAFE_JSON_KEY", `JSON key "${key}" is not allowed.`);
    }
    assertSafeJson(child, depth + 1);
  }
}
async function readJsonBody(request, limit) {
  const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new BridgeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.", 415);
  }
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new BridgeError("BODY_TOO_LARGE", `Request body exceeds ${limit} bytes.`, 413);
  }
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > limit) {
      throw new BridgeError("BODY_TOO_LARGE", `Request body exceeds ${limit} bytes.`, 413);
    }
    chunks.push(buffer);
  }
  if (received === 0) throw new BridgeError("EMPTY_BODY", "A JSON request body is required.");
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BridgeError("INVALID_JSON", "Request body is not valid JSON.");
  }
  assertSafeJson(parsed);
  return parsed;
}
function validateHostHeader(request, expectedPort, bindAddress = "127.0.0.1") {
  const header = request.headers.host;
  if (!header || /[\\/?#@\s]/.test(header)) {
    throw new BridgeError("INVALID_HOST", "Invalid Host header.", 403);
  }
  let parsed;
  try {
    parsed = new URL(`http://${header}`);
  } catch {
    throw new BridgeError("INVALID_HOST", "Invalid Host header.", 403);
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const port = parsed.port ? Number(parsed.port) : 80;
  const allowedHosts = isLoopbackBindAddress(bindAddress) ? LOOPBACK_HOSTS : [bindAddress];
  if (!allowedHosts.includes(host) || port !== expectedPort) {
    throw new BridgeError("INVALID_HOST", "Host must exactly address the configured connector bind and port.", 403);
  }
}
function validateOrigin(request, response, allowedOrigins) {
  const originHeader = request.headers.origin;
  if (originHeader === void 0) return void 0;
  if (Array.isArray(originHeader) || !allowedOrigins.has(originHeader)) {
    throw new BridgeError("ORIGIN_NOT_ALLOWED", "This website origin is not allowed.", 403);
  }
  response.setHeader("Access-Control-Allow-Origin", originHeader);
  response.setHeader(
    "Vary",
    "Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Access-Control-Request-Private-Network"
  );
  return originHeader;
}
function handlePreflight(request, response, allowedMethods) {
  const requestedMethod = String(request.headers["access-control-request-method"] ?? "").toUpperCase();
  if (!allowedMethods.includes(requestedMethod)) {
    throw new BridgeError("METHOD_NOT_ALLOWED", "Requested CORS method is not allowed.", 405);
  }
  const requestedHeaders = String(request.headers["access-control-request-headers"] ?? "").split(",").map((header) => header.trim().toLowerCase()).filter(Boolean);
  if (requestedHeaders.some((header) => !SAFE_REQUEST_HEADERS.has(header))) {
    throw new BridgeError("HEADER_NOT_ALLOWED", "Requested CORS headers are not allowed.", 403);
  }
  response.statusCode = 204;
  response.setHeader("Access-Control-Allow-Methods", allowedMethods.join(", "));
  response.setHeader("Access-Control-Allow-Headers", [...SAFE_REQUEST_HEADERS].join(", "));
  response.setHeader("Access-Control-Max-Age", "600");
  if (String(request.headers["access-control-request-private-network"]).toLowerCase() === "true") {
    response.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  response.end();
}
function constantTimeMatch(actual, expected) {
  const actualDigest = createHash2("sha256").update(actual).digest();
  const expectedDigest = createHash2("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}
function validateToken(request, expected) {
  if (!expected) return;
  const authorization = request.headers.authorization;
  const bearer = typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7) : void 0;
  const custom = request.headers["x-draw-things-bridge-token"];
  const pairing = request.headers["x-draw-things-pairing-token"];
  const candidate = bearer ?? (typeof custom === "string" ? custom : void 0) ?? (typeof pairing === "string" ? pairing : "");
  if (!constantTimeMatch(candidate, expected)) {
    throw new BridgeError("UNAUTHORIZED", "A valid bridge pairing token is required.", 401);
  }
}
function sanitizeError(error) {
  if (error instanceof BridgeError) return error;
  if (error instanceof Error) {
    const nodeError = error;
    if (nodeError.name === "AbortError" || nodeError.code === "ABORT_ERR") {
      return new BridgeError("ABORTED", "The operation was cancelled.", 499);
    }
    if (nodeError.code === "ECONNREFUSED") {
      return new BridgeError("CONNECTION_REFUSED", "Draw Things refused the local connection.", 502);
    }
    if (nodeError.code === "ETIMEDOUT" || nodeError.code === "ERR_HTTP2_PING_CANCEL") {
      return new BridgeError("UPSTREAM_TIMEOUT", "Draw Things did not respond before the timeout.", 504);
    }
    if (nodeError.code?.startsWith("CERT_") || nodeError.code === "DEPTH_ZERO_SELF_SIGNED_CERT") {
      return new BridgeError("TLS_VERIFICATION_FAILED", error.message, 502);
    }
    return new BridgeError(nodeError.code ?? "UPSTREAM_ERROR", error.message, 502);
  }
  return new BridgeError("UNKNOWN_ERROR", "An unknown connector error occurred.", 500);
}

// bridge/http-upstream.ts
var ALLOWED_PATHS = /* @__PURE__ */ new Set([
  "/",
  "/sdapi/v1/options",
  "/sdapi/v1/txt2img",
  "/sdapi/v1/img2img"
]);
async function collectResponse(response, limit) {
  const chunks = [];
  let received = 0;
  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > limit) {
      response.destroy(new BridgeError("UPSTREAM_RESPONSE_TOO_LARGE", `Draw Things response exceeds ${limit} bytes.`, 502));
      throw new BridgeError("UPSTREAM_RESPONSE_TOO_LARGE", `Draw Things response exceeds ${limit} bytes.`, 502);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
function requestDrawThingsJson(connection, method, path, body, signal) {
  if (connection.protocol !== "http") {
    throw new BridgeError("HTTP_MODE_REQUIRED", "This operation requires the Draw Things HTTP API mode.");
  }
  if (!ALLOWED_PATHS.has(path)) {
    throw new BridgeError("PATH_NOT_ALLOWED", "The requested Draw Things path is not allowed.", 403);
  }
  const serialized = body === void 0 ? void 0 : Buffer.from(JSON.stringify(body), "utf8");
  const headers = {
    accept: "application/json",
    "user-agent": "draw-things-web-bridge/0.1.0"
  };
  if (serialized) {
    headers["content-type"] = "application/json";
    headers["content-length"] = serialized.length;
  }
  return new Promise((resolve3, reject) => {
    let settled = false;
    let certificate;
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };
    const requestFactory = connection.tls ? requestHttps : requestHttp;
    const request = requestFactory({
      hostname: connection.host,
      port: connection.port,
      method,
      path,
      signal,
      rejectUnauthorized: connection.tls ? connection.verifyTls : void 0,
      headers
    }, async (response) => {
      try {
        const raw = await collectResponse(response, MAX_UPSTREAM_RESPONSE_BYTES);
        let value;
        try {
          value = raw.length === 0 ? null : JSON.parse(raw.toString("utf8"));
        } catch {
          throw new BridgeError(
            "INVALID_UPSTREAM_JSON",
            "Draw Things returned a response that was not valid JSON.",
            502,
            { status: response.statusCode, preview: raw.subarray(0, 512).toString("utf8") }
          );
        }
        const status = response.statusCode ?? 502;
        if (status < 200 || status >= 300) {
          const detail = isPlainObject(value) && typeof value.detail === "string" ? value.detail : `Draw Things HTTP API returned status ${status}.`;
          throw new BridgeError("DRAW_THINGS_HTTP_ERROR", detail, 502, {
            upstreamStatus: status,
            response: value
          });
        }
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve3({
          status,
          headers: response.headers,
          value,
          certificate,
          warnings: tlsWarnings(connection, certificate)
        });
      } catch (error) {
        finishReject(error);
      }
    });
    request.once("error", finishReject);
    const timeout = setTimeout(() => {
      const error = new BridgeError("UPSTREAM_TIMEOUT", "Draw Things did not respond before the timeout.", 504);
      request.destroy(error);
      finishReject(error);
    }, connection.timeoutMs);
    timeout.unref();
    const send = () => {
      if (settled || request.destroyed) return;
      if (serialized) request.end(serialized);
      else request.end();
    };
    if (connection.tls) {
      request.once("socket", (socket) => {
        const tlsSocket = socket;
        tlsSocket.once("secureConnect", () => {
          try {
            certificate = certificateInfo(tlsSocket);
            verifyPinnedCertificate(connection, certificate);
            send();
          } catch (error) {
            request.destroy(error);
            finishReject(error);
          }
        });
      });
    } else {
      send();
    }
  });
}
async function getHttpOptions(connection) {
  const result = await requestDrawThingsJson(connection, "GET", "/sdapi/v1/options");
  if (!isPlainObject(result.value)) {
    throw new BridgeError("INVALID_OPTIONS_RESPONSE", "Draw Things options response must be a JSON object.", 502);
  }
  return { ...result, options: result.value };
}
async function generateHttpImages(connection, mode, parameters, signal) {
  const path = mode === "txt2img" ? "/sdapi/v1/txt2img" : "/sdapi/v1/img2img";
  const result = await requestDrawThingsJson(connection, "POST", path, parameters, signal);
  if (!isPlainObject(result.value) || !Array.isArray(result.value.images) || result.value.images.some((image) => typeof image !== "string")) {
    throw new BridgeError(
      "INVALID_GENERATION_RESPONSE",
      "Draw Things generation response did not contain a base64 images array.",
      502
    );
  }
  return { ...result, images: result.value.images };
}

// bridge/model-catalog.ts
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
var MAX_METADATA_BYTES = 8 * 1024 * 1024;
var DRAW_THINGS_CONTAINER = /draw[. _-]?things/i;
async function defaultDrawThingsModelDirectories() {
  const containers = join(homedir(), "Library", "Containers");
  const candidates = /* @__PURE__ */ new Set([
    join(containers, "com.liuliu.draw-things", "Data", "Documents", "Models")
  ]);
  try {
    const entries = await readdir(containers, { withFileTypes: true });
    for (const entry2 of entries) {
      if (!entry2.isDirectory() || !DRAW_THINGS_CONTAINER.test(entry2.name)) continue;
      candidates.add(join(containers, entry2.name, "Data", "Documents", "Models"));
    }
  } catch {
  }
  return [...candidates];
}
async function existingDirectories(paths) {
  const directories = [];
  for (const path of paths) {
    const normalized = resolve(path);
    try {
      if ((await stat(normalized)).isDirectory()) directories.push(normalized);
    } catch {
    }
  }
  return [...new Set(directories)];
}
async function readMetadataArray(path) {
  try {
    const metadata = await stat(path);
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_METADATA_BYTES) return [];
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value) => isPlainObject(value));
  } catch {
    return [];
  }
}
async function installedCheckpointFiles(directories) {
  const files = /* @__PURE__ */ new Set();
  for (const directory of directories) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry2 of entries) {
      if (!entry2.isFile() && !entry2.isSymbolicLink() || !entry2.name.toLowerCase().endsWith(".ckpt")) continue;
      try {
        if ((await stat(join(directory, entry2.name))).size > 0) files.add(entry2.name);
      } catch {
      }
    }
  }
  return files;
}
function modelRecord(value) {
  const file = typeof value.file === "string" ? value.file.trim() : "";
  if (!file || basename(file) !== file || !file.toLowerCase().endsWith(".ckpt")) return void 0;
  return {
    file,
    ...typeof value.name === "string" && value.name.trim() ? { name: value.name.trim() } : {},
    ...typeof value.version === "string" && value.version.trim() ? { version: value.version.trim() } : {},
    ...typeof value.modifier === "string" && value.modifier.trim() ? { modifier: value.modifier.trim() } : {},
    source: "local-metadata"
  };
}
async function listLocalDrawThingsModels(configuredDirectories) {
  const requested = configuredDirectories?.length ? configuredDirectories : await defaultDrawThingsModelDirectories();
  const directories = await existingDirectories(requested);
  if (directories.length === 0) {
    return {
      models: [],
      directoriesScanned: 0,
      warnings: ["Draw Things \uAE30\uBCF8 \uBAA8\uB378 \uD3F4\uB354\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC678\uBD80 \uD3F4\uB354\uB294 \uCEE4\uB125\uD130\uC758 --models-dir \uC635\uC158\uC73C\uB85C \uCD94\uAC00\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."]
    };
  }
  const specifications = /* @__PURE__ */ new Map();
  for (const directory of directories) {
    const dataDirectory = dirname(dirname(directory));
    const catalogPaths = [
      join(dataDirectory, "Library", "Caches", "net", "models.json"),
      join(dataDirectory, "Library", "Caches", "net", "uncurated_models.json")
    ];
    for (const path of catalogPaths) {
      for (const value of await readMetadataArray(path)) {
        const model = modelRecord(value);
        if (model && !specifications.has(model.file)) specifications.set(model.file, model);
      }
    }
  }
  for (const directory of directories) {
    for (const value of await readMetadataArray(join(directory, "custom.json"))) {
      const model = modelRecord(value);
      if (model) specifications.set(model.file, model);
    }
  }
  const installed = await installedCheckpointFiles(directories);
  const models = [...specifications.values()].filter((model) => installed.has(model.file)).sort((left, right) => (left.name ?? left.file).localeCompare(right.name ?? right.file, "ko"));
  const warnings = models.length === 0 ? ["\uC124\uCE58\uB41C \uC8FC \uBAA8\uB378 \uBA54\uD0C0\uB370\uC774\uD130\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uBCF4\uC870 VAE\xB7CLIP\xB7T5 \uD30C\uC77C\uC740 \uBAA9\uB85D\uC5D0\uC11C \uC81C\uC678\uB429\uB2C8\uB2E4."] : [];
  return { models, directoriesScanned: directories.length, warnings };
}

// bridge/server.ts
var BRIDGE_VERSION = "0.1.0";
var BRIDGE_NAME = "draw-things-web-bridge";
var ROUTES = /* @__PURE__ */ new Map([
  ["/v1/bridge/health", ["GET"]],
  ["/v1/discover", ["POST"]],
  ["/v1/test", ["POST"]],
  ["/v1/options", ["POST"]],
  ["/v1/models", ["POST"]],
  ["/v1/generate", ["POST"]]
]);
var CANCEL_PATH = /^\/v1\/cancel\/([A-Za-z0-9_-]{1,80})$/;
function requestPath(request) {
  const raw = request.url;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    throw new BridgeError("INVALID_REQUEST_TARGET", "Only origin-form request targets are accepted.", 400);
  }
  const parsed = new URL(raw, "http://bridge.invalid");
  if (parsed.search || parsed.hash) {
    throw new BridgeError("QUERY_NOT_ALLOWED", "Query strings and fragments are not accepted.", 400);
  }
  return parsed.pathname;
}
function setCommonHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}
function writeJson(response, status, value) {
  if (response.writableEnded) return;
  const body = Buffer.from(JSON.stringify(value), "utf8");
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", body.length);
  response.end(body);
}
function errorPayload(error) {
  const safe = sanitizeError(error);
  return {
    status: safe.status,
    body: {
      ok: false,
      message: safe.message,
      error: {
        code: safe.code,
        message: safe.message,
        ...safe.details === void 0 ? {} : { details: safe.details }
      }
    }
  };
}
function candidateConnection(protocol, input, tls) {
  return normalizeConnection({
    protocol,
    host: input.host,
    port: input.port,
    tls,
    verifyTls: false,
    tlsFingerprintSha256: input.tlsFingerprintSha256,
    sharedSecret: input.sharedSecret,
    clientName: input.clientName,
    timeoutMs: input.timeoutMs ?? 2500
  });
}
function probeFailure(connection, startedAt, error) {
  const safe = sanitizeError(error);
  return {
    ok: false,
    protocol: connection.protocol,
    latencyMs: Date.now() - startedAt,
    connection: publicConnection(connection),
    error: {
      code: safe.code,
      message: safe.message,
      status: safe.status,
      ...safe.details === void 0 ? {} : { details: safe.details }
    },
    warnings: []
  };
}
function endpointFor(connection) {
  const host = connection.host === "::1" ? "[::1]" : connection.host;
  return `${connection.tls ? "https" : "http"}://${host}:${connection.port}`;
}
function metadataArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => isPlainObject(item));
}
function frontendCapabilities(probe) {
  if (!probe.ok) {
    return {
      protocol: probe.protocol,
      canGenerate: false,
      canImageToImage: false,
      canStreamProgress: false,
      canCancel: false,
      canBrowseModels: false,
      requiresHttpModeForCanvas: probe.protocol === "grpc",
      sharedSecretRequired: false,
      models: [],
      loras: [],
      controls: [],
      textualInversions: [],
      limitations: [probe.error.message]
    };
  }
  if (probe.protocol === "http") {
    return {
      protocol: "http",
      canGenerate: true,
      canImageToImage: true,
      canStreamProgress: false,
      canCancel: false,
      canBrowseModels: false,
      requiresHttpModeForCanvas: false,
      sharedSecretRequired: false,
      models: [],
      loras: [],
      controls: [],
      textualInversions: [],
      limitations: [
        "Draw Things HTTP API\uB294 \uC0DD\uC131 \uC911\uAC04 \uBBF8\uB9AC\uBCF4\uAE30\uC640 \uB2E8\uACC4\uBCC4 \uC9C4\uD589\uB960\uC744 \uC81C\uACF5\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
        "HTTP \uC5F0\uACB0\uC744 \uCDE8\uC18C\uD574\uB3C4 Draw Things \uB0B4\uBD80 \uC0DD\uC131 \uC791\uC5C5\uC740 \uACC4\uC18D\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
      ]
    };
  }
  const metadata = probe.echo?.metadata;
  let models = metadataArray(metadata?.models);
  if (models.length === 0) models = (probe.echo?.files ?? []).map((file) => ({ file }));
  return {
    protocol: "grpc",
    canGenerate: false,
    canImageToImage: false,
    canStreamProgress: false,
    canCancel: false,
    canBrowseModels: probe.capabilities.modelBrowsing,
    requiresHttpModeForCanvas: true,
    sharedSecretRequired: probe.echo?.sharedSecretMissing ?? false,
    models,
    loras: metadataArray(metadata?.loras),
    controls: metadataArray(metadata?.controlNets),
    textualInversions: metadataArray(metadata?.textualInversions),
    serverIdentifier: probe.echo?.serverIdentifier,
    limitations: [probe.capabilities.reason ?? "\uC774\uBBF8\uC9C0 \uCE94\uBC84\uC2A4 \uC0DD\uC131\uC5D0\uB294 Draw Things HTTP API \uBAA8\uB4DC\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4."]
  };
}
function connectionTestResult(probe) {
  const checkedAt = Date.now();
  const endpoint = endpointFor(probe.connection);
  if (!probe.ok) {
    const offlineCodes = /* @__PURE__ */ new Set(["CONNECTION_REFUSED", "ECONNREFUSED", "ECONNRESET", "UPSTREAM_TIMEOUT"]);
    const tlsCodes = /* @__PURE__ */ new Set(["TLS_VERIFICATION_FAILED", "TLS_FINGERPRINT_MISMATCH", "DEPTH_ZERO_SELF_SIGNED_CERT"]);
    return {
      ok: false,
      latencyMs: probe.latencyMs,
      checkedAt,
      phase: offlineCodes.has(probe.error.code) ? "offline" : tlsCodes.has(probe.error.code) ? "cors-or-tls-blocked" : "api-mismatch",
      message: probe.error.message,
      endpoint,
      capabilities: frontendCapabilities(probe),
      diagnosticCode: probe.error.code
    };
  }
  const grpc = probe.protocol === "grpc";
  return {
    ok: true,
    latencyMs: probe.latencyMs,
    checkedAt,
    phase: "online",
    message: grpc ? "Draw Things gRPC\uC5D0 \uC5F0\uACB0\uD588\uC2B5\uB2C8\uB2E4. \uCE94\uBC84\uC2A4 \uC0DD\uC131\uC5D0\uB294 API \uC11C\uBC84\uB97C HTTP \uBAA8\uB4DC\uB85C \uC804\uD658\uD558\uC138\uC694." : "Draw Things HTTP API\uC5D0 \uC5F0\uACB0\uD588\uC2B5\uB2C8\uB2E4.",
    endpoint,
    ...probe.echo?.message ? { serverMessage: probe.echo.message } : {},
    capabilities: frontendCapabilities(probe),
    ...probe.options ? { remoteOptions: probe.options } : {},
    warnings: probe.warnings,
    certificate: probe.certificate
  };
}
async function probeConnection(connection) {
  const startedAt = Date.now();
  try {
    if (connection.protocol === "http") {
      const result2 = await getHttpOptions(connection);
      const success2 = {
        ok: true,
        protocol: "http",
        latencyMs: Date.now() - startedAt,
        connection: publicConnection(connection),
        capabilities: {
          options: true,
          modelBrowsing: false,
          generation: true,
          generationTransport: "http",
          txt2img: true,
          img2img: true
        },
        options: result2.options,
        certificate: result2.certificate,
        warnings: result2.warnings
      };
      return success2;
    }
    const result = await echoGrpc(connection);
    const warnings = [...result.warnings];
    if (result.echo.sharedSecretMissing) {
      warnings.push("Draw Things requires a matching sharedSecret before model metadata can be browsed.");
    }
    const reason = "Native gRPC generation uses Draw Things FlatBuffer configuration and proprietary tensor payloads. Switch Draw Things API Server to HTTP mode for txt2img/img2img generation from this web connector.";
    const success = {
      ok: true,
      protocol: "grpc",
      latencyMs: Date.now() - startedAt,
      connection: publicConnection(connection),
      capabilities: {
        options: true,
        modelBrowsing: !result.echo.sharedSecretMissing,
        generation: false,
        generationTransport: null,
        txt2img: false,
        img2img: false,
        reason
      },
      echo: result.echo,
      certificate: result.certificate,
      warnings
    };
    return success;
  } catch (error) {
    return probeFailure(connection, startedAt, error);
  }
}
function validateDiscoverBody(value) {
  if (!isPlainObject(value)) {
    throw new BridgeError("INVALID_DISCOVER_REQUEST", "Discovery request must be a JSON object.");
  }
  normalizeLoopbackHost(value.host);
  if (value.sharedSecret !== void 0 && typeof value.sharedSecret !== "string") {
    throw new BridgeError("INVALID_SHARED_SECRET", "sharedSecret must be a string.");
  }
  if (value.ports !== void 0) {
    if (!Array.isArray(value.ports) || value.ports.length < 1 || value.ports.length > 4 || value.ports.some((port) => !Number.isInteger(port) || Number(port) < 1 || Number(port) > 65535)) {
      throw new BridgeError("INVALID_DISCOVERY_PORTS", "ports must contain 1-4 integers from 1 to 65535.");
    }
  }
  return value;
}
async function handleDiscover(request, response) {
  const body = validateDiscoverBody(await readJsonBody(request, MAX_CONTROL_BODY_BYTES));
  const requestedPorts = Array.isArray(body.ports) ? body.ports : [body.port === void 0 ? DEFAULT_DRAW_THINGS_PORT : Number(body.port)];
  const ports = [...new Set(requestedPorts)];
  const candidates = ports.flatMap((port) => {
    const input = { ...body, port };
    return [
      candidateConnection("http", input, false),
      candidateConnection("grpc", input, true),
      candidateConnection("grpc", input, false)
    ];
  });
  const results = await Promise.all(candidates.map(probeConnection));
  const endpoints = results.filter((result) => result.ok).map((result) => ({
    id: `loopback-${result.protocol}-${result.connection.tls ? "tls" : "plain"}-${result.connection.port}`,
    name: result.protocol === "http" ? `Draw Things HTTP :${result.connection.port}` : `Draw Things gRPC${result.connection.tls ? " TLS" : ""} :${result.connection.port}`,
    protocol: result.protocol,
    host: result.connection.host,
    port: result.connection.port,
    tls: result.connection.tls,
    source: "loopback",
    latencyMs: result.latencyMs,
    message: result.echo?.message ?? (result.protocol === "http" ? "Draw Things HTTP API" : void 0)
  }));
  writeJson(response, 200, {
    ok: results.some((result) => result.ok),
    host: normalizeLoopbackHost(body.host),
    ports,
    endpoints,
    results
  });
}
function getConnectionBody(value, purpose = "control") {
  if (!isPlainObject(value)) throw new BridgeError("INVALID_REQUEST", "Request body must be a JSON object.");
  return {
    body: value,
    connection: normalizeConnection(value.connection, purpose)
  };
}
async function handleTest(request, response) {
  const { connection } = getConnectionBody(await readJsonBody(request, MAX_CONTROL_BODY_BYTES));
  writeJson(response, 200, connectionTestResult(await probeConnection(connection)));
}
async function handleOptions(request, response) {
  const { connection } = getConnectionBody(await readJsonBody(request, MAX_CONTROL_BODY_BYTES));
  writeJson(response, 200, await probeConnection(connection));
}
function modelMetadata(value) {
  if (!isPlainObject(value) || typeof value.file !== "string" || !value.file.trim()) return void 0;
  return {
    file: value.file.trim(),
    ...typeof value.name === "string" && value.name.trim() ? { name: value.name.trim() } : {},
    ...typeof value.version === "string" && value.version.trim() ? { version: value.version.trim() } : {},
    ...typeof value.modifier === "string" && value.modifier.trim() ? { modifier: value.modifier.trim() } : {},
    ...typeof value.source === "string" ? { source: value.source } : {}
  };
}
async function handleModels(request, response, modelDirectories) {
  const { connection } = getConnectionBody(await readJsonBody(request, MAX_CONTROL_BODY_BYTES));
  const local = await listLocalDrawThingsModels(modelDirectories);
  const models = /* @__PURE__ */ new Map();
  const sources = /* @__PURE__ */ new Set();
  for (const value of local.models) {
    const model = modelMetadata(value);
    if (!model) continue;
    models.set(String(model.file), model);
    sources.add("local-metadata");
  }
  const warnings = [...local.warnings];
  if (connection.protocol === "grpc") {
    const probe = await probeConnection(connection);
    if (probe.ok) {
      const echoModels = metadataArray(probe.echo?.metadata.models);
      for (const value of echoModels) {
        const model = modelMetadata({ ...value, source: "grpc-echo" });
        if (model) models.set(String(model.file), model);
      }
      if (echoModels.length > 0) sources.add("grpc-echo");
      warnings.push(...probe.warnings);
    } else {
      warnings.push(`gRPC Echo \uBAA8\uB378 \uBAA9\uB85D\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${probe.error.message}`);
    }
  } else {
    try {
      const result = await getHttpOptions(connection);
      const current = result.options.model;
      if (typeof current === "string" && current.trim() && !models.has(current.trim())) {
        models.set(current.trim(), { file: current.trim(), name: current.trim(), source: "http-current" });
        sources.add("http-current");
      }
      warnings.push(...result.warnings);
    } catch (error) {
      const safe = sanitizeError(error);
      warnings.push(`\uD604\uC7AC HTTP \uBAA8\uB378\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${safe.message}`);
    }
  }
  const source = sources.size > 1 ? "combined" : sources.values().next().value ?? "none";
  writeJson(response, 200, {
    ok: true,
    models: [...models.values()].sort((left, right) => String(left.name ?? left.file).localeCompare(String(right.name ?? right.file), "ko")),
    source,
    checkedAt: Date.now(),
    stale: false,
    directoriesScanned: local.directoriesScanned,
    warnings: [...new Set(warnings)]
  });
}
function generationId(value) {
  if (value === void 0) return randomUUID();
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) {
    throw new BridgeError("INVALID_GENERATION_ID", "id must contain 1-80 letters, numbers, underscores, or hyphens.");
  }
  return value;
}
var HTTP_UNWRITABLE_PARAMETERS = /* @__PURE__ */ new Set([
  "compression_artifacts",
  "compression_artifacts_quality",
  "color_calibration",
  "expand_prompt_to_json"
]);
function safeHttpParameters(parameters) {
  return Object.fromEntries(Object.entries(parameters).filter(([key, value]) => {
    if (HTTP_UNWRITABLE_PARAMETERS.has(key)) return false;
    if (key === "tea_cache_end" && Number(value) < 0) return false;
    return true;
  }));
}
function stripDataUrl(value) {
  const comma = value.indexOf(",");
  return value.startsWith("data:") && comma >= 0 ? value.slice(comma + 1) : value;
}
function generationInput(body) {
  if (isPlainObject(body.request)) {
    const request = body.request;
    if (request.mode !== "txt2img" && request.mode !== "img2img") {
      throw new BridgeError("INVALID_GENERATION_MODE", 'request.mode must be "txt2img" or "img2img".');
    }
    if (!isPlainObject(request.parameters)) {
      throw new BridgeError("INVALID_PARAMETERS", "request.parameters must be a JSON object.");
    }
    if (typeof request.prompt !== "string" || typeof request.negativePrompt !== "string") {
      throw new BridgeError("INVALID_PROMPT", "request.prompt and request.negativePrompt must be strings.");
    }
    const parameters = {
      ...safeHttpParameters(request.parameters),
      prompt: request.prompt,
      negative_prompt: request.negativePrompt
    };
    if (request.mode === "img2img" && request.initImage !== void 0) {
      if (typeof request.initImage !== "string") {
        throw new BridgeError("INVALID_INIT_IMAGE", "request.initImage must be a data URL or base64 string.");
      }
      parameters.init_images = [stripDataUrl(request.initImage)];
    }
    return {
      id: generationId(request.id),
      mode: request.mode,
      parameters
    };
  }
  if (body.mode !== "txt2img" && body.mode !== "img2img") {
    throw new BridgeError("INVALID_GENERATION_MODE", 'mode must be "txt2img" or "img2img".');
  }
  if (!isPlainObject(body.parameters)) {
    throw new BridgeError("INVALID_PARAMETERS", "parameters must be a JSON object.");
  }
  return {
    id: generationId(body.id),
    mode: body.mode,
    parameters: body.parameters
  };
}
async function writeNdjson(response, value) {
  if (response.writableEnded || response.destroyed) return;
  const line = `${JSON.stringify(value)}
`;
  if (response.write(line)) return;
  await new Promise((resolve3, reject) => {
    const cleanup = () => {
      response.off("drain", onDrain);
      response.off("error", onError);
      response.off("close", onClose);
    };
    const onDrain = () => {
      cleanup();
      resolve3();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new BridgeError("CLIENT_DISCONNECTED", "The browser closed the generation stream.", 499));
    };
    response.once("drain", onDrain);
    response.once("error", onError);
    response.once("close", onClose);
  });
}
async function handleGenerate(request, response, active) {
  const { body, connection } = getConnectionBody(
    await readJsonBody(request, MAX_GENERATE_BODY_BYTES),
    "generation"
  );
  if (connection.protocol !== "http") {
    throw new BridgeError(
      "HTTP_MODE_REQUIRED",
      "Native gRPC image generation is not exposed because Draw Things uses a proprietary tensor/FlatBuffer payload. Switch the Draw Things API Server protocol to HTTP.",
      409,
      { generationTransport: "http" }
    );
  }
  const { id, mode, parameters } = generationInput(body);
  if (active.has(id)) throw new BridgeError("GENERATION_ID_IN_USE", "A generation with this id is already active.", 409);
  const state = { controller: new AbortController(), cancelled: false };
  active.set(id, state);
  let completed = false;
  const startedAt = Date.now();
  let heartbeat;
  request.once("aborted", () => state.controller.abort());
  response.once("close", () => {
    if (!completed && !response.writableEnded) state.controller.abort();
  });
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Transfer-Encoding", "chunked");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();
  try {
    await writeNdjson(response, {
      type: "accepted",
      requestId: id,
      message: "Draw Things\uAC00 \uC0DD\uC131 \uC694\uCCAD\uC744 \uBC1B\uC558\uC2B5\uB2C8\uB2E4."
    });
    heartbeat = setInterval(() => {
      void writeNdjson(response, {
        type: "progress",
        requestId: id,
        progress: 4,
        message: "Draw Things\uC5D0\uC11C \uC774\uBBF8\uC9C0\uB97C \uC0DD\uC131\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4\u2026"
      }).catch(() => state.controller.abort());
    }, 15e3);
    heartbeat.unref();
    const result = await generateHttpImages(connection, mode, parameters, state.controller.signal);
    await writeNdjson(response, {
      type: "result",
      requestId: id,
      images: result.images,
      durationMs: Date.now() - startedAt
    });
    completed = true;
    response.end();
  } catch (error) {
    const safe = sanitizeError(error);
    if (!response.destroyed) {
      await writeNdjson(response, state.cancelled || safe.code === "ABORTED" ? { type: "cancelled", requestId: id, message: "\uC774\uBBF8\uC9C0 \uC0DD\uC131\uC744 \uCDE8\uC18C\uD588\uC2B5\uB2C8\uB2E4." } : {
        type: "error",
        requestId: id,
        message: safe.message,
        code: safe.code
      });
      completed = true;
      response.end();
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    active.delete(id);
  }
}
function handleCancel(response, active, id) {
  const generation = active.get(id);
  if (!generation) {
    writeJson(response, 200, { ok: true, id, cancelled: false, reason: "not_active" });
    return;
  }
  generation.cancelled = true;
  generation.controller.abort();
  writeJson(response, 200, { ok: true, id, cancelled: true });
}
function expectedMethods(path) {
  return ROUTES.get(path) ?? (CANCEL_PATH.test(path) ? ["POST"] : void 0);
}
function createBridgeServer(options = {}) {
  const requestedPort = options.port ?? DEFAULT_BRIDGE_PORT;
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
    throw new BridgeError("INVALID_BRIDGE_PORT", "Bridge port must be an integer from 0 to 65535.");
  }
  const bind = normalizeBridgeBindAddress(options.bind);
  if (!isLoopbackBindAddress(bind) && (typeof options.token !== "string" || options.token.length < 32)) {
    throw new BridgeError("REMOTE_BIND_TOKEN_REQUIRED", "A token of at least 32 characters is required for a Tailscale bind.");
  }
  if (!isLoopbackBindAddress(bind) && !options.origins?.length) {
    throw new BridgeError("REMOTE_BIND_ORIGIN_REQUIRED", "At least one explicit --origin is required for a Tailscale bind.");
  }
  const origins = options.origins?.length ? options.origins : DEFAULT_DEV_ORIGINS;
  const allowedOrigins = new Set(origins.map(normalizeOrigin));
  const active = /* @__PURE__ */ new Map();
  const server = createServer((request, response) => {
    void (async () => {
      setCommonHeaders(response);
      const address = server.address();
      const expectedPort = address && typeof address !== "string" ? address.port : requestedPort;
      validateHostHeader(request, expectedPort, bind);
      const allowedOrigin = validateOrigin(request, response, allowedOrigins);
      const path = requestPath(request);
      const methods = expectedMethods(path);
      if (!methods) throw new BridgeError("NOT_FOUND", "Bridge endpoint not found.", 404);
      if (request.method === "OPTIONS") {
        handlePreflight(request, response, methods);
        return;
      }
      validateToken(request, options.token);
      if (!request.method || !methods.includes(request.method)) {
        response.setHeader("Allow", methods.join(", "));
        throw new BridgeError("METHOD_NOT_ALLOWED", "HTTP method is not allowed for this endpoint.", 405);
      }
      if (path === "/v1/bridge/health") {
        writeJson(response, 200, {
          ok: true,
          name: BRIDGE_NAME,
          version: BRIDGE_VERSION,
          bind,
          port: expectedPort,
          paired: true,
          allowedOrigin,
          tokenRequired: Boolean(options.token),
          allowedOrigins: [...allowedOrigins],
          activeGenerations: active.size,
          now: (/* @__PURE__ */ new Date()).toISOString()
        });
      } else if (path === "/v1/discover") {
        await handleDiscover(request, response);
      } else if (path === "/v1/test") {
        await handleTest(request, response);
      } else if (path === "/v1/options") {
        await handleOptions(request, response);
      } else if (path === "/v1/models") {
        await handleModels(request, response, options.modelDirectories);
      } else if (path === "/v1/generate") {
        await handleGenerate(request, response, active);
      } else {
        const match = CANCEL_PATH.exec(path);
        if (!match?.[1]) throw new BridgeError("NOT_FOUND", "Bridge endpoint not found.", 404);
        handleCancel(response, active, match[1]);
      }
    })().catch((error) => {
      if (response.headersSent) {
        if (!response.writableEnded) response.destroy(error instanceof Error ? error : void 0);
        return;
      }
      const payload = errorPayload(error);
      writeJson(response, payload.status, payload.body);
    });
  });
  server.requestTimeout = 12e4;
  server.headersTimeout = 1e4;
  server.keepAliveTimeout = 5e3;
  server.maxHeadersCount = 64;
  server.maxConnections = 32;
  server.maxRequestsPerSocket = 1e3;
  return server;
}
function nextArgument(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new BridgeError("MISSING_ARGUMENT", `${flag} requires a value.`);
  return value;
}
function parseCliArguments(args) {
  let port = DEFAULT_BRIDGE_PORT;
  let bind = "127.0.0.1";
  const origins = [];
  let token;
  const modelDirectories = [];
  let help = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const separator = argument.indexOf("=");
    const flag = separator >= 0 ? argument.slice(0, separator) : argument;
    const inlineValue = separator >= 0 ? argument.slice(separator + 1) : void 0;
    if (flag === "--help" || flag === "-h") {
      help = true;
    } else if (flag === "--port") {
      const value = inlineValue ?? nextArgument(args, index, flag);
      if (inlineValue === void 0) index += 1;
      port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new BridgeError("INVALID_BRIDGE_PORT", "--port must be an integer from 1 to 65535.");
      }
    } else if (flag === "--bind") {
      const value = inlineValue ?? nextArgument(args, index, flag);
      if (inlineValue === void 0) index += 1;
      bind = normalizeBridgeBindAddress(value);
    } else if (flag === "--origin") {
      const value = inlineValue ?? nextArgument(args, index, flag);
      if (inlineValue === void 0) index += 1;
      origins.push(normalizeOrigin(value));
    } else if (flag === "--token" || flag === "--pairing-code") {
      const value = inlineValue ?? nextArgument(args, index, flag);
      if (inlineValue === void 0) index += 1;
      if (value.length < 6 || value.length > 4096) {
        throw new BridgeError("INVALID_TOKEN", `${flag} must contain 6-4096 characters.`);
      }
      if (token !== void 0 && token !== value) {
        throw new BridgeError("CONFLICTING_TOKEN", "--token and --pairing-code must match when both are supplied.");
      }
      token = value;
    } else if (flag === "--models-dir") {
      const value = inlineValue ?? nextArgument(args, index, flag);
      if (inlineValue === void 0) index += 1;
      if (!value.trim()) throw new BridgeError("INVALID_MODELS_DIRECTORY", "--models-dir must not be empty.");
      modelDirectories.push(resolve2(value));
    } else {
      throw new BridgeError("UNKNOWN_ARGUMENT", `Unknown argument: ${argument}`);
    }
  }
  if (!isLoopbackBindAddress(bind) && (!token || token.length < 32)) {
    throw new BridgeError("REMOTE_BIND_TOKEN_REQUIRED", "A token of at least 32 characters is required with a Tailscale --bind.");
  }
  if (!isLoopbackBindAddress(bind) && origins.length === 0) {
    throw new BridgeError("REMOTE_BIND_ORIGIN_REQUIRED", "An explicit --origin is required with a Tailscale --bind.");
  }
  return {
    port,
    bind,
    origins: origins.length ? [...new Set(origins)] : [...DEFAULT_DEV_ORIGINS],
    token,
    modelDirectories: [...new Set(modelDirectories)],
    help
  };
}
function usage() {
  return `Draw Things Web local connector ${BRIDGE_VERSION}

Usage:
  draw-things-bridge.mjs [--port 47821] [--bind 127.0.0.1] [--origin https://app.example]... [--token SECRET] [--models-dir PATH]...

Options:
  --port <number>          Connector port (default: 47821)
  --bind <address>         127.0.0.1, ::1, or this Mac's Tailscale IP
  --origin <origin>        Exact allowed website Origin; repeat for multiple sites
  --token <secret>         Optional bearer / X-Draw-Things-Bridge-Token value
  --pairing-code <secret>  Alias for --token
  --models-dir <path>      Additional Draw Things model folder; repeat as needed
  --help                   Show this help

The connector only binds loopback or an explicit Tailscale address and only contacts Draw Things on loopback.
Tailscale binds require an explicit origin and a token of at least 32 characters.
Without --origin, localhost Vite development origins on ports 5173 and 4173 are allowed.`;
}
async function startBridge(args = process.argv.slice(2)) {
  const cli = parseCliArguments(args);
  if (cli.help) {
    process.stdout.write(`${usage()}
`);
    return void 0;
  }
  const defaults = await defaultDrawThingsModelDirectories();
  const server = createBridgeServer({
    ...cli,
    modelDirectories: [.../* @__PURE__ */ new Set([...defaults, ...cli.modelDirectories])]
  });
  await new Promise((resolve3, reject) => {
    server.once("error", reject);
    server.listen(cli.port, cli.bind, () => {
      server.off("error", reject);
      resolve3();
    });
  });
  const displayHost = cli.bind.includes(":") ? `[${cli.bind}]` : cli.bind;
  process.stdout.write(`Draw Things Web bridge listening on http://${displayHost}:${cli.port}
`);
  process.stdout.write(`Allowed origins: ${cli.origins.join(", ")}
`);
  process.stdout.write(`Pairing token: ${cli.token ? "required" : "disabled"}
`);
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5e3).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}
var entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : void 0;
if (entry === import.meta.url) {
  startBridge().catch((error) => {
    const safe = sanitizeError(error);
    process.stderr.write(`${safe.code}: ${safe.message}
`);
    process.exitCode = 1;
  });
}
export {
  createBridgeServer,
  parseCliArguments,
  probeConnection,
  startBridge
};
