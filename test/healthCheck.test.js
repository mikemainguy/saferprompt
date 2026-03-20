import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMetricsCollector } from "../healthCheck.js";
import { setTimeout as delay } from "node:timers/promises";

describe("createMetricsCollector unit tests", () => {
  // ── Cache hit (lines 124-126) ──────────────────────────────────────
  it("returns cached response within TTL", () => {
    const mc = createMetricsCollector({
      cacheTtlMs: 60_000,
      isModelReadyFn: () => true,
    });
    const first = mc.getHealthResponse();
    const second = mc.getHealthResponse();
    assert.strictEqual(first, second, "should return same cached object");
  });

  // ── Warn on high heap (heapWarnPercent: 0) ─────────────────────────
  it("reports warn status when heap exceeds threshold", () => {
    const mc = createMetricsCollector({
      heapWarnPercent: 0,
      isModelReadyFn: () => true,
    });
    const res = mc.getHealthResponse();
    assert.strictEqual(res.status, "warn");
    assert.strictEqual(res.checks["memory:heap"][0].status, "warn");
  });

  // ── Error rate tracking (line 84) ─────────────────────────────────
  it("tracks 5xx errors in errorRate", () => {
    const mc = createMetricsCollector({
      isModelReadyFn: () => true,
    });
    mc.onResponse(
      { url: "/api/detect" },
      { statusCode: 500 },
      () => {},
    );
    const metrics = mc.getMetrics();
    assert.ok(metrics.errorRate > 0, "errorRate should be > 0 after a 5xx");
  });

  // ── Detect timing tracking (lines 85-88) ──────────────────────────
  it("accumulates detectMs into avgDetectMs", () => {
    const mc = createMetricsCollector({
      isModelReadyFn: () => true,
    });
    mc.onResponse(
      { url: "/api/detect", detectMs: 42 },
      { statusCode: 200 },
      () => {},
    );
    mc.onResponse(
      { url: "/api/detect", detectMs: 58 },
      { statusCode: 200 },
      () => {},
    );
    const metrics = mc.getMetrics();
    assert.strictEqual(metrics.avgDetectMs, 50);
  });

  // ── Sliding window prune (lines 46-48) ────────────────────────────
  it("prunes events outside the sliding window", async () => {
    const mc = createMetricsCollector({
      metricsWindowMs: 1,
      isModelReadyFn: () => true,
      checks: "requests",
    });
    mc.onResponse({ url: "/" }, { statusCode: 200 }, () => {});
    await delay(5);
    const metrics = mc.getMetrics();
    assert.strictEqual(metrics.requestCount, 0, "old events should be pruned");
  });

  // ── Event loop reset (lines 53-57) ────────────────────────────────
  it("resets event loop histogram after window elapses", async () => {
    const mc = createMetricsCollector({
      metricsWindowMs: 1,
      isModelReadyFn: () => true,
      checks: "eventloop",
    });
    await delay(5);
    // Should not throw — histogram.reset() and ELU re-baseline happen here
    const metrics = mc.getMetrics();
    assert.ok(metrics.eventLoopP99 != null, "eventLoopP99 should be present");
  });

  // ── Model not ready → fail (line 134-135) ─────────────────────────
  it("reports fail when model check enabled and model not ready", () => {
    const mc = createMetricsCollector({
      isModelReadyFn: () => false,
    });
    const res = mc.getHealthResponse();
    assert.strictEqual(res.status, "fail");
    assert.strictEqual(res.checks["model:ready"][0].status, "fail");
  });

  // ── Model check disabled + not ready → fail (lines 195-197) ───────
  it("forces fail when model check disabled but model not ready", () => {
    const mc = createMetricsCollector({
      checks: "uptime",
      isModelReadyFn: () => false,
    });
    const res = mc.getHealthResponse();
    assert.strictEqual(res.status, "fail");
    assert.ok(!res.checks["model:ready"], "model:ready check should not be present");
  });

  // ── getReadyResponse with model not ready ──────────────────────────
  it("getReadyResponse returns fail when model not ready", () => {
    const mc = createMetricsCollector({
      isModelReadyFn: () => false,
    });
    const res = mc.getReadyResponse();
    assert.strictEqual(res.status, "fail");
  });

  // ── getReadyResponse with model ready ──────────────────────────────
  it("getReadyResponse returns pass when model ready", () => {
    const mc = createMetricsCollector({
      isModelReadyFn: () => true,
    });
    const res = mc.getReadyResponse();
    assert.strictEqual(res.status, "pass");
  });

  // ── getLiveResponse always passes ──────────────────────────────────
  it("getLiveResponse always returns pass", () => {
    const mc = createMetricsCollector({
      isModelReadyFn: () => true,
    });
    assert.deepStrictEqual(mc.getLiveResponse(), { status: "pass" });
  });

  // ── Disabled check categories ──────────────────────────────────────
  it("only includes checks for enabled categories", () => {
    const mc = createMetricsCollector({
      checks: "model",
      isModelReadyFn: () => true,
    });
    const res = mc.getHealthResponse();
    assert.ok(res.checks["model:ready"], "model:ready should be present");
    assert.ok(!res.checks["uptime:process"], "uptime:process should not be present");
    assert.ok(!res.checks["memory:heap"], "memory:heap should not be present");
    assert.ok(!res.checks["cpu:eventLoopDelay"], "eventLoopDelay should not be present");
    assert.ok(!res.checks["requests:total"], "requests:total should not be present");
  });

  // ── onResponse without done callback ───────────────────────────────
  it("onResponse works without a done callback", () => {
    const mc = createMetricsCollector({
      isModelReadyFn: () => true,
    });
    // Should not throw when done is undefined
    mc.onResponse({ url: "/" }, { statusCode: 200 });
    const metrics = mc.getMetrics();
    assert.strictEqual(metrics.requestCount, 1);
  });
});
