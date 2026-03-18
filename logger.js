import { createWriteStream } from "node:fs";

const INJECTION_LOG = process.env.INJECTION_LOG || "";
const BENIGN_LOG = process.env.BENIGN_LOG || "";
const ALL_LOG = process.env.ALL_LOG || "";

function makeWriter(dest) {
  if (!dest) return null;
  if (dest === "stdout") return (line) => process.stdout.write(line + "\n");
  if (dest === "stderr") return (line) => process.stderr.write(line + "\n");
  const stream = createWriteStream(dest, { flags: "a" });
  return (line) => stream.write(line + "\n");
}

const injectionWriter = makeWriter(INJECTION_LOG);
const benignWriter = makeWriter(BENIGN_LOG);
const allWriter = makeWriter(ALL_LOG);

const hasAnyLogger = !!(injectionWriter || benignWriter || allWriter);

export function logResult({ text, label, score, isInjection, ms }) {
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

export function getActiveDestinations() {
  const active = [];
  if (INJECTION_LOG) active.push(`INJECTION_LOG → ${INJECTION_LOG}`);
  if (BENIGN_LOG) active.push(`BENIGN_LOG → ${BENIGN_LOG}`);
  if (ALL_LOG) active.push(`ALL_LOG → ${ALL_LOG}`);
  return active;
}
