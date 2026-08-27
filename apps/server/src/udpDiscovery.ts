import dgram from "dgram";
import { logger } from "@smartfind/shared";

const DISCOVERY_PORT = 53177;
const REQUEST_MAGIC = "SMARTFIND_DISCOVER";
const RESPONSE_MAGIC = "SMARTFIND_HERE";

/**
 * Some home routers/APs block mDNS multicast between client isolation zones
 * or guest networks. As a fallback (requirement #6/#19), clients can
 * broadcast a UDP packet on the local subnet and the server replies with its
 * own address + port so onboarding still works without typing an IP.
 * If this also fails (e.g. full client isolation), the dashboard falls back
 * to manual "Enter Server Address" entry - see docs/protocol.md.
 */
export function startUdpDiscoveryBeacon(httpPort: number, serverName: string) {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

  socket.on("message", (msg, rinfo) => {
    if (msg.toString() !== REQUEST_MAGIC) return;
    const payload = JSON.stringify({
      magic: RESPONSE_MAGIC,
      serverName,
      port: httpPort,
    });
    socket.send(payload, rinfo.port, rinfo.address, (err) => {
      if (err) logger.warn("UDP discovery reply failed", { err: String(err) });
    });
  });

  socket.on("error", (err) => {
    logger.warn("UDP discovery socket error (non-fatal, mDNS still active)", { err: String(err) });
  });

  socket.bind(DISCOVERY_PORT, () => {
    socket.setBroadcast(true);
    logger.info(`UDP discovery fallback listening on port ${DISCOVERY_PORT}`);
  });

  return { stop: () => socket.close() };
}
