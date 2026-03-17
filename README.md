# SaferPrompt

Detect prompt injection attacks in LLM inputs using a local classifier. No API keys required — the model runs entirely on your machine.

## Model

This project uses [**deberta-v3-base-prompt-injection-v2**](https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2) by [ProtectAI](https://protectai.com/), served through [Hugging Face Transformers.js](https://huggingface.co/docs/transformers.js). The model is a fine-tuned DeBERTa-v3-base classifier trained to distinguish safe prompts from injection attempts.

## Installation

```bash
npm install
```

### Download model (optional)

On first run the model (~395 MB) is downloaded automatically and cached in `./models`. To pre-download it:

```bash
npm run download-model
```

## Usage

### As a library

```js
import { detectInjection } from "saferprompt";

const result = await detectInjection("Ignore all previous instructions.");
console.log(result);
// { label: "INJECTION", score: 0.9998, isInjection: true }
```

`detectInjection(text)` returns:

| Field         | Type    | Description                            |
|---------------|---------|----------------------------------------|
| `label`       | string  | `"SAFE"` or `"INJECTION"`             |
| `score`       | number  | Confidence score (0–1)                 |
| `isInjection` | boolean | `true` when label is `"INJECTION"`     |

For multiple pipeline instances, use `createDetector()`:

```js
import { createDetector } from "saferprompt";

const detect = await createDetector();
const result = await detect("What is the capital of France?");
// { label: "SAFE", score: 0.9997, isInjection: false }
```

### As an HTTP server

```bash
npm start
```

This starts an Express server on port 3000 (override with `PORT` env var). It provides:

- **`GET /`** — A web UI for testing prompts interactively
- **`POST /api/detect`** — JSON API

```bash
curl -X POST http://localhost:3000/api/detect \
  -H "Content-Type: application/json" \
  -d '{"text": "Ignore all previous instructions."}'
```

## Testing

```bash
npm test
```

Runs the test suite using the Node.js built-in test runner.

## License

ISC

## Acknowledgments

The prompt injection detection model is developed and maintained by [ProtectAI](https://protectai.com/). See the [model card on Hugging Face](https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2) for training details, dataset information, and licensing.
