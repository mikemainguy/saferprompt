import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createGunzip, createBrotliDecompress, createInflate } from "node:zlib";
import Fastify from "fastify";
import compress from "@fastify/compress";
import swagger from "@fastify/swagger";
import { marked } from "marked";
import { detectInjection } from "./index.js";
import { logResult } from "./logger.js";
import { createMetricsCollector } from "./healthCheck.js";
import pkg from "./package.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));

function renderDocs() {
  const docs = [
    { id: "readme", label: "README", file: "README.md" },
    { id: "release-notes", label: "Release Notes", file: "RELEASE_NOTES.md" },
    { id: "protocol", label: "Protocol Config", file: "PROTOCOLCONFIG.md" },
    { id: "health", label: "Health Check", file: "HEALTH_CHECK.md" },
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
 * @param {object} [config.healthChecks]  — health check configuration
 * @param {string} [config.compression]  — comma-separated encodings to enable (e.g. "gzip,br,deflate"); falsy to disable
 */
export function createApp({
  apiKey = "",
  responseMode = "body",
  headersSuccessCode = 200,
  disableUi = false,
  fastifyOpts = {},
  healthChecks = {},
  compression = "",
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

  if (compression) {
    const encodings = compression.split(",").map((s) => s.trim()).filter(Boolean);
    if (encodings.length > 0) {
      fastify.register(compress, {
        encodings,
        threshold: 0,
      });
    }
  }

  const decompressors = {
    gzip: createGunzip,
    br: createBrotliDecompress,
    deflate: createInflate,
  };

  fastify.addHook("preParsing", (request, reply, payload, done) => {
    const encoding = request.headers["content-encoding"];
    if (!encoding) return done(null, payload);

    const factory = decompressors[encoding];
    if (!factory) {
      reply.code(415).send({ error: `Unsupported Content-Encoding: ${encoding}` });
      return;
    }

    delete request.headers["content-encoding"];
    delete request.headers["content-length"];

    const decompressor = factory();
    decompressor.on("error", () => {
      reply.code(400).send({ error: "Invalid compressed data" });
    });

    done(null, payload.pipe(decompressor));
  });

  const metrics = createMetricsCollector(healthChecks);

  // Register all routes inside a plugin so they are added after @fastify/swagger
  // loads its onRoute hook — this ensures swagger discovers every route schema.
  fastify.register(function routes(instance, _opts, done) {
    // Serve llms.txt (always public)
    const llmsTxt = readFileSync(join(__dirname, "llms.txt"), "utf8");
    instance.get("/llms.txt", async (_request, reply) => {
      reply.type("text/plain");
      return llmsTxt;
    });

    // API key hook — only applied when apiKey is set
    instance.addHook("onRequest", async (request, reply) => {
      if (!apiKey) return;
      if (request.url === "/" || request.url === "/llms.txt" || request.url.startsWith("/health")) return;
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
      instance.get("/", async (_request, reply) => {
        reply.code(404);
        return { error: "UI is disabled" };
      });
    } else {
    const docs = renderDocs();
    const docTabs = docs.map((d) => `<button class="tab" data-tab="${d.id}">${d.label}</button>`).join("\n      ");
    const docPanels = docs.map((d) => `<div class="tab-panel doc-content" id="tab-${d.id}">${d.html}</div>`).join("\n    ");
    const uiTemplate = readFileSync(join(__dirname, "ui.html"), "utf8");
    const uiHtml = uiTemplate.replace("{{DOC_TABS}}", docTabs).replace("{{DOC_PANELS}}", docPanels);

    instance.get("/", async (_request, reply) => {
      reply.type("text/html");
      return uiHtml;
    });
    }

    // OpenAPI spec endpoint
    instance.get("/api/openapi.json", async (_request, reply) => {
      return instance.swagger();
    });

    // API endpoint
    instance.post("/api/detect", {
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
              description: "Results of analysis",
            type: "object",
            properties: {
              label: {
                  description: "SAFE or INJECTION indicating if the classification is SAFE for LLM consumption or has detected a potential injection attack",
                  type: "string", enum: ["SAFE", "INJECTION"] },
              score: {
                  description: "Number between 0 and 1 that indicates confidence of classification",
                  type: "number" },
              isInjection: {
                  description: "boolean indicator or true (potential injection detected) or false (classification indicates SAFE) ",
                  type: "boolean" },
              ms: { description: "Time (in milliseconds) taken by classifier to make determination, NOT total response processing time", type: "number" },
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
      request.detectMs = ms;
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

    // Metrics collection hook
    instance.addHook("onResponse", (request, reply, done) => {
      metrics.onResponse(request, reply, done);
    });

    // Health check endpoints
    const healthContentType = "application/health+json";

    instance.get("/health", {
      schema: {
        description: "Full RFC-compliant health check",
      },
    }, async (_request, reply) => {
      const body = metrics.getHealthResponse();
      const code = body.status === "fail" ? 503 : 200;
      reply.code(code).type(healthContentType);
      return body;
    });

    instance.get("/health/live", {
      schema: {
        description: "Liveness probe — process is running",
      },
    }, async (_request, reply) => {
      reply.type(healthContentType);
      return metrics.getLiveResponse();
    });

    instance.get("/health/ready", {
      schema: {
        description: "Readiness probe — model is loaded",
      },
    }, async (_request, reply) => {
      const body = metrics.getReadyResponse();
      const code = body.status === "pass" ? 200 : 503;
      reply.code(code).type(healthContentType);
      return body;
    });

    done();
  });

  return fastify;
}
