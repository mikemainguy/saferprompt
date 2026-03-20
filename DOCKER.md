# Docker Guide for SaferPrompt

## Quickstart

Pull and run the pre-built image in one step — no build required:

```bash
docker run -p 3000:3000 michaelmainguy/saferprompt
```

Then open http://localhost:3000 in your browser or test with curl:

```bash
curl -X POST http://localhost:3000/api/detect \
  -H "Content-Type: application/json" \
  -d '{"text": "hello"}'
```

The image includes the ML model, so it starts immediately with no download delay.

# Customization (custom docker containers)

##
SaferPrompt's Docker build downloads and processes a ~713MB ML model, which requires at least **8GB of memory** available to the Docker build process.


### Docker Desktop

Go to **Settings > Resources > Advanced** and set Memory to at least 8GB, then click **Apply & Restart**.

## Building the Image

```bash
docker build -t saferprompt .
```

The build uses a two-stage Dockerfile:

1. **Build stage** — installs npm dependencies and downloads the ML model
2. **Production stage** — copies only the runtime artifacts into a slim image

The model is baked into the image, so the container starts immediately with no download delay.

## Running the Container

```bash
docker run -p 3000:3000 saferprompt
```

### Environment Variables

The container has two environment variables baked in via the Dockerfile:

| Variable | Default | Description |
|---|---|---|
| `LOCAL_MODELS_ONLY` | `true` | When `true`, the app uses only the model baked into the image and makes no network requests to HuggingFace. Set to `false` if you want the app to fetch model updates at startup. |
| `PORT` | `3000` | The port the Fastify server listens on inside the container. |
| `HOST` | `0.0.0.0` | The network interface to bind to. Use `127.0.0.1` for localhost only, or a specific IP. |

There is also an optional variable not set by default:

| Variable | Default | Description |
|---|---|---|
| `API_KEY` | *(empty)* | When set, all requests to `/api/detect` must include a matching `x-api-key` header. When empty, the API is open (no auth). |
| `HTTP2` | *(unset)* | Set to `true` or `1` to enable HTTP/2. |
| `TLS_CERT_FILE` | *(unset)* | Path to PEM-encoded certificate file inside the container. |
| `TLS_KEY_FILE` | *(unset)* | Path to PEM-encoded private key file inside the container. |
| `TLS_CERT` | *(unset)* | Inline PEM certificate content (fallback if `TLS_CERT_FILE` not set). |
| `TLS_KEY` | *(unset)* | Inline PEM private key content (fallback if `TLS_KEY_FILE` not set). |
| `DISABLE_UI` | *(unset)* | Set to `true` or `1` to disable the HTML test UI on `GET /`. |

### Overriding environment variables at runtime

Use `-e` flags to override any variable when running the container:

```bash
# Run on port 8080 with API key authentication enabled
docker run -p 8080:8080 \
  -e PORT=8080 \
  -e API_KEY=my-secret-key \
  saferprompt
```

#### HTTPS with volume-mounted certificates

```bash
docker run -p 3000:3000 \
  -v /path/to/certs:/certs:ro \
  -e TLS_CERT_FILE=/certs/cert.pem \
  -e TLS_KEY_FILE=/certs/key.pem \
  -e HTTP2=true \
  saferprompt
```

Note: when you change `PORT`, update the `-p` mapping to match. The left side is the host port (your choice), the right side must match the container's `PORT`.

```bash
# Map host port 9090 to container port 8080
docker run -p 9090:8080 -e PORT=8080 saferprompt
```

### Using a `.env` file

You can pass a file of environment variables instead of individual `-e` flags:

```bash
# Create an env file
echo "API_KEY=my-secret-key" > .env.docker

# Pass it to docker run
docker run -p 3000:3000 --env-file .env.docker saferprompt
```

## Verifying the Container

```bash
# Health check (no API key)
curl -X POST http://localhost:3000/api/detect \
  -H "Content-Type: application/json" \
  -d '{"text": "hello"}'

# With API key
curl -X POST http://localhost:3000/api/detect \
  -H "Content-Type: application/json" \
  -H "x-api-key: my-secret-key" \
  -d '{"text": "hello"}'
```

Expected response:

```json
{
  "label": "SAFE",
  "score": 0.9998,
  "isInjection": false,
  "ms": 42
}
```

You can also open http://localhost:3000 in a browser to use the test UI.

### Colima (macOS)

If you use Colima as your Docker runtime, the VM memory defaults to 2GB — not enough for the model download step. Increase it before building:

```bash
colima stop
colima start --memory 8
```

To make this persistent, edit the Colima config:

```bash
colima template
```

Change the `memory` field to `8` (or higher), then save and restart.
