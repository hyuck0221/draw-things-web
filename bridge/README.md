# Draw Things Web local connector

The connector is a Node.js 22 process that binds to `127.0.0.1` by default. It can opt into one explicit Tailscale address while keeping the Draw Things upstream restricted to loopback. It gives an explicitly allowed web origin access to known Draw Things API methods without acting as a general local proxy.

Build and run:

```sh
pnpm bridge:build
node public/bridge/draw-things-bridge.mjs \
  --origin https://your-site.vercel.app \
  --token choose-a-long-local-secret \
  --models-dir '/optional/external/Draw Things/Models'
```

For local Vite development, omitting `--origin` allows the exact localhost/127.0.0.1/`[::1]` origins on ports 5173 and 4173. Production sites must be passed with repeated `--origin` arguments. Send the optional token as `Authorization: Bearer …`, `X-Draw-Things-Pairing-Token`, or `X-Draw-Things-Bridge-Token`.

For a mobile client inside the same tailnet, bind only the Mac's actual Tailscale address. Wildcard, LAN, public, and Quad100 addresses are rejected. A Tailscale bind requires at least one explicit origin and a token of 32 or more characters.

```sh
node public/bridge/draw-things-bridge.mjs \
  --bind 100.x.y.z \
  --origin http://100.x.y.z:5173 \
  --token a-strong-random-token-of-at-least-32-characters
```

## Endpoint contract

- `GET /v1/bridge/health`: connector health, origin policy, and active generation count.
- `POST /v1/discover`: probes HTTP, TLS gRPC, and plain h2c gRPC on up to four loopback ports. Body accepts `host`, `port` or `ports`, `sharedSecret`, `timeoutMs`, and an optional pinned `tlsFingerprintSha256`; the response includes UI-ready `endpoints` plus detailed `results`.
- `POST /v1/test`: tests `{ "connection": Connection }` and returns the UI `ConnectionTestResult`, including normalized capabilities and HTTP remote options or decoded gRPC model catalogs.
- `POST /v1/options`: returns the same normalized probe result. HTTP contains the complete `/sdapi/v1/options` object; gRPC contains decoded Echo files and model/LoRA/ControlNet/textual-inversion/upscaler metadata.
- `POST /v1/models`: returns installed primary models from Draw Things metadata plus the current HTTP model or gRPC Echo catalog. It never returns absolute model paths. The request is `{ "connection": Connection }`.
- `POST /v1/generate`: accepts `{ "connection": Connection, "request": GenerationRequest }` (or the low-level `id`/`mode`/`parameters` form). The response is `application/x-ndjson` with `accepted`, optional `progress`, then `result`, `cancelled`, or `error`.
- `POST /v1/cancel/:id`: aborts an active HTTP generation.

`Connection` is `{ protocol, host, port, tls, verifyTls, tlsFingerprintSha256?, sharedSecret?, timeoutMs? }`. Hosts are restricted to `localhost`, `127.0.0.1`, or `::1`. TLS discovery can read Draw Things' self-signed certificate and returns its SHA-256 fingerprint with a warning; save that fingerprint and send it on subsequent requests to pin the local server.

Native gRPC Echo uses HTTP/2 TLS or h2c, supports gzip response framing and `sharedSecret`, and decodes model-browsing metadata. Native gRPC image generation is intentionally not advertised: Draw Things uses a FlatBuffer configuration plus proprietary tensor payloads for that method. Switch Draw Things API Server to HTTP mode for web txt2img/img2img generation.

The connector reads Draw Things' sandbox metadata and verifies that each primary checkpoint actually exists. Dependencies such as VAE, CLIP, and T5 checkpoints are excluded from the model picker. Repeat `--models-dir PATH` for opt-in external model folders; those local paths remain inside the connector process.
