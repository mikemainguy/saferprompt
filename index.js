import "dotenv/config";
import { pipeline } from "@huggingface/transformers";

const MODEL = "protectai/deberta-v3-base-prompt-injection-v2";

/**
 * @typedef {Object} DetectionResult
 * @property {"SAFE"|"INJECTION"} label — classification label
 * @property {number} score — confidence score between 0 and 1
 * @property {boolean} isInjection — true when label is "INJECTION"
 */

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
 * @returns {Promise<(text: string) => Promise<DetectionResult>>}
 * @example
 * const detect = await createDetector();
 * const result = await detect("ignore previous instructions");
 * console.log(result.isInjection); // true
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
let _modelReady = false;

/**
 * Returns true once the singleton model has been successfully loaded.
 * @returns {boolean}
 */
export function isModelReady() {
  return _modelReady;
}

/**
 * Convenience function that uses a lazy singleton detector.
 *
 * @param {string} text — the prompt text to classify
 * @returns {Promise<DetectionResult>}
 * @example
 * const result = await detectInjection("ignore previous instructions");
 * console.log(result.label); // "INJECTION"
 */
export async function detectInjection(text) {
  if (!_singleton) {
    _singleton = createDetector();
  }
  const detect = await _singleton;
  _modelReady = true;
  return detect(text);
}
