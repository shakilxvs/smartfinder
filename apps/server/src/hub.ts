import { WebSocket, WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import {
  isClientToServerMessage,
  ServerToClientMessage,
  Command,
  CommandStatusUpdate,
  DEFAULTS,
} from "@smartfind/protocol";
import { DeviceStore } from "./store";
import { logger } from "@smartfind/shared";

interface Connection {
  socket: WebSocket;
  deviceId: string;
}

// Pending commands we're waiting on an ack for, so the controller can see
// "sending -> delivered -> executing -> completed/failed/timed_out".
interface PendingCommand {
  requestId: string;
  target: string;
  timeout: NodeJS.Timeout;
}

export class Hub {
  private wss: WebSocketServer;
  private connections = new Map<string, Connection>(); // deviceId -> connection
  private pending = new Map<string, PendingCommand>(); // requestId -> pending
  private statusListeners = new Set<(u: CommandStatusUpdate) => void>();

  constructor(private store: DeviceStore, server: import("http").Server) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (socket, req) => this.onConnection(socket, req));

    setInterval(() => {
      const changed = this.store.sweepStale();
      if (changed.length) {
        logger.info("Marking stale devices offline", { deviceIds: changed });
        this.broadcastDeviceList();
      }
    }, DEFAULTS.HEARTBEAT_INTERVAL_MS);
  }

  onStatusUpdate(fn: (u: CommandStatusUpdate) => void): void {
    this.statusListeners.add(fn);
  }

  private emitStatus(update: CommandStatusUpdate): void {
    for (const fn of this.statusListeners) fn(update);
  }

  private onConnection(socket: WebSocket, req: IncomingMessage): void {
    let authedDeviceId: string | null = null;
    const remote = req.socket.remoteAddress;

    const authTimeout = setTimeout(() => {
      if (!authedDeviceId) {
        logger.warn("Closing unauthenticated connection (hello timeout)", { remote });
        socket.close(4001, "auth_timeout");
      }
    }, 10_000);

    socket.on("message", (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        this.send(socket, { kind: "error", message: "invalid_json" });
        return;
      }

      if (!isClientToServerMessage(msg)) {
        this.send(socket, { kind: "error", message: "invalid_message" });
        return;
      }

      if (msg.kind === "hello") {
        const device = this.store.authenticate(msg.deviceId, msg.token);
        if (!device) {
          logger.warn("Rejected hello: bad credentials", { deviceId: msg.deviceId, remote });
          this.send(socket, { kind: "error", message: "unauthorized" });
          socket.close(4003, "unauthorized");
          return;
        }
        clearTimeout(authTimeout);
        authedDeviceId = device.deviceId;

        // If this device already had a connection (reconnect / duplicate tab),
        // close the old one so commands don't fan out to a dead socket.
        const existing = this.connections.get(device.deviceId);
        if (existing) existing.socket.close(4009, "superseded");

        this.connections.set(device.deviceId, { socket, deviceId: device.deviceId });
        this.store.markOnline(device.deviceId);
        logger.info("Device connected", { deviceId: device.deviceId, remote });

        this.send(socket, { kind: "welcome", deviceId: device.deviceId, serverTime: Date.now() });
        this.broadcastDeviceList();
        return;
      }

      if (!authedDeviceId) {
        this.send(socket, { kind: "error", message: "must_hello_first" });
        return;
      }

      if (msg.kind === "heartbeat") {
        this.store.updateHeartbeat(authedDeviceId, msg.battery, msg.charging);
        return;
      }

      if (msg.kind === "ack") {
        const pending = this.pending.get(msg.requestId);
        if (pending) {
          this.emitStatus({
            requestId: msg.requestId,
            target: pending.target,
            status: msg.status,
            detail: msg.detail,
            timestamp: Date.now(),
          });
          if (msg.status === "completed" || msg.status === "failed") {
            clearTimeout(pending.timeout);
            this.pending.delete(msg.requestId);
          }
        }
        return;
      }
    });

    socket.on("close", () => {
      clearTimeout(authTimeout);
      if (authedDeviceId) {
        // Only mark offline if this socket is still the current one for that
        // device (avoids a race where a fast reconnect gets clobbered).
        const current = this.connections.get(authedDeviceId);
        if (current && current.socket === socket) {
          this.connections.delete(authedDeviceId);
          this.store.markOffline(authedDeviceId);
          logger.info("Device disconnected", { deviceId: authedDeviceId });
          this.broadcastDeviceList();
        }
      }
    });

    socket.on("error", (err) => {
      logger.warn("Socket error", { deviceId: authedDeviceId, err: String(err) });
    });
  }

  private send(socket: WebSocket, msg: ServerToClientMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  broadcastDeviceList(): void {
    const devices = this.store.allPublic();
    const msg: ServerToClientMessage = { kind: "device_list", devices };
    for (const conn of this.connections.values()) {
      this.send(conn.socket, msg);
    }
  }

  isOnline(deviceId: string): boolean {
    return this.connections.has(deviceId);
  }

  /**
   * Send a command to a single device. Returns immediately; delivery/result
   * arrives asynchronously via emitStatus (subscribe with onStatusUpdate).
   */
  sendCommand(command: Command): { accepted: boolean; reason?: string } {
    const target = "target" in command ? command.target : undefined;
    if (!target) return { accepted: false, reason: "no_target" };

    const conn = this.connections.get(target);
    if (!conn) {
      this.emitStatus({
        requestId: command.requestId,
        target,
        status: "failed",
        detail: "device_offline",
        timestamp: Date.now(),
      });
      return { accepted: false, reason: "device_offline" };
    }

    this.emitStatus({
      requestId: command.requestId,
      target,
      status: "sending",
      timestamp: Date.now(),
    });

    this.send(conn.socket, { kind: "command", command });

    this.emitStatus({
      requestId: command.requestId,
      target,
      status: "delivered",
      timestamp: Date.now(),
    });

    const timeout = setTimeout(() => {
      this.emitStatus({
        requestId: command.requestId,
        target,
        status: "timed_out",
        timestamp: Date.now(),
      });
      this.pending.delete(command.requestId);
    }, 15_000);

    this.pending.set(command.requestId, { requestId: command.requestId, target, timeout });
    return { accepted: true };
  }

  /** Fan a command out to every currently-online, capable device. */
  broadcastCommand(makeCommand: (target: string) => Command): string[] {
    const targets = Array.from(this.connections.keys());
    for (const target of targets) {
      this.sendCommand(makeCommand(target));
    }
    return targets;
  }
}
