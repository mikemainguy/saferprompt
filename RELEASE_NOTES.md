# Release Notes

## 0.0.8

### New Features

- **Response compression** — Enable gzip, Brotli, and/or deflate compression on responses via the `COMPRESSION` env var (e.g., `COMPRESSION=gzip,br`). Powered by `@fastify/compress`.
- **Request body decompression** — Clients can send compressed JSON payloads with a `Content-Encoding` header (`gzip`, `br`, `deflate`). Always enabled, zero overhead for uncompressed requests. Uses Node.js built-in `zlib`.
- **Health check endpoints** — RFC-compliant health checks at `/health`, `/health/live`, and `/health/ready` with configurable thresholds. See [Health Check documentation](HEALTH_CHECK.md).
- **OpenAPI specification** — `GET /api/openapi.json` returns a machine-readable OpenAPI spec for the API, powered by `@fastify/swagger`.
- **`llms.txt`** — `GET /llms.txt` serves a plain-text description of the service for LLM tool discovery.
- **Tabbed documentation UI** — The web UI (`GET /`) now renders README, Protocol Config, Health Check, and Docker docs in tabbed panels.
- **`DISABLE_UI` env var** — Set to `true` to disable the HTML test UI; `GET /` returns 404 instead.
- **`HOST` env var** — Control which network interface the server binds to (default `0.0.0.0`).
- **Multi-arch Docker builds** — `npm run docker:publish` now builds and pushes `linux/amd64` and `linux/arm64` images.

### Improvements

- **Test coverage** — 100% line coverage on `createApp.js` and `index.js`; 40 tests across server, health check, and logger suites.
- **UI extracted to template** — HTML UI moved to `ui.html` for easier maintenance.
- **TypeScript declarations** — Added `index.d.ts` with type exports for `detectInjection` and `createDetector`.

### Breaking Changes

None. All new features are opt-in or additive.
