import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Fastify from "fastify";
import swagger from "@fastify/swagger";
import { marked } from "marked";
import { detectInjection } from "./index.js";
import { logResult } from "./logger.js";
import pkg from "./package.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));

function renderDocs() {
  const docs = [
    { id: "readme", label: "README", file: "README.md" },
    { id: "protocol", label: "Protocol Config", file: "PROTOCOLCONFIG.md" },
    { id: "docker", label: "Docker", file: "DOCKER.md" },
  ];
  return docs.map((d) => {
    const md = readFileSync(join(__dirname, d.file), "utf8");
    const html = marked(md);
    return { ...d, html };
  });
}

/**
 * Creates and returns a configured Fastify instance.
 *
 * @param {object} [config]
 * @param {string} [config.apiKey]        — require this key in x-api-key header
 * @param {string} [config.responseMode]  — "body" | "headers" | "both"
 * @param {number} [config.headersSuccessCode] — 200 or 204 (only relevant for "headers" mode)
 * @param {boolean} [config.disableUi]    — disable the HTML test UI on GET /
 * @param {object} [config.fastifyOpts]   — extra Fastify constructor options (http2, https, etc.)
 */
export function createApp({
  apiKey = "",
  responseMode = "body",
  headersSuccessCode = 200,
  disableUi = false,
  fastifyOpts = {},
} = {}) {
  const fastify = Fastify({
    ...fastifyOpts,
    ajv: { customOptions: { coerceTypes: false } },
  });

  fastify.register(swagger, {
    openapi: {
      info: {
        title: "SaferPrompt",
        description:
          "Detect prompt injection attacks using the protectai/deberta-v3-base-prompt-injection-v2 model",
        version: pkg.version,
      },
    },
  });

  // API key hook — only applied when apiKey is set
  fastify.addHook("onRequest", async (request, reply) => {
    if (!apiKey) return;
    if (request.url === "/") return;
    const provided = request.headers["x-api-key"];
    if (provided !== apiKey) {
      reply
        .code(401)
        .header("www-authenticate", 'Bearer realm="saferprompt"')
        .send({ error: "Invalid or missing x-api-key header" });
    }
  });

  // Serve the test UI (unless disabled)
  if (disableUi) {
    fastify.get("/", async (_request, reply) => {
      reply.code(404).send({ error: "UI is disabled" });
    });
  } else {
  const docs = renderDocs();
  const docTabs = docs.map((d) => `<button class="tab" data-tab="${d.id}">${d.label}</button>`).join("\n      ");
  const docPanels = docs.map((d) => `<div class="tab-panel doc-content" id="tab-${d.id}">${d.html}</div>`).join("\n    ");

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
    .container { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; }
    .tab-bar { display: flex; gap: 0; margin-bottom: 1.5rem; border-bottom: 2px solid #334155; }
    .tab { padding: 0.5rem 1rem; border: none; background: none; color: #94a3b8; font-size: 0.95rem; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
    .tab:hover { color: #e2e8f0; }
    .tab.active { color: #60a5fa; border-bottom-color: #60a5fa; }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    textarea { width: 100%; height: 120px; padding: 0.75rem; border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; font-size: 1rem; resize: vertical; }
    textarea:focus { outline: none; border-color: #60a5fa; }
    button.analyze { margin-top: 0.75rem; padding: 0.6rem 1.5rem; border: none; border-radius: 8px; background: #3b82f6; color: #fff; font-size: 1rem; cursor: pointer; }
    button.analyze:hover { background: #2563eb; }
    button.analyze:disabled { opacity: 0.5; cursor: not-allowed; }
    #result { margin-top: 1.5rem; padding: 1rem; border-radius: 8px; background: #1e293b; display: none; }
    .label { font-size: 1.25rem; font-weight: 700; }
    .safe { color: #4ade80; }
    .injection { color: #f87171; }
    .meta { margin-top: 0.5rem; color: #94a3b8; font-size: 0.875rem; }
    .doc-content { line-height: 1.7; }
    .doc-content h1, .doc-content h2, .doc-content h3 { color: #f1f5f9; margin: 1.5rem 0 0.75rem; }
    .doc-content h1 { font-size: 1.5rem; }
    .doc-content h2 { font-size: 1.25rem; }
    .doc-content h3 { font-size: 1.1rem; }
    .doc-content p { margin: 0.5rem 0; }
    .doc-content code { background: #1e293b; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.9em; }
    .doc-content pre { background: #1e293b; padding: 1rem; border-radius: 8px; overflow-x: auto; margin: 0.75rem 0; }
    .doc-content pre code { padding: 0; background: none; }
    .doc-content a { color: #60a5fa; }
    .doc-content ul, .doc-content ol { margin: 0.5rem 0 0.5rem 1.5rem; }
    .doc-content table { border-collapse: collapse; margin: 0.75rem 0; }
    .doc-content th, .doc-content td { border: 1px solid #334155; padding: 0.4rem 0.75rem; }
    .doc-content th { background: #1e293b; }
    .doc-content blockquote { border-left: 3px solid #60a5fa; padding-left: 1rem; color: #94a3b8; margin: 0.75rem 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>SaferPrompt</h1>
    <div class="tab-bar">
      <button class="tab active" data-tab="analyzer">Analyzer</button>
      ${docTabs}
    </div>
    <div class="tab-panel active" id="tab-analyzer">
      <textarea id="prompt" placeholder="Enter a prompt to test..."></textarea>
      <button class="analyze" id="btn" onclick="analyze()">Analyze</button>
      <div id="result"></div>
    </div>
    ${docPanels}
  </div>
  <script>
    document.querySelectorAll(".tab").forEach(function(tab) {
      tab.addEventListener("click", function() {
        document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });
        document.querySelectorAll(".tab-panel").forEach(function(p) { p.classList.remove("active"); });
        tab.classList.add("active");
        document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
      });
    });
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
  }

  // OpenAPI spec endpoint
  fastify.get("/api/openapi.json", async (_request, reply) => {
    return fastify.swagger();
  });

  // API endpoint
  fastify.post("/api/detect", {
    schema: {
      description: "Classify a text prompt as SAFE or INJECTION",
      body: {
        type: "object",
        required: ["text"],
        properties: {
          text: { type: "string", description: "The prompt text to analyze" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            label: { type: "string", enum: ["SAFE", "INJECTION"] },
            score: { type: "number" },
            isInjection: { type: "boolean" },
            ms: { type: "number" },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { text } = request.body || {};
    if (!text || typeof text !== "string") {
      reply.code(400);
      return { error: '"text" field is required' };
    }
    const start = Date.now();
    const result = await detectInjection(text);
    const ms = Date.now() - start;
    logResult({ text, ...result, ms });
    if (responseMode === "body") {
      return { ...result, ms };
    }
    reply.header("x-saferprompt-label", result.label);
    reply.header("x-saferprompt-score", String(result.score));
    reply.header("x-saferprompt-is-injection", String(result.isInjection));
    reply.header("x-saferprompt-ms", String(ms));
    if (responseMode === "headers") {
      reply.code(headersSuccessCode);
      return;
    }
    return { ...result, ms };
  });

  return fastify;
}
