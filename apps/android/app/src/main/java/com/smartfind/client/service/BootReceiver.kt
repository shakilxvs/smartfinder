package com.smartfind.client.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.smartfind.client.net.SecureStore

/**
 * Android does not keep foreground services running across a reboot. This
 * receiver restarts SmartFindConnectionService only if the device was
 * already paired, so the "find my device" capability survives a router or
 * phone restart without requiring the user to reopen the app - part of
 * requirement #18 (handle server/device restarts gracefully).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val store = SecureStore(context)
        if (store.isPaired()) {
            SmartFindConnectionService.start(context)
        }
    }
}
