import { createWriteStream } from "node:fs";

function makeWriter(dest) {
  if (!dest) return null;
  if (dest === "stdout") return (line) => process.stdout.write(line + "\n");
  if (dest === "stderr") return (line) => process.stderr.write(line + "\n");
  const stream = createWriteStream(dest, { flags: "a" });
  return (line) => stream.write(line + "\n");
}

export function createLogger({
  injectionLog = process.env.INJECTION_LOG || "",
  benignLog = process.env.BENIGN_LOG || "",
  allLog = process.env.ALL_LOG || "",
} = {}) {
  const injectionWriter = makeWriter(injectionLog);
  const benignWriter = makeWriter(benignLog);
  const allWriter = makeWriter(allLog);

  const hasAnyLogger = !!(injectionWriter || benignWriter || allWriter);

  function logResult({ text, label, score, isInjection, ms }) {
    if (!hasAnyLogger) return;

    const line = JSON.stringify({
      ts: new Date().toISOString(),
      text,
      label,
      score,
      isInjection,
      ms,
    });

    if (allWriter) allWriter(line);
    if (isInjection && injectionWriter) injectionWriter(line);
    if (!isInjection && benignWriter) benignWriter(line);
  }

  function getActiveDestinations() {
    const active = [];
    if (injectionLog) active.push(`INJECTION_LOG → ${injectionLog}`);
    if (benignLog) active.push(`BENIGN_LOG → ${benignLog}`);
    if (allLog) active.push(`ALL_LOG → ${allLog}`);
    return active;
  }

  return { logResult, getActiveDestinations };
}

// Default instance using env vars — drop-in replacement for existing call sites
const { logResult, getActiveDestinations } = createLogger();
export { logResult, getActiveDestinations };
