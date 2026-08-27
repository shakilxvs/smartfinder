# Architecture

SmartFind is a local-first client/server system. One machine on your home
network runs the **SmartFind server**; every other device runs a **client**
(the web dashboard, the Android app, or the iOS app) that connects to it.

```
                 HOME WI-FI
                     │
              ┌──────┴──────┐
              │             │
        SmartFind Server    │
        (Node.js, apps/server)
              │             │
       ┌──────┼─────────────┼───────────┐
       │      │             │           │
      📱     📱            📱          💻
    Android  iPhone      Browser     Browser
       │      │             │           │
       └──────┴─────────────┴───────────┘
                     │
              📱 Controller (any client can act as one)
```

## Why this shape

- **No mandatory cloud dependency.** The server is a plain Node process you
  run on any always-on machine on your LAN (an old laptop, a Raspberry Pi, a
  NAS that can run Node). All core functionality — pairing, device list,
  ring, message, status — works with the internet completely off, as long as
  Wi-Fi/LAN is up. See "Final Acceptance Test, Step 7" in the original spec.
- **A "controller" is not a separate app.** Any paired device (including the
  web dashboard itself) can send commands to any other device. The first
  device ever paired becomes the **admin**, who alone can mint new pairing
  codes. See `docs/security.md`.
- **One JSON file as the database.** At the target scale (5–20 devices in a
  single home) a real database is unnecessary complexity. `smartfind-data.json`
  next to the server process is the entire durable state; back it up like any
  other file if you care about device history surviving a server reinstall.

## Components

| Component | Path | Tech | Job |
|---|---|---|---|
| Server | `apps/server` | Node.js, TypeScript, `ws`, Express, `bonjour-service` | Device registry, pairing, auth, command routing, mDNS + UDP discovery advertisement |
| Dashboard | `apps/dashboard` | Next.js, React, TypeScript, Tailwind | Controller UI; also a first-class "web" client that can itself be rung/messaged |
| Android client | `apps/android` | Kotlin, OkHttp, NsdManager | Native client; strongest available background ring behavior via a foreground service |
| iOS client | `apps/ios` | Swift, SwiftUI, Network.framework | Native client; fully reliable in foreground, honestly limited in background — see `docs/ios-limitations.md` |
| Shared protocol | `packages/protocol`, `packages/types` | TypeScript | Wire format, IDs, defaults. Android/iOS carry hand-ported mirrors since they can't import a TS package directly — see `docs/protocol.md`. |

## Data flow for a RING command

1. Controller calls `POST /api/devices/:id/ring` (or `/ring-all`) with its
   bearer token.
2. Server validates the token, looks up the target's live WebSocket
   connection. If offline, it immediately reports `failed: device_offline`.
3. Server emits `sending` → sends the `RING` command over the socket →
   emits `delivered`.
4. The client acks `executing` the moment it starts the alert, then
   `completed` once it's actually ringing (or `failed` if it couldn't).
5. All of this streams back to every connected controller in real time —
   the dashboard listens on both its own WebSocket connection and a
   `/api/status-stream` Server-Sent-Events feed (SSE is used for status so a
   command *issued* by the dashboard, which doesn't loop back over its own
   inbound socket, still shows live progress).
6. If no ack arrives within 15 seconds, the server marks the command
   `timed_out` so a stuck device doesn't just look like it's still "sending"
   forever.

## Reconnection

Every client (dashboard, Android, iOS) reconnects with exponential backoff
(1s → 2s → 4s … capped at 30s) rather than hammering the network after a
router restart, DHCP renewal, or brief Wi-Fi drop (spec requirement #18).
The server separately sweeps devices that haven't sent a heartbeat in 45s
and marks them offline, so a device that vanished uncleanly (phone died,
app force-killed) doesn't show as falsely online forever.
