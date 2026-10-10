package com.rutex.companion

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/**
 * Setup screen: paste the Supabase URL + device secret once (encrypted
 * at rest), then enable the service in system settings. Shows whether
 * the hands are live. Everything here is explain-and-save — the service
 * does the work, and turning it off there stops it all.
 */
class MainActivity : Activity() {

    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (16 * resources.displayMetrics.density).toInt()

        val urlBox = EditText(this).apply { hint = "Supabase URL  https://<ref>.supabase.co" }
        val secretBox = EditText(this).apply { hint = "Device secret (shown once at pairing)" }
        status = TextView(this).apply { textSize = 14f }

        val save = Button(this).apply { text = "Save and start hands" }
        val openA11y = Button(this).apply { text = "Open accessibility settings" }
        val battery = Button(this).apply { text = "Exempt from battery optimization" }
        val forget = Button(this).apply { text = "Forget this device" }

        val existing = Keystore.load(this)
        if (existing != null) {
            urlBox.setText(existing.url)
            secretBox.setText("••••••••")
        }

        save.setOnClickListener {
            val url = urlBox.text.toString().trim().trimEnd('/')
            var secret = secretBox.text.toString().trim()
            if (secret.startsWith("••")) {
                secret = Keystore.load(this)?.secret ?: ""
            }
            if ((!url.startsWith("http://") && !url.startsWith("https://")) || !secret.startsWith("rcd_")) {
                toast("Need the URL and the rcd_ secret from pairing.")
                return@setOnClickListener
            }
            Keystore.save(this, url, secret)
            toast("Saved. Now enable Rutex Hands in accessibility settings.")
            refresh()
        }
        openA11y.setOnClickListener {
            try {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            } catch (_: Exception) {
                toast("Open Settings > Accessibility yourself.")
            }
        }
        battery.setOnClickListener {
            try {
                val pm = getSystemService(POWER_SERVICE) as PowerManager
                if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                    startActivity(
                        Intent(
                            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            Uri.parse("package:$packageName"),
                        ),
                    )
                } else toast("Already exempt — polls stay on time.")
            } catch (_: Exception) {
                toast("Find it under Settings > Battery yourself.")
            }
        }
        forget.setOnClickListener {
            Keystore.clear(this)
            urlBox.setText("")
            secretBox.setText("")
            toast("Forgotten. Also revoke it in Director > Computers.")
            refresh()
        }

        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            addView(TextView(context).apply {
                text = "Rutex Hands"
                textSize = 22f
            })
            addView(TextView(context).apply {
                text = "Pairs this phone as the Director's hands. It taps, types, and reads the screen — only when you ask, in that moment."
            })
            addView(space())
            addView(urlBox)
            addView(secretBox)
            addView(save)
            addView(space())
            addView(status)
            addView(space())
            addView(openA11y)
            addView(battery)
            addView(forget)
        }
        setContentView(ScrollView(this).apply { addView(col) })
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun space() = TextView(this).apply { text = "" }

    private fun refresh() {
        val on = isServiceOn()
        val paired = Keystore.load(this) != null
        status.text = when {
            !paired -> "Not paired yet — paste the secret above."
            !on -> "Paired, but the service is OFF — enable Rutex Hands in accessibility settings."
            else -> "Hands live. The Director can drive this phone when you ask."
        }
    }

    private fun isServiceOn(): Boolean {
        val am = getSystemService(ACCESSIBILITY_SERVICE) as AccessibilityManager
        return try {
            am.getEnabledAccessibilityServiceList( android.accessibilityservice.AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
                .any { it.resolveInfo.serviceInfo.packageName == packageName }
        } catch (_: Exception) { false }
    }

    private fun toast(msg: String) =
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
}
