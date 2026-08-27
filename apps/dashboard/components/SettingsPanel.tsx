"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { SessionInfo, apiFetch, clearSession } from "@/lib/session";

export function SettingsPanel({
  session,
  isAdmin,
  onClose,
  onSignOut,
}: {
  session: SessionInfo;
  isAdmin: boolean;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generateCode() {
    setError(null);
    const res = await apiFetch(session, "/api/pairing/start", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(
        data.error === "only_admin_can_generate_pairing_codes"
          ? "Only the admin device can generate pairing codes."
          : "Couldn't generate a code."
      );
      return;
    }
    setCode(data.code);
    setExpiresAt(data.expiresAt);
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div>
          <p className="text-text-muted">Server</p>
          <p className="font-mono text-xs">{session.serverAddress}</p>
        </div>

        {isAdmin ? (
          <div>
            <p className="mb-2 text-text-muted">Add a new device</p>
            {code ? (
              <div className="rounded-lg border border-signal/40 bg-signal-dim/20 p-3 text-center">
                <p className="font-mono text-3xl tracking-[0.3em]">{code}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {expiresAt
                    ? `Expires at ${new Date(expiresAt).toLocaleTimeString()}`
                    : "Enter this on the new device within 5 minutes"}
                </p>
              </div>
            ) : (
              <button
                onClick={generateCode}
                className="w-full rounded-lg bg-signal px-3 py-2 text-sm font-semibold text-bg hover:brightness-110"
              >
                Generate pairing code
              </button>
            )}
          </div>
        ) : (
          <p className="text-text-muted">
            Only the admin device can generate pairing codes for new devices.
          </p>
        )}

        {error && <p className="text-danger">❌ {error}</p>}

        <button
          onClick={() => {
            clearSession();
            onSignOut();
          }}
          className="w-full rounded-lg border border-border px-3 py-2 text-text-muted hover:border-danger/50 hover:text-danger"
        >
          Forget this browser
        </button>
      </div>
    </Modal>
  );
}
