package com.smartfind.client.net

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * The pairing token is the local-network equivalent of a password: anyone
 * who has it can command this device. We store it in Android's
 * EncryptedSharedPreferences (backed by the Android Keystore) rather than
 * plain SharedPreferences, so a rooted-device file read or a backup
 * extraction doesn't trivially leak it. See docs/security.md.
 */
class SecureStore(context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "smartfind_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var serverAddress: String?
        get() = prefs.getString(KEY_SERVER, null)
        set(value) = prefs.edit().putString(KEY_SERVER, value).apply()

    var deviceId: String?
        get() = prefs.getString(KEY_DEVICE_ID, null)
        set(value) = prefs.edit().putString(KEY_DEVICE_ID, value).apply()

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_TOKEN, value).apply()

    var deviceName: String?
        get() = prefs.getString(KEY_DEVICE_NAME, null)
        set(value) = prefs.edit().putString(KEY_DEVICE_NAME, value).apply()

    fun isPaired(): Boolean = deviceId != null && token != null && serverAddress != null

    fun clear() = prefs.edit().clear().apply()

    companion object {
        private const val KEY_SERVER = "server_address"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_TOKEN = "token"
        private const val KEY_DEVICE_NAME = "device_name"
    }
}
