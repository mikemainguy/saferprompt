# Health Check

SaferPrompt provides RFC-compliant health check endpoints based on [draft-inadarei-api-health-check-06](https://datatracker.ietf.org/doc/html/draft-inadarei-api-health-check-06). These endpoints enable load balancer integration, Kubernetes liveness/readiness probes, and operational visibility into the service.

All health endpoints are unauthenticated — they bypass `API_KEY` enforcement so infrastructure tooling can reach them without credentials.

## Endpoints

| Endpoint | Purpose | HTTP Status |
|----------|---------|-------------|
| `GET /health` | Full health response with all enabled checks | 200 (pass/warn), 503 (fail) |
| `GET /health/live` | Liveness probe — process is running | Always 200 |
| `GET /health/ready` | Readiness probe — ML model is loaded | 200 if ready, 503 if not |

All responses use `Content-Type: application/health+json`.

### `GET /health`

Returns a full RFC-compliant health response including all enabled check categories. The overall `status` is derived from individual checks:

- **`"pass"`** — model loaded, no thresholds breached
- **`"warn"`** — model loaded but heap usage or event loop delay exceeds configured thresholds
- **`"fail"`** — model not loaded

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "pass",
  "version": "0.0.8",
  "serviceId": "saferprompt",
  "description": "Prompt injection detection service",
  "checks": {
    "model:ready": [{
      "componentId": "deberta-v3-base-prompt-injection-v2",
      "componentType": "component",
      "observedValue": true,
      "status": "pass",
      "time": "2026-03-20T12:00:00.000Z",
      "affectedEndpoints": ["/api/detect"]
    }],
    "uptime:process": [{
      "componentType": "system",
      "observedValue": 3600,
      "observedUnit": "s",
      "status": "pass",
      "time": "2026-03-20T12:00:00.000Z"
    }],
    "memory:heap": [{
      "componentType": "system",
      "observedValue": 72,
      "observedUnit": "percent",
      "status": "pass",
      "time": "2026-03-20T12:00:00.000Z"
    }],
    "cpu:eventLoopDelay": [{
      "componentType": "system",
      "observedValue": 12.5,
      "observedUnit": "ms",
      "status": "pass",
      "time": "2026-03-20T12:00:00.000Z"
    }],
    "cpu:eventLoopUtilization": [{
      "componentType": "system",
      "observedValue": 0.35,
      "observedUnit": "ratio",
      "status": "pass",
      "time": "2026-03-20T12:00:00.000Z"
    }],
    "requests:total": [{
      "componentType": "component",
      "observedValue": 1542,
      "status": "pass",
      "time": "2026-03-20T12:00:00.000Z"
    }],
    "requests:errorRate": [{
      "componentType": "component",
      "observedValue": 0.02,
      "observedUnit": "ratio",
      "status": "pass",
      "time": "2026-03-20T12:00:00.000Z"
    }],
    "detect:avgResponseTime": [{
      "componentType": "component",
      "observedValue": 45.2,
      "observedUnit": "ms",
      "status": "pass",
      "time": "2026-03-20T12:00:00.000Z",
      "affectedEndpoints": ["/api/detect"]
    }]
  },
  "links": {
    "about": "https://github.com/mikemainguy/saferprompt"
  }
}
```

### `GET /health/live`

Minimal liveness probe. Returns 200 as long as the process is running. Use this for Kubernetes `livenessProbe` to detect hung processes.

```bash
curl http://localhost:3000/health/live
```

```json
{ "status": "pass" }
```

### `GET /health/ready`

Readiness probe. Returns 200 once the ML model has been loaded and the service can handle `/api/detect` requests. Returns 503 during startup while the model is still loading. Use this for Kubernetes `readinessProbe` to control traffic routing.

```bash
curl http://localhost:3000/health/ready
```

```json
{ "status": "pass" }
```

## Checks

Each check category can be individually enabled or disabled via the `HEALTH_CHECKS` environment variable.

### `model` — Model Readiness

Reports whether the ML model has been loaded and is ready to serve inference requests. This is the primary check — if the model is not ready, the overall status is `"fail"`.

- **Key:** `model:ready`
- **Observed value:** `true` or `false`
- **Affected endpoints:** `/api/detect`

### `uptime` — Process Uptime

Reports how long the Node.js process has been running, in seconds.

- **Key:** `uptime:process`
- **Observed value:** seconds (integer)

### `memory` — Heap Usage

Reports V8 heap usage as a percentage of total heap. When heap usage exceeds the warn threshold (default 85%), the check status becomes `"warn"` and elevates the overall status.

- **Key:** `memory:heap`
- **Observed value:** percent (integer, 0–100)
- **Threshold:** `HEALTH_HEAP_WARN_PERCENT` (default `85`)

### `eventloop` — Event Loop Health

Two checks monitor the Node.js event loop using `perf_hooks`:

**Event loop delay (p99)** — The 99th percentile event loop delay in milliseconds. High values indicate blocking operations. When the delay exceeds the warn threshold (default 100ms), the check status becomes `"warn"`.

- **Key:** `cpu:eventLoopDelay`
- **Observed value:** milliseconds
- **Threshold:** `HEALTH_EVENTLOOP_WARN_MS` (default `100`)

**Event loop utilization** — The ratio of time the event loop spent processing callbacks vs idle (0–1). Values near 1.0 mean the event loop is saturated.

- **Key:** `cpu:eventLoopUtilization`
- **Observed value:** ratio (0–1)

### `requests` — Traffic Metrics

Three checks report traffic statistics within the sliding window:

**Total requests** — Number of requests received within the metrics window.

- **Key:** `requests:total`
- **Observed value:** count (integer)

**Error rate** — Ratio of 5xx responses to total requests within the metrics window.

- **Key:** `requests:errorRate`
- **Observed value:** ratio (0–1)

**Average detect response time** — Mean response time for `/api/detect` requests within the metrics window.

- **Key:** `detect:avgResponseTime`
- **Observed value:** milliseconds
- **Affected endpoints:** `/api/detect`

## Sliding Window

Request-based metrics (request count, error rate, average detect response time) and event loop metrics use a **sliding window** rather than cumulative counters. Only data from within the window is included in calculations, so the health response reflects recent service behavior rather than lifetime averages.

The window size is controlled by `HEALTH_METRICS_WINDOW_MS` and defaults to 5 minutes (300000ms). For example, with a 5-minute window:

- `requests:total` reports requests received in the last 5 minutes
- `requests:errorRate` reports the 5xx ratio over the last 5 minutes
- `detect:avgResponseTime` reports the mean detect latency over the last 5 minutes
- Event loop delay and utilization are reset at each window boundary

This means the health response adapts quickly to changes in traffic patterns or service degradation, rather than being diluted by historical data.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HEALTH_CHECKS` | `model,uptime,memory,requests,eventloop` | Comma-separated list of enabled check categories |
| `HEALTH_CACHE_TTL_MS` | `5000` | How long (in ms) the `/health` response is cached before recomputing |
| `HEALTH_HEAP_WARN_PERCENT` | `85` | Heap usage percentage that triggers a `"warn"` status |
| `HEALTH_EVENTLOOP_WARN_MS` | `100` | Event loop p99 delay (in ms) that triggers a `"warn"` status |
| `HEALTH_METRICS_WINDOW_MS` | `300000` | Sliding window size (in ms) for request and event loop metrics. Default is 5 minutes |

### Examples

Use all defaults:

```bash
npm start
```

Disable request and event loop metrics, only report model/uptime/memory:

```bash
HEALTH_CHECKS=model,uptime,memory npm start
```

Use a 1-minute sliding window and lower the heap warning threshold:

```bash
HEALTH_METRICS_WINDOW_MS=60000 HEALTH_HEAP_WARN_PERCENT=75 npm start
```

Use a 15-minute sliding window:

```bash
HEALTH_METRICS_WINDOW_MS=900000 npm start
```

## Kubernetes Integration

### Liveness and readiness probes

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
```

The readiness probe will return 503 while the model is loading (~10–30 seconds depending on hardware), preventing the pod from receiving traffic before it can serve requests.

### Full health check for monitoring

Use `/health` with an external monitoring system to track memory pressure, event loop health, error rates, and detect latency over time.

## Docker

Health check endpoints work out of the box in Docker. You can add a `HEALTHCHECK` instruction to your Dockerfile or `docker-compose.yml`:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/health/ready || exit 1
```

```yaml
services:
  saferprompt:
    image: michaelmainguy/saferprompt
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health/ready"]
      interval: 30s
      timeout: 5s
      retries: 3
```
