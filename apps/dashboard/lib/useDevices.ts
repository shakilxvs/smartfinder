"use client";

import { useEffect, useRef, useState } from "react";
import type { DeviceRecord, CommandStatusUpdate } from "@smartfind/protocol";
import { SessionInfo, wsUrl } from "./session";

export type ConnectionState = "connecting" | "online" | "reconnecting" | "offline";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export function useDevices(session: SessionInfo | null) {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [internetAvailable, setInternetAvailable] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, CommandStatusUpdate>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const retryDelay = useRef(RECONNECT_BASE_MS);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const update = () => setInternetAvailable(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const connectRef = useRef<() => void>(() => {});

  function doConnect() {
    if (!session) return;
    setConnectionState((prev) => (prev === "online" ? "reconnecting" : "connecting"));

    const ws = new WebSocket(wsUrl(session));
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          kind: "hello",
          deviceId: session.deviceId,
          token: session.token,
          deviceInfo: {},
        })
      );
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.kind === "welcome") {
        setConnectionState("online");
        retryDelay.current = RECONNECT_BASE_MS; // reset backoff on success
      } else if (msg.kind === "device_list") {
        setDevices(msg.devices);
      } else if (msg.kind === "status_update") {
        setStatuses((prev) => ({ ...prev, [msg.update.requestId]: msg.update }));
      }
    };

    ws.onclose = () => {
      setConnectionState("reconnecting");
      // Exponential backoff, requirement #18: never hammer the network.
      retryTimer.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, RECONNECT_MAX_MS);
        connectRef.current();
      }, retryDelay.current);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  useEffect(() => {
    connectRef.current = doConnect;
  });

  useEffect(() => {
    connectRef.current();
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      wsRef.current?.close();
    };
  }, [session]);

  // Subscribe to server-sent-events for status updates too, since a command
  // the *dashboard itself* issued via REST won't come back over its own
  // WebSocket (that channel is for commands targeting this device).
  useEffect(() => {
    if (!session) return;
    const es = new EventSource(`${session.serverAddress}/api/status-stream`);
    es.onmessage = (ev) => {
      try {
        const update: CommandStatusUpdate = JSON.parse(ev.data);
        setStatuses((prev) => ({ ...prev, [update.requestId]: update }));
      } catch {
        // ignore keep-alive comments
      }
    };
    return () => es.close();
  }, [session?.serverAddress]);

  return { devices, connectionState, internetAvailable, statuses };
}
