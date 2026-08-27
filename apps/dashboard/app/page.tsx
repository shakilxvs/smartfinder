"use client";

import { useEffect, useState } from "react";
import type { DeviceRecord } from "@smartfind/protocol";
import { loadSession, apiFetch, SessionInfo } from "@/lib/session";
import { useDevices } from "@/lib/useDevices";
import { PairingSetup } from "@/components/PairingSetup";
import { RadarHeader } from "@/components/RadarHeader";
import { DeviceCard } from "@/components/DeviceCard";
import { MessageComposer } from "@/components/MessageComposer";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SettingsPanel } from "@/components/SettingsPanel";

type ActiveModal =
  | { kind: "message"; target: DeviceRecord | "selected" | "all" }
  | { kind: "confirm-ring-all" }
  | { kind: "settings" }
  | { kind: "rename"; target: DeviceRecord }
  | null;

function useInitialSession() {
  // Lazy-init reads localStorage once on mount without a setState-in-effect,
  // which is otherwise unnecessary render-cycle churn for a value that
  // cannot meaningfully change except through explicit sign-in/out actions.
  const [session, setSession] = useState<SessionInfo | null | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return loadSession();
  });
  return [session, setSession] as const;
}

export default function Home() {
  const [session, setSession] = useInitialSession();
  const [modal, setModal] = useState<ActiveModal>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ringing, setRinging] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const { devices, connectionState, internetAvailable, statuses } = useDevices(session ?? null);

  useEffect(() => {
    const latest = Object.values(statuses).sort((a, b) => b.timestamp - a.timestamp)[0];
    if (!latest) return;
    if (latest.status !== "failed" && latest.status !== "timed_out") return;
    // Deferred to a microtask: this effect is reacting to an external event
    // stream (command acks), not deriving render state, so the notification
    // is scheduled rather than set synchronously during the effect body.
    queueMicrotask(() => {
      setToast(
        latest.status === "failed"
          ? `❌ Command failed on ${latest.target}`
          : `⚠️ ${latest.target} didn't respond in time`
      );
    });
  }, [statuses]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (session === undefined) return null; // avoid flash before localStorage check
  if (session === null) return <PairingSetup onComplete={() => setSession(loadSession())} />;

  const self = devices.find((d) => d.deviceId === session.deviceId);
  const isAdmin = self?.isAdmin ?? false;
  const others = devices.filter((d) => d.deviceId !== session.deviceId);
  const onlineCount = others.filter((d) => d.status === "online").length;

  function setRingState(deviceId: string, on: boolean) {
    setRinging((prev) => {
      const next = new Set(prev);
      if (on) next.add(deviceId);
      else next.delete(deviceId);
      return next;
    });
  }

  async function ring(deviceId: string) {
    setRingState(deviceId, true);
    const res = await apiFetch(session!, `/api/devices/${deviceId}/ring`, { method: "POST" });
    if (!res.ok) {
      setRingState(deviceId, false);
      setToast("❌ Couldn't reach that device");
    }
  }

  async function stopRing(deviceId: string) {
    setRingState(deviceId, false);
    await apiFetch(session!, `/api/devices/${deviceId}/stop-ring`, { method: "POST" });
  }

  async function ringAll() {
    const targets = others.filter((d) => d.status === "online").map((d) => d.deviceId);
    targets.forEach((id) => setRingState(id, true));
    await apiFetch(session!, "/api/devices/ring-all", { method: "POST" });
  }

  async function sendMessage(target: DeviceRecord | "selected" | "all", message: string) {
    if (target === "all") {
      await apiFetch(session!, "/api/devices/message-all", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
    } else if (target === "selected") {
      await Promise.all(
        Array.from(selected).map((id) =>
          apiFetch(session!, `/api/devices/${id}/message`, {
            method: "POST",
            body: JSON.stringify({ message }),
          })
        )
      );
    } else {
      await apiFetch(session!, `/api/devices/${target.deviceId}/message`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
    }
    setToast("📢 Message sent");
    setModal(null);
  }

  async function rename(device: DeviceRecord, name: string) {
    await apiFetch(session!, `/api/devices/${device.deviceId}`, {
      method: "PATCH",
      body: JSON.stringify({ deviceName: name }),
    });
    setModal(null);
  }

  async function unpair(device: DeviceRecord) {
    await apiFetch(session!, `/api/devices/${device.deviceId}`, { method: "DELETE" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <RadarHeader
        serverName={session.serverName}
        connectionState={connectionState}
        internetAvailable={internetAvailable}
        onlineCount={onlineCount}
        totalCount={others.length}
        onOpenSettings={() => setModal({ kind: "settings" })}
      />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">
        {others.length === 0 ? (
          <div className="mt-16 text-center text-text-muted">
            <p className="font-display text-lg text-text">No devices paired yet</p>
            <p className="mt-1 text-sm">
              Open Settings to generate a pairing code for your other phones and computers.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {others.map((d) => (
              <DeviceCard
                key={d.deviceId}
                device={d}
                isRinging={ringing.has(d.deviceId)}
                onRing={() => ring(d.deviceId)}
                onStopRing={() => stopRing(d.deviceId)}
                onMessage={() => setModal({ kind: "message", target: d })}
                onRename={() => setModal({ kind: "rename", target: d })}
                onUnpair={() => unpair(d)}
                selected={selected.has(d.deviceId)}
                onToggleSelect={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(d.deviceId)) next.delete(d.deviceId);
                    else next.add(d.deviceId);
                    return next;
                  })
                }
              />
            ))}
          </div>
        )}

        {others.length > 0 && (
          <div className="sticky bottom-4 mt-6 flex gap-2 rounded-2xl border border-border bg-surface/95 p-3 backdrop-blur">
            {selected.size > 0 ? (
              <>
                <button
                  onClick={() =>
                    Array.from(selected).forEach((id) => ring(id))
                  }
                  className="flex-1 rounded-lg bg-signal px-3 py-2.5 text-sm font-semibold text-bg hover:brightness-110"
                >
                  🔔 Ring {selected.size} selected
                </button>
                <button
                  onClick={() => setModal({ kind: "message", target: "selected" })}
                  className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-surface-hover"
                >
                  📢 Message selected
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setModal({ kind: "confirm-ring-all" })}
                  className="flex-1 rounded-lg bg-signal px-3 py-2.5 text-sm font-semibold text-bg hover:brightness-110"
                >
                  🔔 Ring all
                </button>
                <button
                  onClick={() => setModal({ kind: "message", target: "all" })}
                  className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-surface-hover"
                >
                  📢 Message all
                </button>
              </>
            )}
          </div>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}

      {modal?.kind === "message" && (
        <MessageComposer
          targetLabel={
            modal.target === "all"
              ? "all devices"
              : modal.target === "selected"
              ? `${selected.size} devices`
              : modal.target.deviceName
          }
          onSend={(msg) => sendMessage(modal.target, msg)}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.kind === "confirm-ring-all" && (
        <ConfirmDialog
          title="Ring all devices?"
          body={`This will ring ${onlineCount} online device${onlineCount === 1 ? "" : "s"} for up to 30 seconds each.`}
          confirmLabel="Ring all"
          onConfirm={ringAll}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.kind === "settings" && (
        <SettingsPanel
          session={session}
          isAdmin={isAdmin}
          onClose={() => setModal(null)}
          onSignOut={() => setSession(null)}
        />
      )}

      {modal?.kind === "rename" && (
        <RenamePrompt
          device={modal.target}
          onRename={(name) => rename(modal.target, name)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function RenamePrompt({
  device,
  onRename,
  onClose,
}: {
  device: DeviceRecord;
  onRename: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(device.deviceName);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-lg font-semibold">Rename device</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="mt-3 w-full rounded-lg border border-border bg-bg p-2.5 text-sm focus:border-signal/60 focus:outline-none"
        />
        <div className="mt-3 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            onClick={() => name.trim() && onRename(name.trim())}
            className="flex-1 rounded-lg bg-signal px-3 py-2 text-sm font-semibold text-bg hover:brightness-110"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
