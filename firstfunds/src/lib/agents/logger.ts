// Structured JSON logging with automatic redaction. Never log raw documents,
// SSNs, message bodies or model reasoning — pass ids and outcomes instead.
import { redactObject } from "./redact";

type Level = "debug" | "info" | "warn" | "error";
const sink: { lines: string[] | null } = { lines: null }; // tests can capture output

export function captureLogs() {
  const captured: string[] = [];
  sink.lines = captured;
  return {
    lines: () => captured,
    stop: () => {
      sink.lines = null;
    },
  };
}

export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...(redactObject(fields) as object) });
  if (sink.lines) sink.lines.push(line);
  else if (process.env.NODE_ENV !== "test") (level === "error" ? console.error : console.log)(line);
}
