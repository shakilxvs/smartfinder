# SmartFind

Find and message your own devices — phones, tablets, laptops — over your
home Wi-Fi. No mandatory cloud account, no subscription; the core system
runs entirely on your local network and keeps working even with the
internet off.

```
                 HOME WI-FI
                     │
              ┌──────┴──────┐
              │             │
        SmartFind Server    │
              │             │
       ┌──────┼─────────────┼───────────┐
       │      │             │           │
      📱     📱            📱          💻
    Android  iPhone      Browser     Browser
       │      │             │           │
       └──────┴─────────────┴───────────┘
                     │
              📱 Controller (any paired device)
```

## What's real here

This is a working system, not a mockup:

- **`apps/server`** — a Node.js/TypeScript server: WebSocket command
  routing, REST API, mDNS + UDP local discovery, JSON-file device registry,
  pairing/auth. **9/9 automated tests pass**, and it's been exercised
  end-to-end (pair → connect → ring → ack → status stream).
- **`apps/dashboard`** — a Next.js/TypeScript/Tailwind web app: pairing
  onboarding, live device grid, ring/message/ring-all/message-all,
  reconnect-with-backoff, offline/internet-unavailable states. Builds and
  lints clean.
- **`apps/android`** — real Kotlin source for a native client with the
  strongest background ring behavior Android allows (foreground service +
  full-screen alarm-style intent). **Not compiled here** — this sandbox has
  no Android SDK; open it in Android Studio to build.
- **`apps/ios`** — real Swift/SwiftUI source for a native client, honestly
  scoped: fully reliable in the foreground, explicitly and extensively
  documented where iOS itself prevents background reliability. **Not
  compiled here** — this sandbox has no Xcode; open it in Xcode to build.

## Quick start (server + dashboard)

```bash
npm install
npm run build          # builds shared packages + server + dashboard
npm run dev:server     # starts the local server on :8787
# in another terminal
npm run dev:dashboard  # starts the dashboard on :3000
```

Open `http://localhost:3000`. The first device to complete setup becomes
the **admin**. Use Settings → "Generate pairing code" to add more devices
(other browser tabs, or the Android/iOS apps once built).

### Running the server standalone

```bash
cd apps/server
npm run build && npm start
# or, for development with auto-reload:
npm run dev
```

The server logs the mDNS service name and listens on `:8787` by default
(override with `PORT=...`). Device data persists to `smartfind-data.json`
next to wherever you run it (override with `SMARTFIND_DB_PATH`).

### Installing the Android client

Requires Android Studio (this sandbox doesn't have the Android SDK, so it
couldn't be compiled here — the source is complete and ready to open).

```bash
cd apps/android
# Open in Android Studio, or:
./gradlew assembleDebug   # requires the Android SDK to be installed
```

See `docs/android.md` for OEM-specific background-restriction settings
users may need to adjust for the most reliable ring behavior.

### Installing the iOS client

Requires Xcode on macOS (also not available in this sandbox — no Xcode
here either). Create a new Xcode project targeting the files under
`apps/ios/SmartFind`, or generate a project file with `xcodegen`/`tuist` if
you prefer a build-config-as-code workflow; a `project.pbxproj` isn't
checked in since it's large, binary-ish, and IDE-generated.

**Read `docs/ios-limitations.md` before relying on this for anything.** iOS
does not allow a backgrounded/locked app to keep a socket open indefinitely
— this is a platform restriction, not something any client code (this
one included) can fully work around without Apple's own push
infrastructure, which is a real, separate, optional add-on described in
that doc.

## Pairing a new device

1. On an already-paired admin device (or the dashboard), open Settings →
   "Generate pairing code." You get a 6-digit code valid for 5 minutes.
2. On the new device, choose "I have a code," enter it plus a name for the
   device, and submit.
3. First device ever set up on a fresh server instead chooses "First
   device" and becomes the permanent admin — no code needed, since there's
   no one to grant one yet.

## Project structure

```
smartfind/
├── apps/
│   ├── dashboard/     Next.js web dashboard (controller UI)
│   ├── server/        Node.js local server
│   ├── android/       Kotlin native client
│   └── ios/            Swift/SwiftUI native client
├── packages/
│   ├── protocol/      Wire protocol, IDs, defaults (source of truth)
│   ├── types/         Shared TypeScript domain types
│   └── shared/        Logger with automatic secret redaction
├── docs/
│   ├── architecture.md
│   ├── protocol.md
│   ├── security.md
│   ├── ios-limitations.md
│   └── android.md
└── README.md
```

## Honesty about platform limits

The single most important thing to understand before using this: **Android
and iOS are not equally capable here, and that's not a bug.** Android's
foreground-service model lets SmartFind offer a genuinely strong "ring even
when locked" guarantee. iOS's background execution model does not allow
any third-party app to make that same guarantee without Apple's own push
infrastructure — see `docs/ios-limitations.md` for the full, specific
explanation of what works, what doesn't, and why. If a locate-a-locked-
iPhone tool is your primary need, Apple's own built-in Find My app will
always out-perform any third-party app, including this one, because Apple
grants Find My OS privileges no third-party developer can get.

## Testing

```bash
npm run test -w apps/server   # 9 tests: pairing, auth, stale-sweep, capabilities
```

Manual end-to-end flow verified during development: bootstrap admin → mint
pairing code → pair simulated device over live WebSocket → send RING via
REST → receive delivered/completed acks → confirm device list — all against
a running server instance, not mocked.
