package com.smartfind.client.net

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.util.Log

/**
 * Discovers a SmartFind server via NSD (Android's mDNS/DNS-SD implementation)
 * matching the "_smartfind._tcp" service type the server advertises via
 * bonjour-service. Multicast is unreliable on many devices with the screen
 * off, so we hold a MulticastLock for the duration of discovery only - not
 * continuously, since that would hurt battery life for no benefit while the
 * connection is already established over a plain TCP/WebSocket link.
 *
 * If this fails (double NAT, client-isolated guest Wi-Fi, or a router that
 * blocks multicast entirely), MainActivity falls back to manual server
 * address entry - see docs/protocol.md §Discovery.
 */
class NsdDiscovery(private val context: Context) {

    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private var multicastLock: WifiManager.MulticastLock? = null
    private var listener: NsdManager.DiscoveryListener? = null

    fun discover(onFound: (host: String, port: Int, serviceName: String) -> Unit, onTimeout: () -> Unit) {
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        multicastLock = wifiManager.createMulticastLock("smartfind-discovery").apply {
            setReferenceCounted(true)
            acquire()
        }

        var found = false

        val resolveListener = object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                Log.w(TAG, "Resolve failed for ${serviceInfo.serviceName}: $errorCode")
            }

            override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                if (found) return
                found = true
                val host = serviceInfo.host?.hostAddress ?: return
                onFound(host, serviceInfo.port, serviceInfo.serviceName)
                stop()
            }
        }

        listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {
                Log.i(TAG, "NSD discovery started for $serviceType")
            }

            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                if (serviceInfo.serviceType.contains("smartfind")) {
                    nsdManager.resolveService(serviceInfo, resolveListener)
                }
            }

            override fun onServiceLost(serviceInfo: NsdServiceInfo) {}
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.w(TAG, "Start discovery failed: $errorCode")
                onTimeout()
            }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
        }

        nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)

        // NSD has no built-in timeout; enforce our own so onboarding never
        // hangs forever on a network that silently drops multicast.
        android.os.Handler(context.mainLooper).postDelayed({
            if (!found) {
                stop()
                onTimeout()
            }
        }, DISCOVERY_TIMEOUT_MS)
    }

    fun stop() {
        listener?.let {
            try {
                nsdManager.stopServiceDiscovery(it)
            } catch (e: IllegalArgumentException) {
                // already stopped; NsdManager throws if you double-stop
            }
        }
        listener = null
        if (multicastLock?.isHeld == true) multicastLock?.release()
        multicastLock = null
    }

    companion object {
        private const val TAG = "SmartFindNsd"
        private const val SERVICE_TYPE = "_smartfind._tcp."
        private const val DISCOVERY_TIMEOUT_MS = 6000L
    }
}
