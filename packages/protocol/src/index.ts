import crypto from "crypto";
import type {
  ClientToServerMessage,
  ServerToClientMessage,
  Command,
} from "@smartfind/types";

// Protocol version. Bump when the wire format changes in a breaking way.
export const PROTOCOL_VERSION = 1;

export const DEFAULTS = {
  RING_DURATION_MS: 30_000,
  MAX_RING_DURATION_MS: 60_000,
  PAIRING_CODE_TTL_MS: 5 * 60_000,
  HEARTBEAT_INTERVAL_MS: 15_000,
  HEARTBEAT_TIMEOUT_MS: 45_000, // mark offline if no heartbeat/ack within this window
  RECONNECT_BASE_DELAY_MS: 1_000,
  RECONNECT_MAX_DELAY_MS: 30_000,
  MDNS_SERVICE_TYPE: "_smartfind._tcp.local",
  DEFAULT_SERVER_PORT: 8787,
};

export function generateDeviceId(): string {
  return `sf_${crypto.randomBytes(5).toString("hex")}`;
}

export function generateRequestId(): string {
  return `req_${crypto.randomBytes(6).toString("hex")}`;
}

export function generatePairingCode(): string {
  // 6-digit numeric code, zero-padded, avoids leading-zero ambiguity issues
  const n = crypto.randomInt(0, 1_000_000);
  return n.toString().padStart(6, "0");
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function clampRingDuration(requested: number | undefined): number {
  const d = requested ?? DEFAULTS.RING_DURATION_MS;
  return Math.max(1_000, Math.min(d, DEFAULTS.MAX_RING_DURATION_MS));
}

// --- Minimal runtime validation. We avoid pulling in a schema library so the
// protocol package stays dependency-light and easy to port conceptually to
// Kotlin/Swift equivalents. ---

export function isClientToServerMessage(msg: any): msg is ClientToServerMessage {
  if (!msg || typeof msg !== "object") return false;
  if (msg.kind === "hello") {
    return typeof msg.deviceId === "string" && typeof msg.token === "string";
  }
  if (msg.kind === "ack") {
    return typeof msg.requestId === "string" && typeof msg.status === "string";
  }
  if (msg.kind === "heartbeat") {
    return true;
  }
  return false;
}

export function isServerToClientMessage(msg: any): msg is ServerToClientMessage {
  if (!msg || typeof msg !== "object") return false;
  return ["welcome", "command", "device_list", "status_update", "error"].includes(msg.kind);
}

export function isCommand(msg: any): msg is Command {
  if (!msg || typeof msg !== "object") return false;
  return ["RING", "STOP_RING", "MESSAGE", "PING", "PONG"].includes(msg.type);
}

export * from "@smartfind/types";
