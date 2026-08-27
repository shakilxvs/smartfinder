"use client";

import type { DeviceRecord } from "@smartfind/protocol";

const PLATFORM_LABEL: Record<DeviceRecord["platform"], string> = {
  android: "Android",
  ios: "iPhone",
  macos: "macOS",
  windows: "Windows",
  web: "Browser",
  linux: "Linux",
};

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}

export function DeviceCard({
  device,
  isRinging,
  onRing,
  onStopRing,
  onMessage,
  onRename,
  onUnpair,
  selected,
  onToggleSelect,
}: {
  device: DeviceRecord;
  isRinging: boolean;
  onRing: () => void;
  onStopRing: () => void;
  onMessage: () => void;
  onRename: () => void;
  onUnpair: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const online = device.status === "online";

  return (
    <div
      className={`group relative rounded-2xl border bg-surface p-4 transition ${
        isRinging ? "sf-ringing border-signal" : "border-border hover:border-border/80"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${device.deviceName}`}
            className="mt-1.5 h-4 w-4 rounded border-border bg-bg accent-signal"
          />
          <div>
            <p className="font-display text-base font-semibold leading-tight">
              {device.deviceName}
            </p>
            <p className="mt-0.5 font-mono text-xs text-text-muted">
              {PLATFORM_LABEL[device.platform]}
              {device.model ? ` · ${device.model}` : ""}
            </p>
          </div>
        </div>

        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span
            className={`sf-ring-dot absolute inline-flex h-full w-full rounded-full ${
              online ? "bg-signal" : "bg-offline"
            }`}
          />
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3 font-mono text-xs text-text-muted">
        <span>{online ? "Online" : `Offline · last seen ${timeAgo(device.lastSeen)}`}</span>
        {typeof device.battery === "number" && (
          <span>
            🔋 {device.battery}%{device.charging ? " ⚡" : ""}
          </span>
        )}
      </div>

      {!device.capabilities.backgroundRing && (
        <p className="mt-2 text-xs text-text-muted">
          ⚠️ Reliable only while the app is open — see iOS limitations
        </p>
      )}

      <div className="mt-4 flex gap-2">
        {isRinging ? (
          <button
            onClick={onStopRing}
            className="flex-1 rounded-lg border border-danger/50 bg-danger-dim px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/20"
          >
            ■ Stop
          </button>
        ) : (
          <button
            onClick={onRing}
            disabled={!online || !device.capabilities.ring}
            className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium transition enabled:hover:border-signal/50 enabled:hover:text-signal disabled:cursor-not-allowed disabled:opacity-40"
          >
            🔔 Ring
          </button>
        )}
        <button
          onClick={onMessage}
          disabled={!online || !device.capabilities.message}
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium transition enabled:hover:border-signal/50 enabled:hover:text-signal disabled:cursor-not-allowed disabled:opacity-40"
        >
          📢 Message
        </button>
      </div>

      <div className="mt-2 flex justify-end gap-3 opacity-0 transition group-hover:opacity-100">
        <button onClick={onRename} className="text-xs text-text-muted hover:text-text">
          Rename
        </button>
        <button onClick={onUnpair} className="text-xs text-text-muted hover:text-danger">
          Unpair
        </button>
      </div>
    </div>
  );
}
