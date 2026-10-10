package com.rutex.companion

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * The wire to the platform. Plain HttpURLConnection, org.json (both
 * bundled) — zero dependencies. Every call carries the device secret;
 * the server answers 403 to anything else.
 */
class Link(private val base: String) {
    var secret: String = ""

    data class Cmd(val id: String, val tool: String, val args: Map<String, Any?>)

    private fun post(body: JSONObject): JSONObject? {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL("$base/functions/v1/companion-link").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 20000
                readTimeout = 60000
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Authorization", "Bearer $secret")
                doOutput = true
            }
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            if (conn.responseCode != 200) return null
            JSONObject(conn.inputStream.use { it.readBytes().toString(Charsets.UTF_8) })
        } catch (_: Exception) {
            null
        } finally {
            try { conn?.disconnect() } catch (_: Exception) { }
        }
    }

    fun heartbeat() {
        post(JSONObject().put("action", "heartbeat"))
    }

    fun poll(): Cmd? {
        val res = post(JSONObject().put("action", "poll")) ?: return null
        if (!res.has("command") || res.isNull("command")) return null
        val c = res.getJSONObject("command")
        val argsJson = if (c.has("args") && !c.isNull("args")) c.getJSONObject("args") else JSONObject()
        val args = mutableMapOf<String, Any?>()
        val keys = argsJson.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            args[k] = if (argsJson.isNull(k)) null else argsJson.get(k)
        }
        return Cmd(c.getString("id"), c.getString("tool"), args)
    }

    fun complete(id: String, ok: Boolean, result: Map<String, Any?>?, error: String?) {
        val body = JSONObject()
            .put("action", "complete")
            .put("command_id", id)
            .put("ok", ok)
        if (result != null) body.put("result", JSONObject(result))
        if (error != null) body.put("error", error.take(500))
        post(body)
    }
}
