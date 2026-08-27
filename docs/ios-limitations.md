# iOS limitations — read this before expecting Android-equivalent behavior

This is the single most important document in the repo for setting correct
expectations. **iOS is not Android**, and no amount of clever client code
changes the underlying platform rule: **apps cannot keep an arbitrary
network socket alive indefinitely while backgrounded or the device is
locked.** This is enforced by the OS itself for battery-life reasons, and
it applies equally to SmartFind and to every other third-party app that
isn't Apple's own Find My.

## What works reliably on iOS

- While the SmartFind app is **open and in the foreground**, ring and
  message commands arrive and display immediately, exactly like Android.
- For a short window after backgrounding — iOS grants roughly 30 seconds
  via `UIBackgroundTask`, and this client uses that window (see
  `ConnectionManager.appDidEnterBackground`) — a command already in flight
  can still complete.
- Once you reopen the app, it reconnects immediately and any commands sent
  while it was unreachable can be retried by the controller (the dashboard
  shows `timed_out` rather than a false "delivered").

## What does not work, and why

| Scenario | Behavior | Why |
|---|---|---|
| App backgrounded a few minutes, RING sent | Likely fails/times out | iOS suspends the process's network access; the WebSocket is dead even though the app hasn't been force-quit |
| Phone locked, screen off, RING sent | Likely fails/times out | Same as above — locking accelerates suspension |
| App force-quit from the app switcher | Always fails | No process = no socket, on any OS |

This is not a bug to be fixed in a future version of this client. It's a
deliberate Apple platform restriction that exists so that background apps
can't drain your battery holding sockets open. **Any app claiming to
reliably "ring your locked iPhone" without Apple's own push
infrastructure is either overstating what it does, or relying on the same
short grace windows described above.**

## The one real fix: Apple Push Notification service (APNs)

The only Apple-sanctioned way to reliably wake a backgrounded/locked
iPhone on demand is a **remote push notification** delivered through APNs.
This is architecturally different from everything else in SmartFind:

- It requires **your own paid Apple Developer Program membership**
  ($99/yr) and an APNs authentication key.
- Your SmartFind **server** would need to call out to Apple's cloud
  (`api.push.apple.com`) whenever it wants to reach an offline iOS device —
  a genuine, non-optional internet dependency for this one feature, unlike
  everything else in this project which works with the internet off.
- Waking the app via push still only gives it a short background-processing
  window (via `UNNotificationServiceExtension` or a
  `content-available` background push) to reconnect, ring, and disconnect —
  it's a "tap on the shoulder to check in," not a permanent connection.
- Taking over a **locked screen** the way Android's `RingActivity` does
  additionally requires Apple's **Critical Alerts** entitlement, which
  Apple grants only after a manual review for specific approved use cases
  (things like home security and medical alerting). A general "find my
  misplaced phone" app is not guaranteed approval, and using the
  entitlement without approval will get the app rejected or removed. This
  client instead uses the standard, always-available **Time Sensitive**
  interruption level, which surfaces more prominently than a normal
  notification but does not bypass Silent Mode/Focus and does not turn the
  screen on by itself.

`ConnectionManager.registerForRemoteNotificationsIfConfigured()` is a
stubbed entry point for this path. It requests ordinary notification
permission and registers for remote notifications, but does nothing useful
until you've done the developer-account and server-side work described
above. Wiring up an actual APNs sender is a real project, not a toggle —
treat it as a v2 feature, not something this template pretends to already
provide.

## What SmartFind deliberately does NOT do on iOS

- Does not use undocumented/private APIs to fake persistent background
  execution — that would get the app rejected from the App Store and is
  exactly the kind of "faking functionality" the original spec explicitly
  ruled out.
- Does not claim Silent Mode or Focus can be bypassed. The ring sound uses
  `AVAudioSession.Category.playback`, which *can* sound through the
  physical mute switch (same as many alarm-adjacent apps), but it still
  respects whatever Focus/Do Not Disturb configuration the user has set,
  same as any well-behaved app.
- Does not request Critical Alerts without going through Apple's actual
  approval process — requesting it and getting rejected, or worse, using it
  without approval, would put the whole app at risk.

## Practical advice for users

- Keep SmartFind open (or at least recently backgrounded) on the iPhone you
  most want to be able to locate, if that's a realistic option for you.
- For "I lost my phone somewhere in the house right now," Apple's own
  **Find My** app (built into every iPhone) already solves this better than
  any third-party app can, precisely because Apple's own OS gives Find My
  privileges no third-party developer can get. SmartFind's iOS client is
  most useful as a **local, no-account, no-Apple-ID messaging channel**
  ("bring my phone" style messages) between household devices, with ringing
  as a best-effort bonus when the app happens to be reachable — not as a
  guaranteed locate-a-locked-phone tool.
