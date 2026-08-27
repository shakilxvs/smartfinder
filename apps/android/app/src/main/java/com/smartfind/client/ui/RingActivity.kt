package com.smartfind.client.ui

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.smartfind.client.service.SmartFindConnectionService

/**
 * The on-screen "your device is being located" alert. This deliberately
 * mirrors the Apple Find My / Google Find My Device pattern of a full
 * screen, unmissable alert rather than a quiet notification, because a
 * quiet notification defeats the entire point of a "find my misplaced
 * phone" feature (requirement #23).
 *
 * We do NOT bypass Silent Mode / Do Not Disturb. We use STREAM_ALARM,
 * which is the one stream Android reserves for genuinely time-sensitive
 * alerts (the same stream a phone's built-in alarm clock uses) and which
 * respects the user's own Do Not Disturb "alarms" exception setting rather
 * than a SmartFind-specific override. If the user has DND configured to
 * block alarms too, SmartFind will honestly stay silent - see
 * docs/android.md for exactly which OS settings affect this.
 */
class RingActivity : AppCompatActivity() {

    private var ringtonePlayer: android.media.MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var countdownTimer: CountDownTimer? = null

    private val stopReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            finishRinging()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        )

        setContentView(buildLayout())

        registerReceiver(
            stopReceiver,
            IntentFilter(ACTION_STOP_RING),
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Context.RECEIVER_NOT_EXPORTED else 0
        )

        startAlert()

        val durationMs = intent.getLongExtra(EXTRA_DURATION_MS, 30_000L)
        countdownTimer = object : CountDownTimer(durationMs, 1000) {
            override fun onTick(millisUntilFinished: Long) {}
            override fun onFinish() = finishRinging()
        }.start()
    }

    private fun buildLayout(): LinearLayout {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(64, 200, 64, 64)
            setBackgroundColor(0xFF12151C.toInt())
        }
        val title = TextView(this).apply {
            text = "🔔 SmartFind"
            textSize = 28f
            setTextColor(0xFFE7EAF0.toInt())
        }
        val subtitle = TextView(this).apply {
            text = "Your device is being located"
            textSize = 18f
            setPadding(0, 24, 0, 0)
            setTextColor(0xFF8993A8.toInt())
        }
        val stopButton = Button(this).apply {
            text = "STOP"
            textSize = 20f
            setPadding(0, 64, 0, 0)
            setOnClickListener { finishRinging() }
        }
        root.addView(title)
        root.addView(subtitle)
        root.addView(stopButton, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 200).apply {
            topMargin = 96
        })
        return root
    }

    private fun startAlert() {
        val alarmUri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        ringtonePlayer = android.media.MediaPlayer().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            setDataSource(this@RingActivity, alarmUri)
            isLooping = true
            setOnPreparedListener { it.start() }
            prepareAsync()
        }

        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
        audioManager.setStreamVolume(AudioManager.STREAM_ALARM, maxVolume, 0)

        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        val pattern = longArrayOf(0, 500, 300, 500, 300)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(pattern, 0)
        }
    }

    private fun finishRinging() {
        countdownTimer?.cancel()
        ringtonePlayer?.stop()
        ringtonePlayer?.release()
        ringtonePlayer = null
        vibrator?.cancel()
        finish()
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(stopReceiver)
        } catch (e: IllegalArgumentException) {
            // receiver was never registered (activity destroyed before onCreate finished)
        }
        ringtonePlayer?.release()
        vibrator?.cancel()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_DURATION_MS = "duration_ms"
        const val ACTION_STOP_RING = "com.smartfind.client.ACTION_STOP_RING"
    }
}
