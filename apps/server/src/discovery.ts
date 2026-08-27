import { Bonjour } from "bonjour-service";
import { DEFAULTS } from "@smartfind/protocol";
import { logger } from "@smartfind/shared";

/**
 * Advertises this server on the local network via mDNS/DNS-SD so clients
 * (Android NsdManager, iOS Bonjour/NWBrowser, or a small UDP-based fallback
 * scanner for locked-down routers) can find it automatically instead of
 * requiring the user to type an IP address. See docs/protocol.md §Discovery.
 */
export function startDiscovery(port: number, serverName: string) {
  const bonjour = new Bonjour();
  const service = bonjour.publish({
    name: serverName,
    type: "smartfind",
    protocol: "tcp",
    port,
    txt: { version: "1", path: "/ws" },
  });

  service.on("up", () => {
    logger.info(`mDNS advertisement live: ${DEFAULTS.MDNS_SERVICE_TYPE} on port ${port}`);
  });

  return {
    stop: () =>
      new Promise<void>((resolve) => {
        service.stop(() => {
          bonjour.destroy();
          resolve();
        });
      }),
  };
}
