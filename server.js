import "dotenv/config";
import { readFileSync } from "node:fs";
import { detectInjection } from "./index.js";
import { createApp } from "./createApp.js";
import { getActiveDestinations } from "./logger.js";

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const API_KEY = process.env.API_KEY || "";
const HTTP2 = process.env.HTTP2 === "true" || process.env.HTTP2 === "1";
const RESPONSE_MODE = (process.env.RESPONSE_MODE || "body").toLowerCase(); // "body", "headers", or "both"
const HEADERS_SUCCESS_CODE = parseInt(process.env.HEADERS_SUCCESS_CODE, 10) === 204 ? 204 : 200;
const DISABLE_UI = process.env.DISABLE_UI === "true" || process.env.DISABLE_UI === "1";
const HEALTH_CHECKS = process.env.HEALTH_CHECKS || "model,uptime,memory,requests,eventloop";
const HEALTH_CACHE_TTL_MS = parseInt(process.env.HEALTH_CACHE_TTL_MS, 10) || 5000;
const HEALTH_HEAP_WARN_PERCENT = parseInt(process.env.HEALTH_HEAP_WARN_PERCENT, 10) || 85;
const HEALTH_EVENTLOOP_WARN_MS = parseInt(process.env.HEALTH_EVENTLOOP_WARN_MS, 10) || 100;
const HEALTH_METRICS_WINDOW_MS = parseInt(process.env.HEALTH_METRICS_WINDOW_MS, 10) || 300000;

// Resolve TLS cert and key: file paths take precedence over inline values
let tlsCert;
let tlsKey;
if (process.env.TLS_CERT_FILE) {
  tlsCert = readFileSync(process.env.TLS_CERT_FILE);
}
if (process.env.TLS_KEY_FILE) {
  tlsKey = readFileSync(process.env.TLS_KEY_FILE);
}
if (!tlsCert && process.env.TLS_CERT) {
  tlsCert = process.env.TLS_CERT;
}
if (!tlsKey && process.env.TLS_KEY) {
  tlsKey = process.env.TLS_KEY;
}

// Validate: both cert and key must be present, or both absent
if ((tlsCert && !tlsKey) || (!tlsCert && tlsKey)) {
  console.error("Error: Both TLS certificate and key must be provided. Set both TLS_CERT_FILE/TLS_KEY_FILE (or TLS_CERT/TLS_KEY), not just one.");
  process.exit(1);
}

const hasTls = !!(tlsCert && tlsKey);
const fastifyOpts = {};
if (HTTP2) {
  fastifyOpts.http2 = true;
}
if (hasTls) {
  fastifyOpts.https = { cert: tlsCert, key: tlsKey };
}

const fastify = createApp({
  apiKey: API_KEY,
  responseMode: RESPONSE_MODE,
  headersSuccessCode: HEADERS_SUCCESS_CODE,
  disableUi: DISABLE_UI,
  fastifyOpts,
  healthChecks: {
    checks: HEALTH_CHECKS,
    cacheTtlMs: HEALTH_CACHE_TTL_MS,
    heapWarnPercent: HEALTH_HEAP_WARN_PERCENT,
    eventLoopWarnMs: HEALTH_EVENTLOOP_WARN_MS,
    metricsWindowMs: HEALTH_METRICS_WINDOW_MS,
  },
});

// Pre-load the model, then start listening
console.log("Loading model (first run downloads ~395M params)...");
await detectInjection("warmup");
fastify.listen({ port: PORT, host: HOST }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  const protocol = hasTls ? "https" : "http";
  console.log(`SaferPrompt running at ${protocol}://localhost:${PORT}`);
  const logDests = getActiveDestinations();
  if (logDests.length) {
    console.log("Logging active:");
    logDests.forEach((d) => console.log(`  ${d}`));
  }
});
