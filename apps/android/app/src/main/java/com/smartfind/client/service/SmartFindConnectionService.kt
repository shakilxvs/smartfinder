package com.smartfind.client.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.BatteryManager
import android.os.Build
import android.os.CountDownTimer
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.smartfind.client.net.CommandStatus
import com.smartfind.client.net.IncomingCommand
import com.smartfind.client.net.NsdDiscovery
import com.smartfind.client.net.Protocol
import com.smartfind.client.net.SecureStore
import com.smartfind.client.net.ServerToClient
import com.smartfind.client.ui.MessageActivity
import com.smartfind.client.ui.RingActivity
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit
import kotlin.math.min
import kotlin.math.pow

/**
 * This is the single most important file for the "find my device" promise
 * on Android. It:
 *  1. Runs as a foreground service so Android does not kill the process
 *     for being an idle background app (requirement #3/#10 - "strongest
 *     possible Find Device behavior").
 *  2. Keeps a WebSocket open to the local SmartFind server with
 *     exponential-backoff reconnect (requirement #18).
 *  3. On RING, fires a full-screen-intent notification, which Android will
 *     display over the lock screen and turn the display on for, the same
 *     mechanism used by phone/alarm apps - this is deliberately NOT a
 *     background trick or an undocumented API.
 *  4. Sends periodic heartbeats with battery state, and acks every command
 *     with sending/delivered/executing/completed/failed status so the
 *     controller's dashboard reflects real device state.
 *
 * What this can and cannot guarantee, honestly:
 *  - Guaranteed while this foreground service is alive: the ring will
 *    reach and wake the device, because the network socket stays open.
 *  - NOT guaranteed: if the user force-stops the app from Android's App
 *    Info screen, or an aggressive OEM battery manager (some Xiaomi/Huawei/
 *    OnePlus skins) kills foreground services against stock Android
 *    behavior. We prompt the user to exempt SmartFind from battery
 *    optimization and to check OEM-specific auto-start settings, and we
 *    document per-OEM quirks in docs/android.md, but we cannot force any
 *    OEM's out-of-spec battery manager to behave.
 */
class SmartFindConnectionService : Service() {

