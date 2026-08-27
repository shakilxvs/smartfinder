# Android implementation notes

Android gives third-party apps a genuinely strong "keep running and stay
reachable" mechanism — the **foreground service** — which is what
`SmartFindConnectionService` uses. This is why the Android client can offer
a real "ring even when locked" guarantee that the iOS client cannot (see
`docs/ios-limitations.md` for why they differ).

## How it works

1. `MainActivity` starts `SmartFindConnectionService` as a foreground
   service (`startForegroundService` + `startForeground(...)`), which shows
   a persistent "SmartFind — Connected · listening for commands"
   notification. Android will not kill a foreground service just for being
   idle, unlike a normal background process or a background-restricted app.
2. The service keeps a single OkHttp WebSocket open to the server, with a
   20s ping interval (keeps router/NAT connection-tracking entries alive)
   and exponential-backoff reconnect on any drop.
3. On a `RING` command, the service posts a **full-screen-intent
   notification** with `CATEGORY_ALARM` priority. Android displays this
   over the lock screen and turns the display on — the same mechanism
   incoming-call and alarm-clock apps use. `RingActivity` then plays audio
   on `STREAM_ALARM` at forced max volume and vibrates in a repeating
   pattern, with a hard-capped duration (default 30s, max 60s) enforced
   both client-side and by the service as a backstop.
4. `BootReceiver` restarts the service after a device reboot if the phone
   is already paired, so a phone restart doesn't silently disable
   findability.

## What this can and cannot guarantee

**Guaranteed** as long as the foreground service is alive: the ring
notification will be posted and will wake/interrupt a locked screen,
because the network socket never goes through Android's normal background
network suspension — foreground services are explicitly exempted from
that.

**Not guaranteed:**

- **The user force-stops the app** from Settings → Apps → SmartFind →
  Force stop. Android deliberately gives users this override and no app
  can prevent or detect it in advance; the service simply won't be running.
- **Aggressive OEM battery managers.** Stock Android's foreground-service
  exemption is respected by Google/Pixel devices and most AOSP-based ROMs,
  but several OEM skins ship additional, non-standard battery managers that
  kill foreground services anyway unless the user manually whitelists the
  app in OEM-specific settings, separate from standard Android's battery
  optimization setting:
  - **Xiaomi (MIUI/HyperOS):** Settings → Apps → Manage apps → SmartFind →
    Autostart (enable) + Battery saver → No restrictions.
  - **Huawei/Honor (EMUI/MagicOS):** Settings → Battery → App launch →
    SmartFind → switch to Manage manually → enable Auto-launch,
    Secondary launch, and Run in background.
  - **OnePlus/Oppo/Vivo (ColorOS/OxygenOS/FunTouch):** Settings → Battery →
    App Battery Management → SmartFind → set to "Allow background
    activity" / disable "Sleep standby optimization" for the app.
  - **Samsung (One UI):** generally respects standard Android behavior once
    you disable battery optimization for the app (Settings → Apps →
    SmartFind → Battery → Unrestricted), but very old One UI versions had
    an aggressive "Sleeping apps" list worth double-checking.

  `MainActivity` prompts the user through the **standard Android** "ignore
  battery optimizations" dialog (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`),
  which is the one mechanism every OEM is required to support. It cannot
  reach into an OEM-specific settings screen on the user's behalf — Android
  doesn't provide an API for that, and doing so via non-standard means would
  be exactly the kind of "bypassing OS security restrictions" the project
  spec explicitly forbids.
- **Do Not Disturb configured to block alarms too.** `STREAM_ALARM` respects
  the user's own DND "Alarms only" exception if they've turned that
  exception off; SmartFind does not override DND settings.

## Permissions requested, and why

| Permission | Why |
|---|---|
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC` | Required to run the persistent connection service (Android 14+ requires a declared FGS type) |
| `POST_NOTIFICATIONS` | Required on Android 13+ to show any notification, including the ring/message alerts |
| `USE_FULL_SCREEN_INTENT` | Lets a RING command interrupt the lock screen like a call/alarm |
| `VIBRATE`, `WAKE_LOCK` | Ring alert vibration and keeping the screen on during an active ring |
| `ACCESS_WIFI_STATE`, `CHANGE_WIFI_MULTICAST_STATE` | mDNS/NSD server discovery over the local network |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Powers the standard "don't kill my app" opt-out prompt shown to the user, never applied silently |

No permission here is used for anything beyond what's listed — no location,
no contacts, no SMS, no camera/microphone.
