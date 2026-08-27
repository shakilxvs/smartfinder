import express, { Request, Response } from "express";
import cors from "cors";
import {
  generateRequestId,
  clampRingDuration,
  RingCommand,
  StopRingCommand,
  MessageCommand,
  PairingRequest,
} from "@smartfind/protocol";
import { DeviceStore } from "./store";
import { Hub } from "./hub";
import { logger } from "@smartfind/shared";

export function buildApi(store: DeviceStore, hub: Hub, serverName: string) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Every mutating endpoint (except pairing/complete, which authenticates via
  // the one-time code itself) requires a bearer token belonging to a
  // registered device. See docs/security.md for the full threat model.
  function requireAuth(req: Request, res: Response): string | null {
    const auth = req.header("authorization");
    const deviceId = req.header("x-device-id");
    if (!auth?.startsWith("Bearer ") || !deviceId) {
      res.status(401).json({ error: "missing_credentials" });
      return null;
    }
    const token = auth.slice("Bearer ".length);
    const device = store.authenticate(deviceId, token);
    if (!device) {
      res.status(401).json({ error: "unauthorized" });
      return null;
    }
    return deviceId;
  }

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, serverName, time: Date.now() });
  });

  // --- Pairing ---

  app.post("/api/pairing/start", (req: Request, res: Response) => {
    const requesterId = requireAuth(req, res);
    if (!requesterId) return;
    const requester = store.get(requesterId)!;
    if (!requester.isAdmin) {
      return res.status(403).json({ error: "only_admin_can_generate_pairing_codes" });
    }
    const session = store.createPairingSession(requesterId);
    res.json({ code: session.code, expiresAt: session.expiresAt });
  });

  // First-ever device on a brand-new server bootstraps itself as admin
  // without needing a pairing code from anyone (nobody exists to grant one).
  app.post("/api/pairing/bootstrap", (req: Request, res: Response) => {
    if (store.hasAnyAdmin()) {
      return res.status(409).json({ error: "admin_already_exists" });
    }
    const { deviceName, platform, model } = req.body ?? {};
    if (!deviceName || !platform) {
      return res.status(400).json({ error: "deviceName_and_platform_required" });
    }
    const { deviceId, token } = store.registerDevice({ deviceName, platform, model, makeAdmin: true });
    logger.info("Bootstrap admin device registered", { deviceId });
    res.json({ deviceId, token, serverName });
  });

  app.post("/api/pairing/complete", (req: Request, res: Response) => {
    const body = req.body as PairingRequest;
    if (!body?.code || !body?.deviceName || !body?.platform) {
      return res.status(400).json({ error: "code_deviceName_platform_required" });
    }
    const session = store.consumePairingSession(body.code);
    if (!session) {
      return res.status(400).json({ error: "invalid_or_expired_code" });
    }
    store.invalidatePairingSession(body.code);
    const { deviceId, token } = store.registerDevice({
      deviceName: body.deviceName,
      platform: body.platform,
      model: body.model,
      makeAdmin: false,
    });
    logger.info("Device paired", { deviceId });
    res.json({ deviceId, token, serverName });
  });

  // --- Devices ---

  app.get("/api/devices", (req: Request, res: Response) => {
    if (!requireAuth(req, res)) return;
    res.json({ devices: store.allPublic() });
  });

  app.patch("/api/devices/:id", (req: Request, res: Response) => {
    const requesterId = requireAuth(req, res);
    if (!requesterId) return;
    const { deviceName } = req.body ?? {};
    if (!deviceName) return res.status(400).json({ error: "deviceName_required" });
    const ok = store.rename(req.params.id, deviceName);
    if (!ok) return res.status(404).json({ error: "not_found" });
    hub.broadcastDeviceList();
    res.json({ ok: true });
  });

  app.delete("/api/devices/:id", (req: Request, res: Response) => {
    const requesterId = requireAuth(req, res);
    if (!requesterId) return;
    const requester = store.get(requesterId)!;
    if (!requester.isAdmin && requesterId !== req.params.id) {
      return res.status(403).json({ error: "only_admin_can_remove_other_devices" });
    }
    const ok = store.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: "not_found" });
    hub.broadcastDeviceList();
    res.json({ ok: true });
  });

  // --- Commands ---

  app.post("/api/devices/:id/ring", (req: Request, res: Response) => {
    if (!requireAuth(req, res)) return;
    const target = req.params.id;
    const device = store.get(target);
    if (!device) return res.status(404).json({ error: "not_found" });
    if (!device.capabilities.ring) {
      return res.status(422).json({ error: "device_does_not_support_ring" });
    }
    const command: RingCommand = {
      type: "RING",
      target,
      requestId: generateRequestId(),
      timestamp: Date.now(),
      durationMs: clampRingDuration(req.body?.durationMs),
    };
    const result = hub.sendCommand(command);
    res.json({ requestId: command.requestId, ...result });
  });

  app.post("/api/devices/:id/stop-ring", (req: Request, res: Response) => {
    if (!requireAuth(req, res)) return;
    const target = req.params.id;
    const command: StopRingCommand = {
      type: "STOP_RING",
      target,
      requestId: generateRequestId(),
      timestamp: Date.now(),
    };
    const result = hub.sendCommand(command);
    res.json({ requestId: command.requestId, ...result });
  });

  app.post("/api/devices/:id/message", (req: Request, res: Response) => {
    if (!requireAuth(req, res)) return;
    const target = req.params.id;
    const device = store.get(target);
    if (!device) return res.status(404).json({ error: "not_found" });
    const message = (req.body?.message ?? "").toString().slice(0, 280);
    if (!message.trim()) return res.status(400).json({ error: "message_required" });
    const command: MessageCommand = {
      type: "MESSAGE",
      target,
      requestId: generateRequestId(),
      timestamp: Date.now(),
      message,
    };
    const result = hub.sendCommand(command);
    res.json({ requestId: command.requestId, ...result });
  });

  app.post("/api/devices/ring-all", (req: Request, res: Response) => {
    if (!requireAuth(req, res)) return;
    const durationMs = clampRingDuration(req.body?.durationMs);
    const targets = hub.broadcastCommand((target) => ({
      type: "RING",
      target,
      requestId: generateRequestId(),
      timestamp: Date.now(),
      durationMs,
    }));
    res.json({ targets });
  });

  app.post("/api/devices/message-all", (req: Request, res: Response) => {
    if (!requireAuth(req, res)) return;
    const message = (req.body?.message ?? "").toString().slice(0, 280);
    if (!message.trim()) return res.status(400).json({ error: "message_required" });
    const targets = hub.broadcastCommand((target) => ({
      type: "MESSAGE",
      target,
      requestId: generateRequestId(),
      timestamp: Date.now(),
      message,
    }));
    res.json({ targets });
  });

  return app;
}
