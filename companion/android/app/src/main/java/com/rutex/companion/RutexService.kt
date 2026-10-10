package com.rutex.companion

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Path
import android.net.Uri
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * The service itself: holds accessibility, runs the poll loop, and
 * performs gestures the node tree cannot (taps, swipes, global keys).
 * Disable it in system settings and everything stops — no residue,
 * no background work, no data leaves the phone except poll traffic.
 */
class RutexService : AccessibilityService() {

    private var running = false
    private var worker: Thread? = null
    private lateinit var link: Link
    private lateinit var hands: Hands

    override fun onServiceConnected() {
        val cfg = Keystore.load(this) ?: return
        link = Link(cfg.url)
        link.secret = cfg.secret
        hands = Hands(this)
        running = true
        worker = Thread({
            var lastBeat = 0L
            while (running) {
                try {
                    if (System.currentTimeMillis() - lastBeat > 60_000) {
                        lastBeat = System.currentTimeMillis()
                        link.heartbeat()
                    }
                    link.poll()?.let { cmd ->
                        val (ok, result, error) = hands.execute(cmd.tool, cmd.args)
                        link.complete(cmd.id, ok, result, error)
                    }
                } catch (_: Exception) {
                    // link errors retry on the next tick, never crash the service
                }
                try { Thread.sleep(2500) } catch (_: InterruptedException) { return@Thread }
            }
        }, "rutex-hands").apply { isDaemon = true; start() }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}

    override fun onUnbind(intent: Intent?): Boolean {
        running = false
        try { worker?.interrupt() } catch (_: Exception) { }
        return super.onUnbind(intent)
    }

    // ---- Screen access ----

    fun root(): AccessibilityNodeInfo? = try {
        rootInActiveWindow
    } catch (_: Exception) { null }

    @Suppress("DEPRECATION")
    fun screenW(): Int = resources.displayMetrics.widthPixels

    @Suppress("DEPRECATION")
    fun screenH(): Int = resources.displayMetrics.heightPixels

    fun frontApp(): String {
        val root = try { rootInActiveWindow } catch (_: Exception) { null } ?: return "unknown"
        return try {
            val pkg = root.packageName?.toString() ?: return "unknown"
            packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
        } catch (_: Exception) { "unknown" } finally {
            try { root.recycle() } catch (_: Exception) { }
        }
    }

    /** Fresh node nearest a grid spot: ids are hints, positions are truth. */
    fun findNode(spot: Screen.Spot): AccessibilityNodeInfo? {
        val root = root() ?: return null
        var best: AccessibilityNodeInfo? = null
        var bestArea = Int.MAX_VALUE
        try {
            val stack = ArrayDeque<AccessibilityNodeInfo>()
            stack.add(root)
            while (stack.isNotEmpty()) {
                val n = stack.removeLast()
                val kids = mutableListOf<AccessibilityNodeInfo>()
                try {
                    for (i in 0 until n.childCount) {
                        (try { n.getChild(i) } catch (_: Exception) { null })?.let { kids.add(it) }
                    }
                    val r = android.graphics.Rect()
                    n.getBoundsInScreen(r)
                    if (r.contains(spot.x, spot.y)) {
                        val area = r.width() * r.height()
                        if (area in 1 until bestArea) {
                            bestArea = area
                            try { best?.recycle() } catch (_: Exception) { }
                            best = AccessibilityNodeInfo.obtain(n)
                        }
                    }
                } catch (_: Exception) { }
                // The popped node is consumed here unless it IS the root
                // (recycled below) — children recycle after their subtrees.
                if (n !== root) {
                    try { n.recycle() } catch (_: Exception) { }
                }
                kids.forEach { stack.add(it) }
            }
        } catch (_: Exception) { }
        try { root.recycle() } catch (_: Exception) { }
        return best
    }

    fun focusedInput(): AccessibilityNodeInfo? = try {
        root()?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
    } catch (_: Exception) { null }

    fun isPassword(node: AccessibilityNodeInfo): Boolean = try {
        node.isPassword
    } catch (_: Exception) { false }

    fun pressImeEnter(node: AccessibilityNodeInfo): Boolean {
        return try {
            val field = AccessibilityNodeInfo::class.java.getField("ACTION_IME_ENTER")
            node.performAction(field.getInt(null))
        } catch (_: Exception) { false }
    }

    // ---- Gestures and keys ----

    private fun gesture(path: Path, durationMs: Long): Boolean {
        if (android.os.Build.VERSION.SDK_INT < 24) return false
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
        val latch = CountDownLatch(1)
        var completed = false
        val ok = dispatchGesture(
            GestureDescription.Builder().addStroke(stroke).build(),
            object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    completed = true
                    latch.countDown()
                }
                override fun onCancelled(gestureDescription: GestureDescription?) {
                    latch.countDown()
                }
            }, null,
        )
        if (!ok) return false
        latch.await(4, TimeUnit.SECONDS)
        return completed
    }

    fun tap(x: Int, y: Int): Boolean {
        if (android.os.Build.VERSION.SDK_INT < 24) return false
        val path = Path().apply { moveTo(x.toFloat(), y.toFloat()) }
        return gesture(path, 50)
    }

    fun swipe(x1: Int, y1: Int, x2: Int, y2: Int, holdMs: Long = 0L): Boolean {
        if (android.os.Build.VERSION.SDK_INT < 24) return false
        val path = Path().apply {
            moveTo(x1.toFloat(), y1.toFloat())
            lineTo(x2.toFloat(), y2.toFloat())
        }
        return gesture(path, 300 + holdMs)
    }

    fun global(action: Int): Boolean = try {
        performGlobalAction(action)
    } catch (_: Exception) { false }

    // ---- Apps and links ----

    fun launchApp(name: String): String? {
        return try {
            val want = name.lowercase()
            val main = Intent(Intent.ACTION_MAIN, null).addCategory(Intent.CATEGORY_LAUNCHER)
            val apps = packageManager.queryIntentActivities(main, 0)
            fun labelOf(info: android.content.pm.ResolveInfo) =
                info.loadLabel(packageManager).toString()
            val hit = apps.firstOrNull { labelOf(it).lowercase() == want }
                ?: apps.firstOrNull { labelOf(it).lowercase().startsWith(want) }
                ?: apps.firstOrNull { labelOf(it).lowercase().contains(want) }
                ?: return null
            val label = labelOf(hit)
            val intent = packageManager.getLaunchIntentForPackage(hit.activityInfo.packageName)
                ?: return null
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
            label
        } catch (_: Exception) { null }
    }

    fun openUrl(url: String): Boolean {
        return try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (intent.resolveActivity(packageManager) == null) return false
            startActivity(intent)
            true
        } catch (_: Exception) { false }
    }

    fun setText(node: AccessibilityNodeInfo, text: String): Boolean {
        return try {
            val bundle = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE_KEY, text)
            }
            node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)
        } catch (_: Exception) { false }
    }

    companion object {
        /** PackageManager for labels without a service instance (unused by hands). */
        @Suppress("unused")
        fun labelFor(pm: PackageManager, pkg: String): String = try {
            pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
        } catch (_: Exception) { pkg }
    }
}
