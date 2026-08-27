package com.smartfind.client.ui

import android.os.Bundle
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MessageActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        )

        val message = intent.getStringExtra(EXTRA_MESSAGE) ?: ""

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(64, 220, 64, 64)
            setBackgroundColor(0xFF12151C.toInt())
        }
        val title = TextView(this).apply {
            text = "SmartFind"
            textSize = 20f
            setTextColor(0xFF8993A8.toInt())
        }
        val body = TextView(this).apply {
            text = "\u201C$message\u201D"
            textSize = 26f
            setPadding(0, 32, 0, 0)
            setTextColor(0xFFE7EAF0.toInt())
        }
        val ok = Button(this).apply {
            text = "OK"
            textSize = 18f
            setOnClickListener { finish() }
        }
        root.addView(title)
        root.addView(body)
        root.addView(ok, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 180).apply {
            topMargin = 96
        })
        setContentView(root)
    }

    companion object {
        const val EXTRA_MESSAGE = "message"
    }
}
