"use client";

import type { ConnectionState } from "@/lib/useDevices";

const STATE_LABEL: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  online: "Listening on local network",
  reconnecting: "Reconnecting…",
  offline: "Disconnected",
};

export function RadarHeader({
  serverName,
  connectionState,
  internetAvailable,
  onlineCount,
  totalCount,
  onOpenSettings,
}: {
  serverName: string;
  connectionState: ConnectionState;
  internetAvailable: boolean;
  onlineCount: number;
  totalCount: number;
  onOpenSettings: () => void;
}) {
  return (
    <header className="relative overflow-hidden border-b border-border bg-surface/60">
      {/* ambient radar sweep, purely decorative, respects reduced-motion */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 opacity-20"
      >
        <div className="sf-radar-sweep h-full w-full rounded-full border border-signal/40">
          <div className="absolute left-1/2 top-1/2 h-1/2 w-px origin-top bg-gradient-to-b from-signal to-transparent" />
        </div>
      </div>

      <div className="relative mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
            SmartFind
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            {serverName}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionState === "online" ? "bg-signal" : "bg-offline"
                }`}
              />
              {STATE_LABEL[connectionState]}
            </span>
            <span aria-hidden>·</span>
            <span>
              {onlineCount} of {totalCount} online
            </span>
            {!internetAvailable && (
              <>
                <span aria-hidden>·</span>
                <span className="text-text-muted">
                  🌐 Internet unavailable — local network active
                </span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="rounded-full border border-border bg-surface p-2.5 text-text-muted transition hover:border-signal/50 hover:text-signal"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
