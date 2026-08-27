export type LogLevel = "debug" | "info" | "warn" | "error";

// Fields that must never be written to logs, even in debug mode.
const REDACT_KEYS = new Set(["token", "message", "qrPayload", "code"]);

function redact(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.has(k) ? "[redacted]" : redact(v);
  }
  return out;
}

function timestamp(): string {
  return new Date().toISOString().substring(11, 19); // HH:MM:SS
}

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const line = `${timestamp()} [${level.toUpperCase()}] ${message}`;
  const safeMeta = meta ? redact(meta) : undefined;
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (safeMeta) {
    fn(line, safeMeta);
  } else {
    fn(line);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};
