import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

function freshStore() {
  const dbPath = path.join(os.tmpdir(), `sf-test-${Date.now()}-${Math.random()}.json`);
  process.env.SMARTFIND_DB_PATH = dbPath;
  delete require.cache[require.resolve("./store")];
  const { DeviceStore } = require("./store");
  return { store: new DeviceStore(), dbPath };
}

test("first registered device becomes admin", () => {
  const { store, dbPath } = freshStore();
  const { deviceId } = store.registerDevice({ deviceName: "Controller", platform: "web" });
  const device = store.get(deviceId);
  assert.equal(device.isAdmin, true);
  fs.rmSync(dbPath, { force: true });
});

test("second registered device is not admin", () => {
  const { store, dbPath } = freshStore();
  store.registerDevice({ deviceName: "Controller", platform: "web" });
  const { deviceId } = store.registerDevice({ deviceName: "Phone", platform: "android" });
  const device = store.get(deviceId);
  assert.equal(device.isAdmin, false);
  fs.rmSync(dbPath, { force: true });
});

test("authenticate rejects wrong token", () => {
  const { store, dbPath } = freshStore();
  const { deviceId } = store.registerDevice({ deviceName: "Phone", platform: "android" });
  assert.equal(store.authenticate(deviceId, "wrong-token"), null);
  fs.rmSync(dbPath, { force: true });
});

test("authenticate accepts correct token", () => {
  const { store, dbPath } = freshStore();
  const { deviceId, token } = store.registerDevice({ deviceName: "Phone", platform: "android" });
  const device = store.authenticate(deviceId, token);
  assert.ok(device);
  assert.equal(device.deviceId, deviceId);
  fs.rmSync(dbPath, { force: true });
});

test("pairing session expires and cannot be reused", () => {
  const { store, dbPath } = freshStore();
  const session = store.createPairingSession("sf_admin");
  session.expiresAt = Date.now() - 1000; // force expiry
  (store as any).pairingSessions.set(session.code, session);
  assert.equal(store.consumePairingSession(session.code), null);
  fs.rmSync(dbPath, { force: true });
});

test("pairing code is single-use", () => {
  const { store, dbPath } = freshStore();
  const session = store.createPairingSession("sf_admin");
  const first = store.consumePairingSession(session.code);
  assert.ok(first);
  store.invalidatePairingSession(session.code);
  const second = store.consumePairingSession(session.code);
  assert.equal(second, null);
  fs.rmSync(dbPath, { force: true });
});

test("rename persists and remove deletes device", () => {
  const { store, dbPath } = freshStore();
  const { deviceId } = store.registerDevice({ deviceName: "Old Name", platform: "android" });
  assert.equal(store.rename(deviceId, "New Name"), true);
  assert.equal(store.get(deviceId).deviceName, "New Name");
  assert.equal(store.remove(deviceId), true);
  assert.equal(store.get(deviceId), undefined);
  fs.rmSync(dbPath, { force: true });
});

test("sweepStale marks devices offline after heartbeat timeout", () => {
  const { store, dbPath } = freshStore();
  const { deviceId } = store.registerDevice({ deviceName: "Phone", platform: "android" });
  store.markOnline(deviceId);
  const device = store.get(deviceId);
  device.lastSeen = Date.now() - 999_999; // force staleness
  const changed = store.sweepStale();
  assert.ok(changed.includes(deviceId));
  assert.equal(store.get(deviceId).status, "offline");
  fs.rmSync(dbPath, { force: true });
});

test("android capabilities include backgroundRing, iOS does not", () => {
  const { store, dbPath } = freshStore();
  const android = store.registerDevice({ deviceName: "A", platform: "android" });
  const ios = store.registerDevice({ deviceName: "I", platform: "ios" });
  assert.equal(store.get(android.deviceId).capabilities.backgroundRing, true);
  assert.equal(store.get(ios.deviceId).capabilities.backgroundRing, false);
  fs.rmSync(dbPath, { force: true });
});
