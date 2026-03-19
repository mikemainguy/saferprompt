# Protocol Configuration

SaferPrompt supports HTTP/1.1, HTTPS, and HTTP/2 via environment variables. No code changes or extra dependencies are needed — just set the relevant variables before starting the server.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DISABLE_UI` | *(unset)* | Set to `true` or `1` to disable the HTML test UI on `GET /` |
| `HOST` | `0.0.0.0` | Network interface to bind to (`0.0.0.0` for all, `127.0.0.1` for localhost only, or a specific IP) |
| `HTTP2` | *(unset)* | Set to `true` or `1` to enable HTTP/2 |
| `TLS_CERT_FILE` | *(unset)* | Path to a PEM-encoded certificate file |
| `TLS_KEY_FILE` | *(unset)* | Path to a PEM-encoded private key file |
| `TLS_CERT` | *(unset)* | Inline PEM certificate content (used when `TLS_CERT_FILE` is not set) |
| `TLS_KEY` | *(unset)* | Inline PEM private key content (used when `TLS_KEY_FILE` is not set) |

### Priority

- File path variables (`TLS_CERT_FILE` / `TLS_KEY_FILE`) take precedence over inline variables (`TLS_CERT` / `TLS_KEY`). If both are set, the file paths win.
- Both a certificate **and** a key must be provided. Setting only one causes the server to exit with an error.

## Configuration Modes

### 1. HTTP/1.1 cleartext (default)

Plain HTTP with no encryption. This is the default when no TLS or HTTP2 variables are set.

```bash
npm start
```

- Protocol: HTTP/1.1
- URL: `http://localhost:3000`
- Use case: Local development, running behind a reverse proxy that handles TLS

### 2. HTTPS (HTTP/1.1 over TLS)

Encrypted HTTP/1.1. Set when TLS certificates are provided but `HTTP2` is not enabled.

```bash
TLS_CERT_FILE=./cert.pem TLS_KEY_FILE=./key.pem npm start
```

- Protocol: HTTP/1.1 over TLS
- URL: `https://localhost:3000`
- Use case: Direct HTTPS without HTTP/2, broad client compatibility

### 3. HTTP/2 cleartext (h2c)

Unencrypted HTTP/2. Set when `HTTP2` is enabled but no TLS certificates are provided.

```bash
HTTP2=true npm start
```

- Protocol: HTTP/2 cleartext (h2c)
- URL: `http://localhost:3000`
- Use case: Programmatic clients (e.g., gRPC, `curl --http2-prior-knowledge`) behind a TLS-terminating proxy
- **Note:** Browsers do not support h2c. Use HTTP/2 over TLS for browser traffic.

### 4. HTTP/2 over TLS

Encrypted HTTP/2. The standard browser-compatible mode. Set when both `HTTP2` and TLS certificates are provided.

```bash
HTTP2=true TLS_CERT_FILE=./cert.pem TLS_KEY_FILE=./key.pem npm start
```

- Protocol: HTTP/2 over TLS (h2)
- URL: `https://localhost:3000`
- Use case: Production-facing servers, browser-compatible HTTP/2

## Summary Matrix

| `HTTP2` | TLS cert + key | Result |
|---|---|---|
| unset | no | HTTP/1.1 cleartext |
| unset | yes | HTTPS (HTTP/1.1 over TLS) |
| `true` | no | HTTP/2 cleartext (h2c) |
| `true` | yes | HTTP/2 over TLS |

## Providing TLS Certificates

### Via file paths

```bash
TLS_CERT_FILE=./cert.pem TLS_KEY_FILE=./key.pem npm start
```

### Via inline PEM content

```bash
TLS_CERT="$(cat cert.pem)" TLS_KEY="$(cat key.pem)" npm start
```

### Via `.env` file

```
TLS_CERT_FILE=./cert.pem
TLS_KEY_FILE=./key.pem
```

### Generating a self-signed certificate for development

```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365 -subj "/CN=localhost"
```

## Docker

Mount certificates as a read-only volume and pass the paths as environment variables:

```bash
docker run -p 3000:3000 \
  -v /path/to/certs:/certs:ro \
  -e TLS_CERT_FILE=/certs/cert.pem \
  -e TLS_KEY_FILE=/certs/key.pem \
  -e HTTP2=true \
  saferprompt
```

## Verifying Your Configuration

### HTTPS

```bash
curl --insecure https://localhost:3000/api/detect \
  -H "Content-Type: application/json" \
  -d '{"text": "hello"}'
```

### HTTP/2 over TLS

```bash
curl --insecure --http2 -v https://localhost:3000/api/detect \
  -H "Content-Type: application/json" \
  -d '{"text": "hello"}'
```

Look for `using HTTP/2` in the verbose output.

### HTTP/2 cleartext (h2c)

```bash
curl --http2-prior-knowledge http://localhost:3000/api/detect \
  -H "Content-Type: application/json" \
  -d '{"text": "hello"}'
```
