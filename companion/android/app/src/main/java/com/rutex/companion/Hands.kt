package com.rutex.companion

import android.os.Bundle
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Hands — executes one brain command on this phone.
 *
 * Touch and nodes instead of mouse and pixels, same eight tool names:
 * look_at_screen, click, type_text, press_keys, scroll, drag, open_app,
 * open_url. Stale ids fail closed. Password fields refuse. Lock and
 * shutdown have no equivalent here and are refused by name.
 * Result shape matches the desktop companions.
 */
class Hands(private val svc: RutexService) {

    private var snap: Screen.Snapshot? = null

    private fun str(args: Map<String, Any?>, key: String): String =
        (args[key] as? String)?.trim() ?: ""

    private fun num(args: Map<String, Any?>, key: String, fallback: Double = 0.0): Double =
        when (val v = args[key]) {
            is Number -> v.toDouble()
            is String -> v.toDoubleOrNull() ?: fallback
            else -> fallback
        }

    private fun flag(args: Map<String, Any?>, key: String): Boolean = args[key] == true

    private fun spot(args: Map<String, Any?>, idKey: String, xKey: String, yKey: String): Screen.Spot? {
        val s = snap ?: return null
        val id = str(args, idKey)
        if (id.isNotEmpty()) s.find(id)?.let { return it }
        if (args.containsKey(xKey) || args.containsKey(yKey)) {
            val px = (num(args, xKey) / 1000.0 * s.w).toInt()
            val py = (num(args, yKey) / 1000.0 * s.h).toInt()
            return Screen.Spot("", "spot", "", px, py)
        }
        return null
    }

    /** Touch helper: tap at pixels via gesture. Null when unsupported. */
    private fun tapAt(x: Int, y: Int): Boolean = svc.tap(x, y)

    fun execute(tool: String, args: Map<String, Any?>): Triple<Boolean, Map<String, Any?>?, String?> {
        return try {
            when (tool) {
                "look_at_screen" -> ok(mapOf("screen" to look()))
                "click" -> click(args)
                "type_text" -> typeText(args)
                "press_keys" -> pressKeys(args)
                "scroll" -> scroll(args)
                "drag" -> drag(args)
                "open_app" -> openApp(args)
                "open_url" -> openUrl(args)
                else -> fail("unknown tool: $tool")
            }
        } catch (e: Exception) {
            fail(e.message?.lineSequence()?.firstOrNull()?.take(300) ?: "failed")
        }
    }

    private fun ok(result: Map<String, Any?>) = Triple(true, result, null)
    private fun fail(error: String) = Triple(false, null, error)

    private fun look(): String {
        val root = svc.root()
        val s = Screen.look(root, svc.frontApp(), svc.screenW(), svc.screenH())
        try { root?.recycle() } catch (_: Exception) { }
        snap = s
        return s.describe()
    }

    private fun click(args: Map<String, Any?>): Triple<Boolean, Map<String, Any?>?, String?> {
        if (snap == null) return fail("Call look_at_screen first.")
        val target = spot(args, "target_id", "x", "y")
            ?: return fail("Tell me what to tap: a target id from look_at_screen, or x and y.")
        // Prefer a real node click (reliable); fall back to a tap gesture.
        val node = svc.findNode(target)
        val done = try {
            if (node != null) {
                try { node.performAction(AccessibilityNodeInfo.ACTION_CLICK) } catch (_: Exception) { false }
            } else if (target.id.isEmpty()) {
                tapAt(target.x, target.y)
            } else false
        } finally {
            try { node?.recycle() } catch (_: Exception) { }
        }
        if (!done) return fail("Couldn't tap that — it may have moved. Look again?")
        Thread.sleep(400)
        val label = if (target.id.isNotEmpty() && target.kind != "spot") "\"${target.label}\"" else "there"
        val action = if (flag(args, "double")) "Double-tapped" else "Tapped"
        return ok(mapOf("message" to "$action $label.", "screen" to look()))
    }

