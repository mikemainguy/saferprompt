import { pipeline } from "@huggingface/transformers";

const MODEL = "protectai/deberta-v3-base-prompt-injection-v2";

console.log(`Downloading model: ${MODEL}`);
const classifier = await pipeline("text-classification", MODEL, {
  cache_dir: "./models",
});
console.log("Model downloaded to ./models");
