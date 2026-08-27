import http from "http";
import os from "os";
import { DEFAULTS } from "@smartfind/protocol";
import { DeviceStore } from "./store";
import { Hub } from "./hub";
import { buildApi } from "./api";
import { startDiscovery } from "./discovery";
import { startUdpDiscoveryBeacon } from "./udpDiscovery";
import { logger } from "@smartfind/shared";
import type { Request, Response } from "express";

const PORT = Number(process.env.PORT) || DEFAULTS.DEFAULT_SERVER_PORT;
const SERVER_NAME = process.env.SMARTFIND_SERVER_NAME || `SmartFind (${os.hostname()})`;

const store = new DeviceStore();
const server = http.createServer();
const hub = new Hub(store, server);
const app = buildApi(store, hub, SERVER_NAME);

// Server-sent events stream so the dashboard can show live
// sending -> delivered -> executing -> completed/failed/timed_out status
// without polling. This is a thin, read-only channel; commands still go
// through the authenticated REST endpoints in api.ts.
app.get("/api/status-stream", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("\n");

  const onUpdate = (update: unknown) => {
    res.write(`data: ${JSON.stringify(update)}\n\n`);
  };
  hub.onStatusUpdate(onUpdate);

  const keepAlive = setInterval(() => res.write(": ping\n\n"), 20_000);
  req.on("close", () => clearInterval(keepAlive));
});

server.on("request", app);

server.listen(PORT, () => {
  logger.info(`SmartFind server listening on http://0.0.0.0:${PORT}`, {
    ws: `ws://0.0.0.0:${PORT}/ws`,
  });
  logger.info(`Server name: ${SERVER_NAME}`);

  const mdns = startDiscovery(PORT, SERVER_NAME);
  const udp = startUdpDiscoveryBeacon(PORT, SERVER_NAME);

  const shutdown = async () => {
    logger.info("Shutting down...");
    await mdns.stop();
    udp.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 3000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
});
