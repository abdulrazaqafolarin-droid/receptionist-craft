package com.rutex.companion

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Screen reading: the active window's node tree serialized as the
 * brain's grid — front app, clickable controls (C ids), text (W ids),
 * each on a 0-1000 grid. Same shape as the desktop companions so the
 * same reasoning works; the mechanics underneath are touch and nodes,
 * not mouse and pixels. Never includes input values — labels only.
 */
object Screen {
    data class Spot(val id: String, val kind: String, val label: String, val x: Int, val y: Int)

    class Snapshot(val app: String, val w: Int, val h: Int) {
        val controls = mutableListOf<Spot>()
        val texts = mutableListOf<Spot>()

        fun find(id: String): Spot? =
            (controls + texts).firstOrNull { it.id.equals(id, ignoreCase = true) }

        fun describe(): String {
            val sb = StringBuilder()
            sb.appendLine("Front app: $app")
            sb.appendLine("Controls (tap these by id):")
            if (controls.isEmpty()) sb.append("(none found)")
            else controls.forEach { sb.appendLine("${it.id} ${it.kind} @(${it.x},${it.y})" + if (it.label.isNotEmpty()) " \"${it.label}\"" else "") }
            sb.appendLine("Text on screen (id @x,y):")
            if (texts.isEmpty()) sb.append("(no text found)")
            else texts.forEach { sb.appendLine("${it.id} @(${it.x},${it.y}) \"${it.label}\"") }
            return sb.toString()
        }
    }

    fun look(root: AccessibilityNodeInfo?, appName: String, metricsW: Int, metricsH: Int): Snapshot {
        val w = maxOf(1, metricsW)
        val h = maxOf(1, metricsH)
        val snap = Snapshot(appName.take(80), w, h)
        if (root == null) {
            snap.texts.add(Spot("W0", "error", "can't see the screen right now", 500, 500))
            return snap
        }
        var ci = 0
        var ti = 0
        val seen = HashSet<String>()
        val bounds = Rect()
        fun gx(px: Int) = ((px.toDouble() / w) * 1000).toInt().coerceIn(0, 1000)
        fun gy(py: Int) = ((py.toDouble() / h) * 1000).toInt().coerceIn(0, 1000)
        fun walk(node: AccessibilityNodeInfo, depth: Int) {
            if (depth > 8 || ci + ti > 200) return
            // Children first (each recycled after its subtree is read).
            val kids = mutableListOf<AccessibilityNodeInfo>()
            try {
                for (i in 0 until node.childCount) {
                    (try { node.getChild(i) } catch (_: Exception) { null })?.let { kids.add(it) }
                }
            } catch (_: Exception) { }
            try {
                node.getBoundsInScreen(bounds)
                val label = ((node.text ?: node.contentDescription)?.toString() ?: "")
                    .trim().replace(Regex("\\s+"), " ").take(60)
                val cls = (node.className ?: "").toString().substringAfterLast('.')
                val kind = when {
                    cls.contains("Button", true) -> "button"
                    cls.contains("EditText", true) -> "text field"
                    cls.contains("CheckBox", true) -> "checkbox"
                    cls.contains("Switch", true) -> "switch"
                    cls.contains("Spinner", true) -> "spinner"
                    cls.contains("Tab", true) -> "tab"
                    else -> cls.ifEmpty { "view" }
                }
                val visible = bounds.width() > 4 && bounds.height() > 4 &&
                    bounds.left < w && bounds.top < h && bounds.right > 0 && bounds.bottom > 0
                if (visible) {
                    val key = "$label|$kind|${bounds.left}|${bounds.top}"
                    if (seen.add(key)) {
                        val cx = gx(bounds.centerX())
                        val cy = gy(bounds.centerY())
                        if (node.isClickable || node.isLongClickable || node.isEditable || node.isCheckable) {
                            ci++
                            snap.controls.add(Spot("C$ci", kind, label, cx, cy))
                        } else if (label.isNotEmpty()) {
                            ti++
                            snap.texts.add(Spot("W$ti", kind, label, cx, cy))
                        }
                    }
                }
            } catch (_: Exception) {
                // a dead node ends its branch, never the whole read
            }
            kids.forEach { kid -> try { walk(kid, depth + 1) } finally { try { kid.recycle() } catch (_: Exception) { } } }
        }
        try { walk(root, 0) } catch (_: Exception) { }
        return snap
    }
}
