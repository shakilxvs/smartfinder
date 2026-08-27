# Security

SmartFind's threat model is deliberately scoped: **a single home, a
trusted-but-not-perfectly-trusted Wi-Fi network, and a handful of devices
belonging to one household.** It is not designed to resist a
sophisticated attacker who has already compromised your router or a device
on your network. Within that scope:

## What's protected

- **No unauthenticated control.** Every command-issuing REST endpoint and
  the WebSocket `hello` handshake require a bearer token tied to a specific
  `deviceId`. Being on the same Wi-Fi network is not sufficient to ring,
  message, rename, or remove a device — you must have completed pairing.
- **Pairing requires a shared secret, not just network presence.** The
  6-digit pairing code is single-use and expires after 5 minutes. Anyone
  who can see the code (shown on the admin's screen or read aloud) can pair
  a device; this is intentional — it's the same trust model as "read the
  Wi-Fi password off the fridge."
- **Tokens are long, random, and stored encrypted at rest.**
  `crypto.randomBytes(32)` server-side; `EncryptedSharedPreferences` (Android
  Keystore-backed) and the iOS Keychain on-device. Logs are automatically
  redacted (`packages/shared/src/index.ts`) so tokens and message bodies
  never end up in server log output, even in debug mode.
- **Admin/owner separation.** The first device ever paired becomes the
  permanent admin and is the only device that can generate new pairing
  codes or remove *other* devices (any device can unpair itself). This
  stops a guest's phone, once paired for a party, from silently minting
  pairing codes for more devices later.
- **No covert functionality, by design.** SmartFind does not and will not
  implement hidden tracking, silent microphone/camera access, keylogging,
  or monitoring without the paired device's own visible app being installed
  and running. A paired device always knows it's paired — there is no
  "stealth mode."

## What's explicitly out of scope

- **A malicious actor with root/jailbreak on a paired device** can read
  that device's own token — but that only lets them impersonate *that one
  device*, not the whole system, and only for as long as it stays paired.
- **A compromised router** that can intercept LAN traffic could observe
  device IDs and (if you haven't put the server behind TLS — see below)
  plaintext command traffic. This is a general home-network risk, not
  specific to SmartFind.
- **Physical access to the server's `smartfind-data.json`** exposes every
  device's token in plaintext, since the file needs to be readable by a
  single-process Node app with no separate secrets manager. Protect the
  server host the way you'd protect any always-on home server (disk
  encryption, OS user permissions, don't expose it to the internet).

## Transport encryption

By default the server speaks plain HTTP/WS on the LAN, matching the
project's "no mandatory cloud dependency, works with internet off" goal —
running your own local CA and distributing certs to every phone is a lot of
friction for a single-home tool. If you want WSS/HTTPS:

- Put the server behind a reverse proxy (e.g. Caddy or nginx) with a
  certificate from your router/home CA, or
- Use a self-signed cert and accept the manual trust step on each client.

Either way, traffic never needs to leave your LAN to accomplish this —
it's a local encryption decision, not a cloud dependency.

## Reporting a concern

This is a personal/home project template, not a maintained product with a
security response team. If you extend it for wider use (e.g. multiple
households sharing infrastructure), re-evaluate this threat model — it was
written for "my family's phones on my home Wi-Fi," not for anything
multi-tenant.
