import "dotenv/config";
import { readFileSync } from "node:fs";
import { detectInjection } from "./index.js";
import { createApp } from "./createApp.js";
import { getActiveDestinations } from "./logger.js";

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || "";
const HTTP2 = process.env.HTTP2 === "true" || process.env.HTTP2 === "1";
const RESPONSE_MODE = (process.env.RESPONSE_MODE || "body").toLowerCase(); // "body", "headers", or "both"
const HEADERS_SUCCESS_CODE = parseInt(process.env.HEADERS_SUCCESS_CODE, 10) === 204 ? 204 : 200;

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
  fastifyOpts,
});

// Pre-load the model, then start listening
console.log("Loading model (first run downloads ~395M params)...");
await detectInjection("warmup");
fastify.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  const protocol = hasTls ? "https" : "http";
  console.log(`SaferPrompt running at ${protocol}://localhost:${PORT}`);
  const logDests = getActiveDestinations();
  if (logDests.length) {
    console.log("Logging active:");
    logDests.forEach((d) => console.log(`  ${d}`));
  }
});