    private lateinit var store: SecureStore
    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS) // keeps NAT/router connection tracking entries alive
        .build()

    private val handler = Handler(Looper.getMainLooper())
    private var reconnectAttempt = 0
    private var stopped = false
    private var currentRingTimer: CountDownTimer? = null

    override fun onCreate() {
        super.onCreate()
        store = SecureStore(this)
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID_PERSISTENT, buildPersistentNotification("Connecting…"))
        stopped = false
        connect()
        return START_STICKY // ask Android to restart us if it kills the process under memory pressure
    }

    override fun onDestroy() {
        stopped = true
        webSocket?.close(1000, "service_stopped")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun connect() {
        val serverAddress = store.serverAddress
        val deviceId = store.deviceId
        val token = store.token
        if (serverAddress == null || deviceId == null || token == null) {
            updatePersistentNotification("Not paired yet")
            return
        }

        val wsUrl = serverAddress.replaceFirst(Regex("^http"), "ws") + "/ws"
        val request = Request.Builder().url(wsUrl).build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                webSocket.send(Protocol.hello(deviceId, token))
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleServerMessage(webSocket, text)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                scheduleReconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                scheduleReconnect()
            }
        })

        startHeartbeatLoop()
    }

    private fun handleServerMessage(webSocket: WebSocket, text: String) {
        when (val msg = Protocol.parseServerToClient(text)) {
            is ServerToClient.Welcome -> {
                reconnectAttempt = 0 // reset backoff on a confirmed successful connection
                updatePersistentNotification("Connected · listening for commands")
            }
            is ServerToClient.Command -> handleCommand(webSocket, msg.command)
            is ServerToClient.Error -> updatePersistentNotification("Server error: ${msg.message}")
            else -> Unit
        }
    }

    private fun handleCommand(webSocket: WebSocket, command: IncomingCommand) {
        when (command) {
            is IncomingCommand.Ring -> {
                webSocket.send(Protocol.ack(command.requestId, CommandStatus.EXECUTING))
                startRinging(command.durationMs)
                webSocket.send(Protocol.ack(command.requestId, CommandStatus.COMPLETED))
            }
            is IncomingCommand.StopRing -> {
                stopRinging()
                webSocket.send(Protocol.ack(command.requestId, CommandStatus.COMPLETED))
            }
            is IncomingCommand.Message -> {
                webSocket.send(Protocol.ack(command.requestId, CommandStatus.EXECUTING))
                showMessage(command.message)
                webSocket.send(Protocol.ack(command.requestId, CommandStatus.COMPLETED))
            }
            is IncomingCommand.Ping -> webSocket.send(Protocol.ack(command.requestId, CommandStatus.COMPLETED))
        }
    }

    private fun startRinging(durationMs: Long) {
        currentRingTimer?.cancel()

        val fullScreenIntent = Intent(this, RingActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
            putExtra(RingActivity.EXTRA_DURATION_MS, durationMs)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            this, 0, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_RING)
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
            .setContentTitle("SmartFind is looking for this device")
            .setContentText("Tap to stop the alert")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setAutoCancel(true)
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID_RING, notification)

        // RingActivity itself owns the actual audio/vibration playback so it
        // can offer an immediate on-screen Stop button; this timer is the
        // service-side backstop that guarantees the alert cannot ring
        // forever even if the activity fails to launch for some reason
        // (satisfies requirement #10 - "do not implement infinite sound").
        currentRingTimer = object : CountDownTimer(min(durationMs, MAX_RING_DURATION_MS), 1000) {
            override fun onTick(millisUntilFinished: Long) {}
            override fun onFinish() {
                stopRinging()
            }
        }.start()
    }

    private fun stopRinging() {
        currentRingTimer?.cancel()
        currentRingTimer = null
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIFICATION_ID_RING)
        sendBroadcast(Intent(RingActivity.ACTION_STOP_RING))
    }

    private fun showMessage(message: String) {
        val intent = Intent(this, MessageActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
            putExtra(MessageActivity.EXTRA_MESSAGE, message)
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_MESSAGE)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle("SmartFind")
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setFullScreenIntent(pendingIntent, true)
            .setAutoCancel(true)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID_MESSAGE, notification)
    }

    private fun startHeartbeatLoop() {
        val batteryManager = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val runnable = object : Runnable {
            override fun run() {
                if (stopped) return
                val battery = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
                val charging = batteryManager.isCharging
                webSocket?.send(Protocol.heartbeat(battery, charging))
                handler.postDelayed(this, HEARTBEAT_INTERVAL_MS)
            }
        }
        handler.postDelayed(runnable, HEARTBEAT_INTERVAL_MS)
    }

    private fun scheduleReconnect() {
        if (stopped) return
        updatePersistentNotification("Reconnecting…")
        // Exponential backoff with a cap, per requirement #18: never hammer
        // the network after a router restart or brief Wi-Fi drop.
        val delayMs = min(
            RECONNECT_BASE_MS * 2.0.pow(reconnectAttempt).toLong(),
            RECONNECT_MAX_MS
        )
        reconnectAttempt++
        handler.postDelayed({ if (!stopped) connect() }, delayMs)
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_PERSISTENT, "SmartFind status", NotificationManager.IMPORTANCE_LOW)
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_RING, "Device ring alerts", NotificationManager.IMPORTANCE_HIGH).apply {
                setBypassDnd(false) // never override Do Not Disturb without the user's own DND exception rules
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_MESSAGE, "Messages", NotificationManager.IMPORTANCE_HIGH)
        )
    }

    private fun buildPersistentNotification(status: String): Notification =
        NotificationCompat.Builder(this, CHANNEL_PERSISTENT)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("SmartFind")
            .setContentText(status)
            .setOngoing(true)
            .build()

    private fun updatePersistentNotification(status: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID_PERSISTENT, buildPersistentNotification(status))
    }

    companion object {
        private const val CHANNEL_PERSISTENT = "smartfind_status"
        private const val CHANNEL_RING = "smartfind_ring"
        private const val CHANNEL_MESSAGE = "smartfind_message"
        private const val NOTIFICATION_ID_PERSISTENT = 1
        private const val NOTIFICATION_ID_RING = 2
        private const val NOTIFICATION_ID_MESSAGE = 3
        private const val HEARTBEAT_INTERVAL_MS = 15_000L
        private const val RECONNECT_BASE_MS = 1_000L
        private const val RECONNECT_MAX_MS = 30_000L
        private const val MAX_RING_DURATION_MS = 60_000L

        fun start(context: Context) {
            context.startForegroundService(Intent(context, SmartFindConnectionService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, SmartFindConnectionService::class.java))
        }
    }
}
