# SaferPrompt

Detect prompt injection attacks in LLM inputs using a local classifier. No API keys required — the model runs entirely on your machine.

## Model

This project uses [**deberta-v3-base-prompt-injection-v2**](https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2) by [ProtectAI](https://protectai.com/), served through [Hugging Face Transformers.js](https://huggingface.co/docs/transformers.js). The model is a fine-tuned DeBERTa-v3-base classifier trained to distinguish safe prompts from injection attempts.

## Installation

```bash
npm install
```

### Download model (optional)

On first run the model (~395 MB) is downloaded automatically and cached in `./models`. To pre-download it:

```bash
npm run download-model
```

## Usage

### As a library

```js
import { detectInjection } from "saferprompt";

const result = await detectInjection("Ignore all previous instructions.");
console.log(result);
// { label: "INJECTION", score: 0.9998, isInjection: true }
```

`detectInjection(text)` returns:

| Field         | Type    | Description                            |
|---------------|---------|----------------------------------------|
| `label`       | string  | `"SAFE"` or `"INJECTION"`             |
| `score`       | number  | Confidence score (0–1)                 |
| `isInjection` | boolean | `true` when label is `"INJECTION"`     |

For multiple pipeline instances, use `createDetector()`:

```js
import { createDetector } from "saferprompt";

const detect = await createDetector();
const result = await detect("What is the capital of France?");
// { label: "SAFE", score: 0.9997, isInjection: false }
```

### As an HTTP server

```bash
npm start
```

This starts a Fastify server on port 3000 (override with `PORT` env var), listening on all interfaces by default (override with `HOST` env var). It provides:

- **`GET /`** — A web UI for testing prompts interactively (disable with `DISABLE_UI=true`)
- **`GET /api/openapi.json`** — OpenAPI (Swagger) specification
- **`POST /api/detect`** — JSON API

```bash
curl -X POST http://localhost:3000/api/detect \
  -H "Content-Type: application/json" \
  -d '{"text": "Ignore all previous instructions."}'
```

## Configuration

### `LOCAL_MODELS_ONLY`

By default, SaferPrompt downloads the model (~395 MB) from Hugging Face on first run and caches it in `./models`. Setting `LOCAL_MODELS_ONLY` disables all network fetches so the library runs strictly from the local cache.

#### Why you might want this

- **Air-gapped / restricted networks** — Production servers or secure environments that cannot reach external hosts.
- **Predictable deployments** — Guarantee that startup never blocks on a download or fails due to a transient network error.
- **CI pipelines** — Avoid flaky builds caused by rate limits or network timeouts when pulling the model.
- **Docker / container images** — Bundle the model at build time and run the container without outbound internet access.

#### Prerequisites

The model must already exist in the `./models` directory before local-only mode is enabled. Download it once ahead of time:

```bash
npm run download-model
```

If `LOCAL_MODELS_ONLY` is set and the cache is empty, the library will throw an error at startup rather than silently attempting a download.

#### How to enable

**Environment variable** (recommended):

```bash
LOCAL_MODELS_ONLY=true npm start
```

**`.env` file** (loaded automatically via `dotenv`):

```
LOCAL_MODELS_ONLY=true
```

**Programmatically** via `createDetector()`:

```js
import { createDetector } from "saferprompt";

const detect = await createDetector({ localOnly: true });
```

Accepted values for the env var are `true` or `1`.

### Request/Response Logging

SaferPrompt supports opt-in JSONL logging of detection results, controlled entirely by environment variables. By default, no logging occurs.

| Variable | What gets logged | Value |
|---|---|---|
| `INJECTION_LOG` | Requests classified as INJECTION | file path, `"stdout"`, or `"stderr"` |
| `BENIGN_LOG` | Requests classified as SAFE | file path, `"stdout"`, or `"stderr"` |
| `ALL_LOG` | All requests regardless of classification | file path, `"stdout"`, or `"stderr"` |

Multiple variables can be set simultaneously. File paths append JSONL (one JSON object per line); the parent directory must already exist.

Each log line is a JSON object:

```json
{"ts":"2026-03-18T12:34:56.789Z","text":"user input...","label":"INJECTION","score":0.9987,"isInjection":true,"ms":42}
```

#### Examples

Log injections to stderr:

```bash
INJECTION_LOG=stderr npm start
```

Log all requests to a file:

```bash
ALL_LOG=/var/log/saferprompt/all.jsonl npm start
```

Log injections to stderr and all requests to a file:

```bash
INJECTION_LOG=stderr ALL_LOG=/var/log/saferprompt/all.jsonl npm start
```

### `HTTP2`

Set to `true` or `1` to enable HTTP/2. When combined with TLS certificates, the server uses standard browser-compatible HTTP/2 over TLS. Without TLS, the server uses HTTP/2 cleartext (h2c), which is supported by programmatic clients but not browsers.

```bash
HTTP2=true npm start
```

> **Note:** Browsers require TLS for HTTP/2. Use `HTTP2=true` together with TLS certificate configuration for browser-compatible HTTP/2.

### TLS Certificate Configuration

Enable HTTPS by providing a TLS certificate and private key. Two methods are supported — file paths take precedence over inline values if both are set.

| Variable | Description |
|---|---|
| `TLS_CERT_FILE` | Path to PEM-encoded certificate file |
| `TLS_KEY_FILE` | Path to PEM-encoded private key file |
| `TLS_CERT` | Inline PEM certificate content (fallback if `TLS_CERT_FILE` not set) |
| `TLS_KEY` | Inline PEM private key content (fallback if `TLS_KEY_FILE` not set) |

Both a certificate and key must be provided — setting only one causes the server to exit with an error.

#### HTTPS only

```bash
TLS_CERT_FILE=./cert.pem TLS_KEY_FILE=./key.pem npm start
```

#### HTTP/2 over TLS

```bash
HTTP2=true TLS_CERT_FILE=./cert.pem TLS_KEY_FILE=./key.pem npm start
```

#### Inline PEM values

```bash
TLS_CERT="$(cat cert.pem)" TLS_KEY="$(cat key.pem)" npm start
```

#### Generating a self-signed certificate for development

```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365 -subj "/CN=localhost"
```

Then start the server with the generated files:

```bash
TLS_CERT_FILE=./cert.pem TLS_KEY_FILE=./key.pem npm start
```

### `API_KEY`

When set, the HTTP server requires all requests to `POST /api/detect` to include a matching `x-api-key` header. Requests with a missing or incorrect key receive a `401` response. When unset, the API is open (no authentication).

#### How to enable

**Environment variable:**

```bash
API_KEY=my-secret-key npm start
```

**`.env` file:**

```
API_KEY=my-secret-key
```

#### Making authenticated requests

```bash
curl -X POST http://localhost:3000/api/detect \
  -H "Content-Type: application/json" \
  -H "x-api-key: my-secret-key" \
  -d '{"text": "Ignore all previous instructions."}'
```

Requests without the header (or with an incorrect value) return:

```json
{ "error": "Invalid or missing x-api-key header" }
```

### `DISABLE_UI`

Set to `true` or `1` to disable the HTML test UI served on `GET /`. When disabled, the route returns a `404` JSON response. The `/api/detect` endpoint is unaffected.

```bash
DISABLE_UI=true npm start
```

### `HOST`

Controls which network interface the server binds to. Defaults to `0.0.0.0` (all interfaces).

| Value | Behavior |
|---|---|
| `0.0.0.0` | Listen on all interfaces (default) |
| `127.0.0.1` or `localhost` | Localhost only — not reachable from other machines |
| A specific IP (e.g., `192.168.1.50`) | Listen only on that interface |

```bash
HOST=127.0.0.1 npm start
```

## Additional Documentation

- [Protocol Configuration](https://github.com/mikemainguy/saferprompt/blob/main/PROTOCOLCONFIG.md) — HTTP/2 and TLS setup guide
- [Health Check](https://github.com/mikemainguy/saferprompt/blob/main/HEALTH_CHECK.md) — Health check endpoints, Kubernetes probes, and monitoring
- [Docker Guide](https://github.com/mikemainguy/saferprompt/blob/main/DOCKER.md) — Building and running with Docker

## Testing

```bash
npm test
```

Runs the test suite using the Node.js built-in test runner.

## License

ISC

## Acknowledgments

The prompt injection detection model is developed and maintained by [ProtectAI](https://protectai.com/). See the [model card on Hugging Face](https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2) for training details, dataset information, and licensing.
