import "dotenv/config";
import { readFileSync } from "node:fs";
import Fastify from "fastify";
import { detectInjection } from "./index.js";

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || "";
const HTTP2 = process.env.HTTP2 === "true" || process.env.HTTP2 === "1";

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

const fastify = Fastify(fastifyOpts);

// API key hook — only applied when API_KEY is set
fastify.addHook("onRequest", async (request, reply) => {
  if (!API_KEY) return;
  if (request.url === "/") return;
  const provided = request.headers["x-api-key"];
  if (provided !== API_KEY) {
    reply.code(401).send({ error: "Invalid or missing x-api-key header" });
  }
});

// Serve the test UI
fastify.get("/", async (_request, reply) => {
  reply.type("text/html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SaferPrompt</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
    .container { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 1.5rem; }
    textarea { width: 100%; height: 120px; padding: 0.75rem; border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; font-size: 1rem; resize: vertical; }
    textarea:focus { outline: none; border-color: #60a5fa; }
    button { margin-top: 0.75rem; padding: 0.6rem 1.5rem; border: none; border-radius: 8px; background: #3b82f6; color: #fff; font-size: 1rem; cursor: pointer; }
    button:hover { background: #2563eb; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    #result { margin-top: 1.5rem; padding: 1rem; border-radius: 8px; background: #1e293b; display: none; }
    .label { font-size: 1.25rem; font-weight: 700; }
    .safe { color: #4ade80; }
    .injection { color: #f87171; }
    .meta { margin-top: 0.5rem; color: #94a3b8; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>SaferPrompt &mdash; Prompt Injection Detector</h1>
    <textarea id="prompt" placeholder="Enter a prompt to test..."></textarea>
    <button id="btn" onclick="analyze()">Analyze</button>
    <div id="result"></div>
  </div>
  <script>
    async function analyze() {
      const text = document.getElementById("prompt").value.trim();
      if (!text) return;
      const btn = document.getElementById("btn");
      const res = document.getElementById("result");
      btn.disabled = true;
      btn.textContent = "Analyzing...";
      res.style.display = "none";
      try {
        const r = await fetch("/api/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = await r.json();
        const cls = data.isInjection ? "injection" : "safe";
        res.innerHTML =
          '<div class="label ' + cls + '">' + data.label + '</div>' +
          '<div class="meta">Score: ' + data.score.toFixed(4) + ' &middot; ' + data.ms + ' ms</div>';
        res.style.display = "block";
      } catch (e) {
        res.innerHTML = '<div class="label injection">Error: ' + e.message + '</div>';
        res.style.display = "block";
      }
      btn.disabled = false;
      btn.textContent = "Analyze";
    }
  </script>
</body>
</html>`);
});

// API endpoint
fastify.post("/api/detect", async (request, reply) => {
  const { text } = request.body || {};
  if (!text || typeof text !== "string") {
    return reply.code(400).send({ error: "\"text\" field is required" });
  }
  const start = Date.now();
  const result = await detectInjection(text);
  return { ...result, ms: Date.now() - start };
});

// Pre-load the model, then start listening
console.log("Loading model (first run downloads ~395M params)...");
await detectInjection("warmup");
fastify.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  const protocol = hasTls ? "https" : "http";
  console.log(`SaferPrompt running at ${protocol}://localhost:${PORT}`);
});
