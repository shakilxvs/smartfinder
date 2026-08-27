// SmartFind shared domain types.
// These types are the single source of truth for the shape of a "device",
// a "command", and connection/pairing state across the server, dashboard,
// and native clients (Android/iOS ports of this protocol).

export type Platform = "android" | "ios" | "macos" | "windows" | "web" | "linux";

export type DeviceStatus = "online" | "offline";

export interface DeviceRecord {
  deviceId: string; // sf_xxxxxxxx, generated at registration time
  deviceName: string; // user-editable friendly name
  platform: Platform;
  model?: string;
  status: DeviceStatus;
  battery?: number; // 0-100, omitted if the OS/browser does not expose it
  charging?: boolean;
  lastSeen: number; // epoch ms
  paired: boolean;
  isController: boolean; // true if this connection is a controller, not a locatable device
  isAdmin: boolean; // owner/admin controller, see docs/security.md
  capabilities: DeviceCapabilities;
}

export interface DeviceCapabilities {
  ring: boolean;
  message: boolean;
  battery: boolean;
  backgroundRing: boolean; // can ring while backgrounded/locked (honest per-platform flag)
}

export type CommandType = "RING" | "STOP_RING" | "MESSAGE" | "PING" | "PONG";

export interface BaseCommand {
  type: CommandType;
  requestId: string;
  timestamp: number;
}

export interface RingCommand extends BaseCommand {
  type: "RING";
  target: string; // deviceId, or "*" for all
  durationMs: number; // configurable ring duration, server enforces a max
}

export interface StopRingCommand extends BaseCommand {
  type: "STOP_RING";
  target: string;
}

export interface MessageCommand extends BaseCommand {
  type: "MESSAGE";
  target: string;
  message: string;
}

export interface PingCommand extends BaseCommand {
  type: "PING";
}

export interface PongCommand extends BaseCommand {
  type: "PONG";
}

export type Command = RingCommand | StopRingCommand | MessageCommand | PingCommand | PongCommand;

export type CommandStatus =
  | "sending"
  | "delivered"
  | "executing"
  | "completed"
  | "failed"
  | "timed_out";

export interface CommandStatusUpdate {
  requestId: string;
  target: string;
  status: CommandStatus;
  detail?: string;
  timestamp: number;
}

// --- Wire protocol envelopes exchanged over the WebSocket connection ---

export type ClientToServerMessage =
  | { kind: "hello"; deviceId: string; token: string; deviceInfo: Partial<DeviceRecord> }
  | { kind: "ack"; requestId: string; status: CommandStatus; detail?: string }
  | { kind: "heartbeat"; battery?: number; charging?: boolean };

export type ServerToClientMessage =
  | { kind: "welcome"; deviceId: string; serverTime: number }
  | { kind: "command"; command: Command }
  | { kind: "device_list"; devices: DeviceRecord[] }
  | { kind: "status_update"; update: CommandStatusUpdate }
  | { kind: "error"; message: string };

// --- Pairing ---

export interface PairingSession {
  code: string; // 6-digit human enterable code
  qrPayload: string; // includes server address + one-time secret
  expiresAt: number;
  createdBy: string; // admin deviceId that generated it
}

export interface PairingRequest {
  code: string;
  deviceName: string;
  platform: Platform;
  model?: string;
}

export interface PairingResult {
  deviceId: string;
  token: string; // long-lived auth token, stored on-device, never re-transmitted in plaintext logs
  serverName: string;
}
