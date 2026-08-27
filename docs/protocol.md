# Protocol

The canonical definition of every message shape lives in
`packages/protocol/src/index.ts` and `packages/types/src/index.ts`. Android
(`apps/android/.../net/Protocol.kt`) and iOS
(`apps/ios/SmartFind/Networking/Protocol.swift`) each carry a **manually
synchronized mirror** of the same JSON shapes, because neither Kotlin nor
Swift can import a TypeScript package directly. If you change the wire
format, change it in all three places and bump `PROTOCOL_VERSION`.

## Transport

- **REST** (`http(s)://<server>/api/...`) — used for anything a controller
  initiates: pairing, listing devices, issuing ring/message commands,
  rename/remove.
- **WebSocket** (`ws(s)://<server>/ws`) — used for anything a *client*
  needs to receive in real time: incoming commands, device list updates,
  status updates. Every client, including the dashboard, connects here.
- **Server-Sent Events** (`GET /api/status-stream`) — a read-only broadcast
  of command status updates, so the controller UI can show live
  `sending → delivered → executing → completed/failed/timed_out` progress
  even for commands it issued itself over REST (which wouldn't otherwise
  loop back to it over its own inbound WebSocket).

## Connecting

1. Open the WebSocket at `/ws`.
2. Immediately send:
   ```json
   { "kind": "hello", "deviceId": "sf_xxxx", "token": "...", "deviceInfo": {} }
   ```
3. Server replies `{ "kind": "welcome", "deviceId": "...", "serverTime": 173... }`
   on success, or `{ "kind": "error", "message": "unauthorized" }` and closes
   the socket (code 4003) on bad credentials.
4. Client sends a `heartbeat` message roughly every 15s with battery info if
   available. The server marks a device offline if it hears nothing for 45s.

## Commands (server → client)

```json
{ "kind": "command", "command": {
  "type": "RING", "target": "sf_xxxx", "requestId": "req_...",
  "timestamp": 173..., "durationMs": 30000
}}
```

`type` is one of `RING`, `STOP_RING`, `MESSAGE`, `PING`. `MESSAGE` additionally
carries a `message` string (server truncates to 280 chars).

## Acknowledgements (client → server)

```json
{ "kind": "ack", "requestId": "req_...", "status": "completed", "detail": "optional" }
```

`status` is one of `sending`, `delivered`, `executing`, `completed`, `failed`,
`timed_out`. `sending`/`delivered` are set by the server itself (it knows
when it queued and flushed the socket write); clients are only expected to
send `executing`, `completed`, or `failed`.

## Pairing

- `POST /api/pairing/bootstrap` — no auth required, but the server refuses
  if an admin already exists. The very first device to call this becomes
  the permanent admin. Body: `{ deviceName, platform, model? }`.
- `POST /api/pairing/start` — admin-only (bearer token required). Returns a
  6-digit `code` valid for 5 minutes, single-use.
- `POST /api/pairing/complete` — no auth required (the code itself is the
  credential). Body: `{ code, deviceName, platform, model? }`. Returns
  `{ deviceId, token, serverName }`; the client stores `token` and never
  transmits it anywhere except the `Authorization: Bearer` header and the
  WebSocket `hello` message.

## Discovery

Clients try, in order:

1. **mDNS/Bonjour** — the server advertises `_smartfind._tcp` via
   `bonjour-service`. Android uses `NsdManager`, iOS uses
   `NWBrowser`/`Network.framework`, the web dashboard relies on the OS
   resolver understanding the well-known hostname `smartfind.local`.
2. **UDP broadcast fallback** — some routers/APs block mDNS multicast
   (common on guest networks or client-isolated Wi-Fi). The server also
   listens on UDP port `53177` for a broadcast packet containing the literal
   string `SMARTFIND_DISCOVER` and replies with its own address/port as
   JSON. This is implemented in `apps/server/src/udpDiscovery.ts`; native
   clients can add a UDP fallback the same way if mDNS/NSD/NWBrowser both
   time out (the current Android/iOS clients ship the mDNS path only, with
   manual entry as the fallback — UDP client-side is a documented next step).
3. **Manual entry** — every onboarding screen ends with "enter the server
   address" as the final fallback, and it always works if the other two
   don't, as long as the phone can reach the server's IP directly.

## Defaults and limits (`packages/protocol/src/index.ts`)

| Constant | Value |
|---|---|
| Default ring duration | 30s |
| Max ring duration | 60s |
| Pairing code TTL | 5 min |
| Heartbeat interval | 15s |
| Heartbeat timeout (marks offline) | 45s |
| Reconnect backoff | 1s → 2s → 4s … capped at 30s |