    private fun typeText(args: Map<String, Any?>): Triple<Boolean, Map<String, Any?>?, String?> {
        val text = str(args, "text")
        if (text.isEmpty()) return fail("Nothing to type.")
        if (snap == null) return fail("Call look_at_screen first.")
        val target = spot(args, "target", "x", "y")
        val node = target?.let { svc.findNode(it) }
            ?: svc.focusedInput()
            ?: return fail("Tap the field first, then tell me what to type.")
        try {
            if (svc.isPassword(node)) {
                return fail("That's a password field. Ask the user to type it themselves.")
            }
            val existing = (node.text?.toString() ?: "")
            val full = (existing + text.take(2000 - existing.length))
            val bundle = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE_KEY, full)
            }
            val accepted = try { node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle) } catch (_: Exception) { false }
            if (!accepted) return fail("That field wouldn't take text.")
            if (flag(args, "press_return")) {
                if (!svc.pressImeEnter(node)) {
                    return ok(mapOf("message" to "Typed it, but couldn't press return — tap send yourself.", "screen" to look()))
                }
                Thread.sleep(600)
                return ok(mapOf("message" to "Typed it and pressed return.", "screen" to look()))
            }
            return ok(mapOf("message" to "Typed it."))
        } finally {
            try { node.recycle() } catch (_: Exception) { }
        }
    }

    private fun pressKeys(args: Map<String, Any?>): Triple<Boolean, Map<String, Any?>?, String?> {
        val keys = str(args, "keys").lowercase()
        if (keys.isEmpty()) return fail("Which keys?")
        if (keys in setOf("lock", "power", "shutdown", "power off")) {
            return fail("I can't lock or power off this phone — that's yours to do.")
        }
        val done = when (keys) {
            "back" -> svc.global(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK)
            "home" -> svc.global(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME)
            "recents", "overview" -> svc.global(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_RECENTS)
            "notifications" -> svc.global(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS)
            "quick_settings", "settings" -> svc.global(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS)
            else -> return fail("Android has no key shortcuts — tell me the button to tap instead.")
        }
        if (!done) return fail("The system ignored that button.")
        Thread.sleep(400)
        return ok(mapOf("message" to "Pressed $keys.", "screen" to look()))
    }

    private fun scroll(args: Map<String, Any?>): Triple<Boolean, Map<String, Any?>?, String?> {
        if (snap == null) return fail("Call look_at_screen first.")
        val dir = str(args, "direction").lowercase()
        if (dir == "left" || dir == "right") {
            return fail("Sideways scroll isn't supported yet — up or down instead?")
        }
        val amount = num(args, "amount", 3.0).toInt().coerceIn(1, 10)
        val s = snap!!
        val spot = spot(args, "target_id", "x", "y")
        val cx = spot?.x ?: s.w / 2
        val cy = spot?.y ?: s.h / 2
        val dist = (s.h * 0.08 * amount).toInt()
        // Content down = finger swipes up; content up = finger swipes down.
        val (y1, y2) = if (dir == "up") cy + dist to cy - dist else cy - dist to cy + dist
        if (!svc.swipe(cx, y1.coerceIn(0, s.h), cx, y2.coerceIn(0, s.h))) {
            return fail("This Android version wouldn't take the gesture.")
        }
        Thread.sleep(400)
        return ok(mapOf("message" to "Scrolled ${if (dir == "up") "up" else "down"}.", "screen" to look()))
    }

    private fun drag(args: Map<String, Any?>): Triple<Boolean, Map<String, Any?>?, String?> {
        if (snap == null) return fail("Call look_at_screen first.")
        fun from(idKey: String, xKey: String, yKey: String): Screen.Spot? = spot(args, idKey, xKey, yKey)
        val a = from("from_id", "from_x", "from_y")
        val b = from("to_id", "to_x", "to_y")
        if (a == null || b == null) return fail("Tell me where to drag from and to (ids or x and y).")
        if (!svc.swipe(a.x, a.y, b.x, b.y, holdMs = 400L)) {
            return fail("This Android version wouldn't take the gesture.")
        }
        Thread.sleep(400)
        return ok(mapOf("message" to "Dragged.", "screen" to look()))
    }

    private fun openApp(args: Map<String, Any?>): Triple<Boolean, Map<String, Any?>?, String?> {
        val name = str(args, "name")
        if (name.isEmpty()) return fail("Which app?")
        if (name.length > 120) return fail("App name too long.")
        val label = svc.launchApp(name) ?: return fail("Couldn't find an app called \"$name\".")
        Thread.sleep(900)
        return ok(mapOf("message" to "Opened $label.", "screen" to look()))
    }

    private fun openUrl(args: Map<String, Any?>): Triple<Boolean, Map<String, Any?>?, String?> {
        var url = str(args, "url")
        if (url.isEmpty()) return fail("Which address?")
        if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://$url"
        if (url.length > 500 || url.any { it.isWhitespace() }) return fail("That address looks wrong.")
        if (!svc.openUrl(url)) return fail("Nothing here opens web addresses.")
        Thread.sleep(1200)
        return ok(mapOf("message" to "Opened $url.", "screen" to look()))
    }
}
