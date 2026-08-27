import fs from "fs";
import path from "path";
import {
  DeviceRecord,
  PairingSession,
  generatePairingCode,
  generateToken,
  generateDeviceId,
  DEFAULTS,
} from "@smartfind/protocol";
import { logger } from "@smartfind/shared";

// Persistence is a flat JSON file. This is intentional: SmartFind is a
// single-home, single-server local tool. A real database is unnecessary
// complexity for the target scale (5-20 devices). This keeps "no mandatory
// cloud dependency" trivially true and makes the whole store auditable by
// just opening the file.

interface PersistedDevice {
  deviceId: string;
  deviceName: string;
  platform: DeviceRecord["platform"];
  model?: string;
  token: string; // hashed would be ideal for a multi-tenant system; for a
  // single-home local server holding this token is equivalent to holding
  // the device's local-network credential. See docs/security.md.
  isAdmin: boolean;
  createdAt: number;
}

interface DbShape {
  devices: PersistedDevice[];
}

const DB_PATH = process.env.SMARTFIND_DB_PATH || path.join(process.cwd(), "smartfind-data.json");

function loadDb(): DbShape {
  if (!fs.existsSync(DB_PATH)) {
    return { devices: [] };
  }
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(raw) as DbShape;
  } catch (err) {
    logger.error("Failed to read device database, starting fresh", { err: String(err) });
    return { devices: [] };
  }
}

function saveDb(db: DbShape): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

export interface LiveDevice extends DeviceRecord {
  token: string;
}

export class DeviceStore {
  private db: DbShape;
  private live = new Map<string, LiveDevice>(); // deviceId -> live/runtime state
  private pairingSessions = new Map<string, PairingSession>();

  constructor() {
    this.db = loadDb();
    for (const d of this.db.devices) {
      this.live.set(d.deviceId, {
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        platform: d.platform,
        model: d.model,
        status: "offline",
        lastSeen: d.createdAt,
        paired: true,
        isController: false,
        isAdmin: d.isAdmin,
        token: d.token,
        capabilities: capabilitiesFor(d.platform),
      });
    }
    logger.info(`Loaded ${this.db.devices.length} known device(s) from disk`);
  }

  hasAnyAdmin(): boolean {
    return this.db.devices.some((d) => d.isAdmin);
  }

  createPairingSession(createdBy: string): PairingSession {
    const session: PairingSession = {
      code: generatePairingCode(),
      qrPayload: JSON.stringify({ v: 1 }), // filled in with server address by caller
      expiresAt: Date.now() + DEFAULTS.PAIRING_CODE_TTL_MS,
      createdBy,
    };
    this.pairingSessions.set(session.code, session);
    return session;
  }

  consumePairingSession(code: string): PairingSession | null {
    const session = this.pairingSessions.get(code);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.pairingSessions.delete(code);
      return null;
    }
    return session;
  }

  invalidatePairingSession(code: string): void {
    this.pairingSessions.delete(code);
  }

  registerDevice(params: {
    deviceName: string;
    platform: DeviceRecord["platform"];
    model?: string;
    makeAdmin?: boolean;
  }): { deviceId: string; token: string } {
    const deviceId = generateDeviceId();
    const token = generateToken();
    const isAdmin = params.makeAdmin ?? !this.hasAnyAdmin(); // first device ever paired becomes admin/owner

    const persisted: PersistedDevice = {
      deviceId,
      deviceName: params.deviceName,
      platform: params.platform,
      model: params.model,
      token,
      isAdmin,
      createdAt: Date.now(),
    };
    this.db.devices.push(persisted);
    saveDb(this.db);

    this.live.set(deviceId, {
      deviceId,
      deviceName: params.deviceName,
      platform: params.platform,
      model: params.model,
      status: "offline",
      lastSeen: Date.now(),
      paired: true,
      isController: false,
      isAdmin,
      token,
      capabilities: capabilitiesFor(params.platform),
    });

    logger.info("Device registered", { deviceId, platform: params.platform, isAdmin });
    return { deviceId, token };
  }

  authenticate(deviceId: string, token: string): LiveDevice | null {
    const device = this.live.get(deviceId);
    if (!device) return null;
    if (device.token !== token) return null;
    return device;
  }

  markOnline(deviceId: string): void {
    const d = this.live.get(deviceId);
    if (!d) return;
    d.status = "online";
    d.lastSeen = Date.now();
  }

  markOffline(deviceId: string): void {
    const d = this.live.get(deviceId);
    if (!d) return;
    d.status = "offline";
    d.lastSeen = Date.now();
  }

  updateHeartbeat(deviceId: string, battery?: number, charging?: boolean): void {
    const d = this.live.get(deviceId);
    if (!d) return;
    d.lastSeen = Date.now();
    if (typeof battery === "number") d.battery = battery;
    if (typeof charging === "boolean") d.charging = charging;
  }

  rename(deviceId: string, newName: string): boolean {
    const d = this.live.get(deviceId);
    if (!d) return false;
    d.deviceName = newName;
    const persisted = this.db.devices.find((p) => p.deviceId === deviceId);
    if (persisted) {
      persisted.deviceName = newName;
      saveDb(this.db);
    }
    return true;
  }

  remove(deviceId: string): boolean {
    const existed = this.live.delete(deviceId);
    const before = this.db.devices.length;
    this.db.devices = this.db.devices.filter((p) => p.deviceId !== deviceId);
    if (this.db.devices.length !== before) saveDb(this.db);
    return existed;
  }

  get(deviceId: string): LiveDevice | undefined {
    return this.live.get(deviceId);
  }

  all(): LiveDevice[] {
    return Array.from(this.live.values());
  }

  allPublic(): DeviceRecord[] {
    return this.all().map(({ token, ...rest }) => rest);
  }

  // Devices considered "stale" get flipped offline; called on a timer.
  sweepStale(): string[] {
    const now = Date.now();
    const changed: string[] = [];
    for (const d of this.live.values()) {
      if (d.status === "online" && now - d.lastSeen > DEFAULTS.HEARTBEAT_TIMEOUT_MS) {
        d.status = "offline";
        changed.push(d.deviceId);
      }
    }
    return changed;
  }
}

function capabilitiesFor(platform: DeviceRecord["platform"]): DeviceRecord["capabilities"] {
  switch (platform) {
    case "android":
      return { ring: true, message: true, battery: true, backgroundRing: true };
    case "ios":
      // Honest per docs/ios-limitations.md: ring/message are fully reliable
      // only while the app is foregrounded. Backgrounded/locked delivery is
      // not guaranteed by iOS without APNs + Critical Alerts entitlement.
      return { ring: true, message: true, battery: true, backgroundRing: false };
    case "macos":
    case "windows":
    case "linux":
      return { ring: true, message: true, battery: false, backgroundRing: false };
    case "web":
      return { ring: true, message: true, battery: false, backgroundRing: false };
    default:
      return { ring: false, message: false, battery: false, backgroundRing: false };
  }
}
