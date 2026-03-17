import "dotenv/config";
import express from "express";
import { detectInjection } from "./index.js";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || "";

app.use(express.json());

// API key middleware — only applied when API_KEY is set
function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  const provided = req.headers["x-api-key"];
  if (provided === API_KEY) return next();
  return res.status(401).json({ error: "Invalid or missing x-api-key header" });
}

// Serve the test UI
app.get("/", (_req, res) => {
  res.send(`<!DOCTYPE html>
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
app.post("/api/detect", requireApiKey, async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "\"text\" field is required" });
  }
  const start = Date.now();
  const result = await detectInjection(text);
  res.json({ ...result, ms: Date.now() - start });
});

// Pre-load the model, then start listening
console.log("Loading model (first run downloads ~395M params)...");
await detectInjection("warmup");
app.listen(PORT, () => console.log(`SaferPrompt running at http://localhost:${PORT}`));
