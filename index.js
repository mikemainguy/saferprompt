import "dotenv/config";
import { pipeline } from "@huggingface/transformers";

const MODEL = "protectai/deberta-v3-base-prompt-injection-v2";

function isLocalOnly() {
  const val = process.env.LOCAL_MODELS_ONLY;
  return val === "true" || val === "1";
}

/**
 * Creates a new prompt-injection detector.
 * Returns a detect function bound to its own pipeline instance.
 *
 * @param {object} [options]
 * @param {boolean} [options.localOnly] — skip network fetches; use cached model only
 */
export async function createDetector({ localOnly } = {}) {
  const local = localOnly ?? isLocalOnly();
  const classifier = await pipeline("text-classification", MODEL, {
    cache_dir: "./models",
    local_files_only: local,
  });

  return async function detect(text) {
    const [result] = await classifier(text);
    return {
      label: result.label,
      score: result.score,
      isInjection: result.label === "INJECTION",
    };
  };
}

let _singleton = null;

/**
 * Convenience function that uses a lazy singleton detector.
 */
export async function detectInjection(text) {
  if (!_singleton) {
    _singleton = createDetector();
  }
  const detect = await _singleton;
  return detect(text);
}
