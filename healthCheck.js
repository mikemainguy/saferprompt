import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { isModelReady } from "./index.js";
import pkg from "./package.json" with { type: "json" };

const MODEL_ID = "deberta-v3-base-prompt-injection-v2";

/**
 * Creates a metrics collector and health-check response builder.
 *
 * @param {object} [options]
 * @param {string} [options.checks]          — comma-separated enabled check categories
 * @param {number} [options.cacheTtlMs]      — cache duration for /health response
 * @param {number} [options.heapWarnPercent]  — heap % threshold for "warn"
 * @param {number} [options.eventLoopWarnMs]  — event loop p99 delay threshold for "warn"
 * @param {number} [options.metricsWindowMs]  — sliding window size in ms for request/event-loop metrics
 * @returns {{ onResponse: Function, getMetrics: Function, getHealthResponse: Function, getLiveResponse: Function, getReadyResponse: Function }}
 */
export function createMetricsCollector({
  checks = "model,uptime,memory,requests,eventloop",
  cacheTtlMs = 5000,
  heapWarnPercent = 85,
  eventLoopWarnMs = 100,
  metricsWindowMs = 300000,
  isModelReadyFn = isModelReady,
} = {}) {
  const enabledChecks = new Set(checks.split(",").map((s) => s.trim()));

  // Sliding window of request events: { time, isError, detectMs? }
  const requestEvents = [];

  // Event loop monitoring — reset on each window boundary
  let histogram = null;
  let elu1 = null;
  let eventLoopResetTime = Date.now();
  if (enabledChecks.has("eventloop")) {
    histogram = monitorEventLoopDelay({ resolution: 20 });
    histogram.enable();
    elu1 = performance.eventLoopUtilization();
  }

  // Response cache
  let cachedResponse = null;
  let cacheTime = 0;

  function pruneEvents(now) {
    const cutoff = now - metricsWindowMs;
    while (requestEvents.length > 0 && requestEvents[0].time < cutoff) {
      requestEvents.shift();
    }
  }

  function resetEventLoopIfNeeded(now) {
    if (!histogram) return;
    if (now - eventLoopResetTime >= metricsWindowMs) {
      histogram.reset();
      elu1 = performance.eventLoopUtilization();
      eventLoopResetTime = now;
    }
  }

  function onResponse(request, reply, done) {
    const event = { time: Date.now(), isError: reply.statusCode >= 500 };
    if (request.url === "/api/detect" && request.detectMs != null) {
      event.detectMs = request.detectMs;
    }
    requestEvents.push(event);
    if (done) done();
  }

  function getMetrics() {
    const now = Date.now();
    pruneEvents(now);
    resetEventLoopIfNeeded(now);

    const mem = process.memoryUsage();
    const heapPercent = Math.round((mem.heapUsed / mem.heapTotal) * 100);
    const elu = elu1 ? performance.eventLoopUtilization(elu1) : null;
    const p99 = histogram ? histogram.percentile(99) / 1e6 : null; // ns to ms

    const windowRequestCount = requestEvents.length;
    let windowErrorCount = 0;
    let windowDetectTotalMs = 0;
    let windowDetectCount = 0;
    for (const evt of requestEvents) {
      if (evt.isError) windowErrorCount++;
      if (evt.detectMs != null) {
        windowDetectTotalMs += evt.detectMs;
        windowDetectCount++;
      }
    }

    const avgDetectMs = windowDetectCount > 0
      ? Math.round((windowDetectTotalMs / windowDetectCount) * 100) / 100
      : 0;
    const errorRate = windowRequestCount > 0
      ? Math.round((windowErrorCount / windowRequestCount) * 10000) / 10000
      : 0;

    return {
      modelReady: isModelReadyFn(),
      uptime: Math.round(process.uptime()),
      heapPercent,
      eventLoopP99: p99 != null ? Math.round(p99 * 100) / 100 : null,
      eventLoopUtilization: elu ? Math.round(elu.utilization * 10000) / 10000 : null,
      requestCount: windowRequestCount,
      errorRate,
      avgDetectMs,
    };
  }

  function buildCheck(observedValue, opts = {}) {
    return [{
      ...(opts.componentId ? { componentId: opts.componentId } : {}),
      componentType: opts.componentType || "system",
      observedValue,
      ...(opts.observedUnit ? { observedUnit: opts.observedUnit } : {}),
      status: opts.status || "pass",
      time: new Date().toISOString(),
      ...(opts.affectedEndpoints ? { affectedEndpoints: opts.affectedEndpoints } : {}),
    }];
  }

  function getHealthResponse() {
    const now = Date.now();
    if (cachedResponse && now - cacheTime < cacheTtlMs) {
      return cachedResponse;
    }

    const metrics = getMetrics();
    const checks_obj = {};
    let overallStatus = "pass";

    // Model ready (always included)
    if (enabledChecks.has("model")) {
      const modelStatus = metrics.modelReady ? "pass" : "fail";
      if (modelStatus === "fail") overallStatus = "fail";
      checks_obj["model:ready"] = buildCheck(metrics.modelReady, {
        componentId: MODEL_ID,
        componentType: "component",
        status: modelStatus,
        affectedEndpoints: ["/api/detect"],
      });
    }

    // Uptime
    if (enabledChecks.has("uptime")) {
      checks_obj["uptime:process"] = buildCheck(metrics.uptime, {
        observedUnit: "s",
      });
    }

    // Memory
    if (enabledChecks.has("memory")) {
      const memStatus = metrics.heapPercent > heapWarnPercent ? "warn" : "pass";
      if (memStatus === "warn" && overallStatus === "pass") overallStatus = "warn";
      checks_obj["memory:heap"] = buildCheck(metrics.heapPercent, {
        observedUnit: "percent",
        status: memStatus,
      });
    }

    // Event loop
    if (enabledChecks.has("eventloop")) {
      if (metrics.eventLoopP99 != null) {
        const elStatus = metrics.eventLoopP99 > eventLoopWarnMs ? "warn" : "pass";
        if (elStatus === "warn" && overallStatus === "pass") overallStatus = "warn";
        checks_obj["cpu:eventLoopDelay"] = buildCheck(metrics.eventLoopP99, {
          observedUnit: "ms",
          status: elStatus,
        });
      }
      if (metrics.eventLoopUtilization != null) {
        checks_obj["cpu:eventLoopUtilization"] = buildCheck(metrics.eventLoopUtilization, {
          observedUnit: "ratio",
        });
      }
    }

    // Requests
    if (enabledChecks.has("requests")) {
      checks_obj["requests:total"] = buildCheck(metrics.requestCount, {
        componentType: "component",
      });
      checks_obj["requests:errorRate"] = buildCheck(metrics.errorRate, {
        componentType: "component",
        observedUnit: "ratio",
      });
      checks_obj["detect:avgResponseTime"] = buildCheck(metrics.avgDetectMs, {
        componentType: "component",
        observedUnit: "ms",
        affectedEndpoints: ["/api/detect"],
      });
    }

    // If model not checked but still not ready, fail
    if (!enabledChecks.has("model") && !isModelReadyFn()) {
      overallStatus = "fail";
    }

    const response = {
      status: overallStatus,
      version: pkg.version,
      serviceId: "saferprompt",
      description: "Prompt injection detection service",
      checks: checks_obj,
      links: {
        about: "https://github.com/mikemainguy/saferprompt",
      },
    };

    cachedResponse = response;
    cacheTime = now;

    return response;
  }

  function getLiveResponse() {
    return { status: "pass" };
  }

  function getReadyResponse() {
    return isModelReadyFn()
      ? { status: "pass" }
      : { status: "fail" };
  }

  return { onResponse, getMetrics, getHealthResponse, getLiveResponse, getReadyResponse };
}
