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

When the website itself is served over HTTPS (for example, Vercel), keep the connector on loopback and put Tailscale Serve HTTPS in front of it. The `--tailscale-host` allowlist is accepted only from a loopback proxy, so a remote client cannot spoof this Host header against a directly exposed connector.

```sh
node public/bridge/draw-things-bridge.mjs \
  --tailscale-host your-mac.your-tailnet.ts.net:47822 \
  --origin https://your-site.vercel.app \
  --token a-strong-random-token-of-at-least-32-characters

/Applications/Tailscale.app/Contents/MacOS/Tailscale serve \
  --bg --yes --https=47822 http://127.0.0.1:47821
```

The website connector URL is then `https://your-mac.your-tailnet.ts.net:47822`. The Draw Things upstream host remains `127.0.0.1`.

## Endpoint contract

- `GET /v1/bridge/health`: connector health, origin policy, and active generation count.
- `POST /v1/discover`: probes HTTP, TLS gRPC, and plain h2c gRPC on up to four loopback ports. Body accepts `host`, `port` or `ports`, `sharedSecret`, `timeoutMs`, and an optional pinned `tlsFingerprintSha256`; the response includes UI-ready `endpoints` plus detailed `results`.
- `POST /v1/test`: tests `{ "connection": Connection }` and returns the UI `ConnectionTestResult`, including normalized capabilities and HTTP remote options or decoded gRPC model catalogs.
- `POST /v1/options`: returns the same normalized probe result. HTTP contains the complete `/sdapi/v1/options` object; gRPC contains decoded Echo files and model/LoRA/ControlNet/textual-inversion/upscaler metadata.
- `POST /v1/models`: returns installed primary models from Draw Things metadata plus the current HTTP model or gRPC Echo catalog. It never returns absolute model paths. The request is `{ "connection": Connection, "selectedLoRAs"?: string[] }`; selected LoRA filenames are used only to choose the same local recommended profile as the native app.
- `POST /v1/generate`: accepts `{ "connection": Connection, "request": GenerationRequest }` (or the low-level `id`/`mode`/`parameters` form). HTTP supports txt2img/img2img; gRPC supports txt2img. The response is `application/x-ndjson` with `accepted`, optional `progress`/`preview`, then `result`, `cancelled`, or `error`.
- `POST /v1/cancel/:id`: aborts an active connector request. gRPC propagates an HTTP/2 stream cancellation into Draw Things; HTTP can only disconnect its synchronous request.

`Connection` is `{ protocol, host, port, tls, verifyTls, tlsFingerprintSha256?, sharedSecret?, timeoutMs? }`. Hosts are restricted to `localhost`, `127.0.0.1`, or `::1`. TLS discovery can read Draw Things' self-signed certificate and returns its SHA-256 fingerprint with a warning; save that fingerprint and send it on subsequent requests to pin the local server.

Native gRPC uses HTTP/2 TLS or h2c, supports gzip response framing, certificate pinning and `sharedSecret`, and decodes model-browsing metadata. The connector implements the server-streaming `GenerateImage` RPC for txt2img with Draw Things' official 88-slot FlatBuffer schema. It reports signpost progress and preview events, joins 4 MiB chunks, decodes raw Float16 or FPZIP NNC tensors, preserves Draw Things ARGB alpha in browser PNGs, and ignores model-specific latent previews that are not RGB images. gRPC img2img and image-hint ControlNet/IP-Adapter remain unavailable until browser RGBA→NNC Float16 image/mask/hint/content conversion has been verified against the real app; use HTTP for those input-based modes.

The FPZIP WASM is pinned by SHA-256 and embedded in the downloadable `.mjs`, so the connector neither fetches a runtime `.wasm` file nor adds an npm dependency. License and artifact provenance are in [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

The official protobuf also defines `FilesExist` and bidirectional `UploadFile`, but neither is exposed as a bridge endpoint. `UploadFile` is a mutating raw-file synchronization primitive—not a model catalog, conversion, dependency, or installation API—and exposing user-controlled filenames and sizes would require path validation, quotas, hash verification, overwrite protection, local confirmation, and stronger authorization controls.

The connector reads Draw Things' sandbox metadata and verifies that each primary checkpoint actually exists. Dependencies such as VAE, CLIP, and T5 checkpoints are excluded from the model picker. When the local `configs.json` cache is available, safe allowlisted recommended settings are matched in native order (exact, normalized prefix, parent prefix, then model version), with the selected LoRA set preferred. Repeat `--models-dir PATH` for opt-in external model folders; those local paths remain inside the connector process.
