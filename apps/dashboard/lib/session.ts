"use client";

// Everything here is stored in the browser's own storage for this origin
// only (not shared with SmartFind's real device clients, which persist
// their token in Android EncryptedSharedPreferences / iOS Keychain - see
// docs/security.md). This is the *dashboard's own* identity as a
// "web" platform device/controller.

export interface SessionInfo {
  serverAddress: string; // e.g. "http://192.168.1.42:8787"
  deviceId: string;
  token: string;
  serverName: string;
}

const KEY = "smartfind.session.v1";

export function loadSession(): SessionInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SessionInfo) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: SessionInfo): void {
  window.localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(KEY);
}

export function wsUrl(session: SessionInfo): string {
  return session.serverAddress.replace(/^http/, "ws") + "/ws";
}

export async function apiFetch(
  session: SessionInfo,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(`${session.serverAddress}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
      "x-device-id": session.deviceId,
      ...(init.headers ?? {}),
    },
  });
}
