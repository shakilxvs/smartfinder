package com.smartfind.client.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.smartfind.client.net.NsdDiscovery
import com.smartfind.client.net.SecureStore
import com.smartfind.client.service.SmartFindConnectionService
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Onboarding + status screen. Kept intentionally simple (no design-system
 * component library) since the primary UI surface for day-to-day use is the
 * web dashboard; this screen's job is just: get paired, then get out of the
 * way and let the foreground service do its job.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var store: SecureStore
    private val http = OkHttpClient()
    private val bgExecutor = Executors.newSingleThreadExecutor()
    private val json = "application/json".toMediaType()

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* handled via isPaired() re-render on resume */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = SecureStore(this)
        render()
    }

    override fun onResume() {
        super.onResume()
        render()
    }

    private fun render() {
        if (store.isPaired()) {
            setContentView(buildStatusView())
            requestRuntimePermissionsIfNeeded()
            SmartFindConnectionService.start(this)
        } else {
            setContentView(buildOnboardingView())
        }
    }

    // --- Status view (already paired) ---------------------------------

    private fun buildStatusView(): LinearLayout {
        val root = simpleColumn()
        root.addView(label("SmartFind", 22f))
        root.addView(label("Paired as: ${store.deviceName}", 16f))
        root.addView(label("Server: ${store.serverAddress}", 14f))
        root.addView(label(
            "This device will ring or show messages sent from your controller, " +
                "even when locked, as long as this app hasn't been force-stopped and " +
                "battery optimization is disabled for it below.",
            14f
        ))

        val batteryButton = Button(this).apply {
            text = "Disable battery optimization for SmartFind"
            setOnClickListener { requestBatteryOptimizationExemption() }
        }
        val unpairButton = Button(this).apply {
            text = "Unpair this device"
            setOnClickListener {
                SmartFindConnectionService.stop(this@MainActivity)
                store.clear()
                render()
            }
        }
        root.addView(batteryButton)
        root.addView(unpairButton)
        return root
    }

    private fun requestRuntimePermissionsIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                android.content.pm.PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun requestBatteryOptimizationExemption() {
        // This is a user-facing system dialog, never a silent bypass -
        // requirement #25 (no bypassing OS security, no hidden behavior).
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
            val intent = Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:$packageName")
            )
            startActivity(intent)
        } else {
            Toast.makeText(this, "Already exempted", Toast.LENGTH_SHORT).show()
        }
    }

    // --- Onboarding view (not yet paired) ------------------------------

    private fun buildOnboardingView(): LinearLayout {
        val root = simpleColumn()
        root.addView(label("SmartFind setup", 22f))

        val serverField = EditText(this).apply {
            hint = "Server address, e.g. http://192.168.1.42:8787"
        }
        val nameField = EditText(this).apply {
            hint = "Name this device, e.g. Bedroom Android"
        }
        val codeField = EditText(this).apply {
            hint = "6-digit pairing code (leave blank if this is the first device)"
        }
        val statusLabel = label("", 13f)

        val discoverButton = Button(this).apply {
            text = "Auto-discover server on Wi-Fi"
            setOnClickListener {
                statusLabel.text = "Searching…"
                NsdDiscovery(this@MainActivity).discover(
                    onFound = { host, port, name ->
                        runOnUiThread {
                            serverField.setText("http://$host:$port")
                            statusLabel.text = "Found $name"
                        }
                    },
                    onTimeout = {
                        runOnUiThread {
                            statusLabel.text = "Not found automatically — enter the server address " +
                                "shown in the terminal where you started the server."
                        }
                    }
                )
            }
        }

        val pairButton = Button(this).apply {
            text = "Pair"
            setOnClickListener {
                val server = serverField.text.toString().trim().trimEnd('/')
                val name = nameField.text.toString().trim()
                val code = codeField.text.toString().trim()
                if (server.isEmpty() || name.isEmpty()) {
                    Toast.makeText(this@MainActivity, "Server address and device name required", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                statusLabel.text = "Pairing…"
                pair(server, name, code, statusLabel)
            }
        }

        root.addView(discoverButton)
        root.addView(serverField)
        root.addView(nameField)
        root.addView(codeField)
        root.addView(pairButton)
        root.addView(statusLabel)
        return root
    }

    private fun pair(server: String, name: String, code: String, statusLabel: TextView) {
        bgExecutor.execute {
            try {
                val path = if (code.isEmpty()) "/api/pairing/bootstrap" else "/api/pairing/complete"
                val body = JSONObject().apply {
                    put("deviceName", name)
                    put("platform", "android")
                    put("model", Build.MODEL)
                    if (code.isNotEmpty()) put("code", code)
                }
                val request = Request.Builder()
                    .url("$server$path")
                    .post(body.toString().toRequestBody(json))
                    .build()
                http.newCall(request).execute().use { response ->
                    val text = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        runOnUiThread { statusLabel.text = "Failed: $text" }
                        return@execute
                    }
                    val result = JSONObject(text)
                    store.serverAddress = server
                    store.deviceId = result.getString("deviceId")
                    store.token = result.getString("token")
                    store.deviceName = name
                    runOnUiThread { render() }
                }
            } catch (e: Exception) {
                runOnUiThread { statusLabel.text = "Couldn't reach server: ${e.message}" }
            }
        }
    }

    // --- tiny layout helpers (no XML layouts, kept intentionally minimal) ---

    private fun simpleColumn(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(48, 96, 48, 48)
        setBackgroundColor(0xFF12151C.toInt())
    }

    private fun label(text: String, size: Float): TextView = TextView(this).apply {
        this.text = text
        textSize = size
        setTextColor(0xFFE7EAF0.toInt())
        setPadding(0, 24, 0, 8)
    }
}
