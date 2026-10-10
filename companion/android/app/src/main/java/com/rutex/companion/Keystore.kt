package com.rutex.companion

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

/**
 * The device secret + URL, encrypted at rest with an AndroidKeyStore
 * AES key (never in code, never in plain prefs, never logged).
 * Zero dependencies — KeyStore + GCM from the platform itself.
 */
object Keystore {
    private const val ALIAS = "rutex-companion"
    private const val PREFS = "rutex-sec"
    private const val KEY_URL = "url_enc"
    private const val KEY_SECRET = "secret_enc"

    data class Config(val url: String, val secret: String)

    private fun key(): java.security.Key {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? java.security.Key)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(false)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return gen.generateKey()
    }

    private fun enc(plain: String): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        val out = c.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(c.iv + out, Base64.NO_WRAP)
    }

    private fun dec(stored: String?): String? {
        if (stored.isNullOrEmpty()) return null
        return try {
            val raw = Base64.decode(stored, Base64.NO_WRAP)
            val iv = raw.copyOfRange(0, 12)
            val ct = raw.copyOfRange(12, raw.size)
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            c.doFinal(ct).toString(Charsets.UTF_8)
        } catch (_: Exception) { null }
    }

    fun save(ctx: Context, url: String, secret: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_URL, enc(url))
            .putString(KEY_SECRET, enc(secret))
            .apply()
    }

    fun load(ctx: Context): Config? {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val url = dec(p.getString(KEY_URL, null))
        val secret = dec(p.getString(KEY_SECRET, null))
        return if (url.isNullOrEmpty() || secret.isNullOrEmpty()) null else Config(url, secret)
    }

    fun clear(ctx: Context) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }
}
