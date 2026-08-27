"use client";

import { useState } from "react";
import { saveSession } from "@/lib/session";

type Step = "server" | "identify";

const WELL_KNOWN_HOSTS = ["http://smartfind.local:8787"];

export function PairingSetup({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>("server");
  const [serverAddress, setServerAddress] = useState("");
  const [serverName, setServerName] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"bootstrap" | "pair">("bootstrap");
  const [deviceName, setDeviceName] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function tryAutoDiscover() {
    setChecking(true);
    setError(null);
    for (const host of WELL_KNOWN_HOSTS) {
      try {
        const res = await fetch(`${host}/api/health`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          const data = await res.json();
          setServerAddress(host);
          setServerName(data.serverName);
          setChecking(false);
          return;
        }
      } catch {
        // try next / fall through to manual entry
      }
    }
    setChecking(false);
    setError(
      "Couldn't find a SmartFind server automatically. This can happen if your router blocks mDNS between devices. Enter the server address shown in the terminal where you ran the server."
    );
  }

  async function checkManualAddress() {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`${serverAddress}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setServerName(data.serverName);
      setStep("identify");
    } catch {
      setError("Couldn't reach that address. Check it's correct and the server is running.");
    } finally {
      setChecking(false);
    }
  }

  async function submitIdentify() {
    setSubmitting(true);
    setError(null);
    try {
      const path = mode === "bootstrap" ? "/api/pairing/bootstrap" : "/api/pairing/complete";
      const body =
        mode === "bootstrap"
          ? { deviceName, platform: "web" }
          : { code, deviceName, platform: "web" };
      const res = await fetch(`${serverAddress}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "unknown_error");
      saveSession({
        serverAddress,
        deviceId: data.deviceId,
        token: data.token,
        serverName: data.serverName,
      });
      onComplete();
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown_error";
      setError(
        message === "admin_already_exists"
          ? "This server already has an admin. Ask them to generate a pairing code for you instead."
          : message === "invalid_or_expired_code"
          ? "That pairing code is invalid or has expired. Ask for a new one."
          : "Couldn't complete setup. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">SmartFind</p>
        <h1 className="mt-1 font-display text-2xl font-semibold">
          {step === "server" ? "Find your home server" : "Set up this browser"}
        </h1>

        {step === "server" && (
          <div className="mt-6 space-y-3">
            <button
              onClick={tryAutoDiscover}
              disabled={checking}
              className="w-full rounded-lg bg-signal px-4 py-2.5 text-sm font-semibold text-bg transition hover:brightness-110 disabled:opacity-50"
            >
              {checking ? "Looking on your network…" : "Auto-detect server"}
            </button>

            {serverName && (
              <div className="rounded-lg border border-signal/40 bg-signal-dim/20 p-3 text-sm">
                Found <strong>{serverName}</strong> at{" "}
                <span className="font-mono text-xs">{serverAddress}</span>
                <button
                  onClick={() => setStep("identify")}
                  className="mt-2 block w-full rounded-lg bg-signal px-3 py-2 text-sm font-semibold text-bg hover:brightness-110"
                >
                  Continue
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 py-1 text-xs text-text-muted">
              <div className="h-px flex-1 bg-border" />
              or enter manually
              <div className="h-px flex-1 bg-border" />
            </div>

            <input
              value={serverAddress}
              onChange={(e) => setServerAddress(e.target.value)}
              placeholder="http://192.168.1.42:8787"
              className="w-full rounded-lg border border-border bg-surface p-2.5 font-mono text-sm placeholder:text-text-muted focus:border-signal/60 focus:outline-none"
            />
            <button
              onClick={checkManualAddress}
              disabled={!serverAddress || checking}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
            >
              Connect
            </button>
          </div>
        )}

        {step === "identify" && (
          <div className="mt-6 space-y-3">
            <div className="flex rounded-lg border border-border p-1 text-sm">
              <button
                onClick={() => setMode("bootstrap")}
                className={`flex-1 rounded-md py-1.5 ${
                  mode === "bootstrap" ? "bg-signal text-bg font-semibold" : "text-text-muted"
                }`}
              >
                First device
              </button>
              <button
                onClick={() => setMode("pair")}
                className={`flex-1 rounded-md py-1.5 ${
                  mode === "pair" ? "bg-signal text-bg font-semibold" : "text-text-muted"
                }`}
              >
                I have a code
              </button>
            </div>

            <input
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="Name this browser (e.g. Kitchen iPad)"
              className="w-full rounded-lg border border-border bg-surface p-2.5 text-sm placeholder:text-text-muted focus:border-signal/60 focus:outline-none"
            />

            {mode === "pair" && (
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit pairing code"
                className="w-full rounded-lg border border-border bg-surface p-2.5 font-mono text-sm tracking-widest placeholder:text-text-muted focus:border-signal/60 focus:outline-none"
              />
            )}

            <button
              onClick={submitIdentify}
              disabled={submitting || !deviceName || (mode === "pair" && code.length !== 6)}
              className="w-full rounded-lg bg-signal px-4 py-2.5 text-sm font-semibold text-bg transition hover:brightness-110 disabled:opacity-50"
            >
              {submitting ? "Setting up…" : "Finish setup"}
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-danger">❌ {error}</p>}
      </div>
    </div>
  );
}
