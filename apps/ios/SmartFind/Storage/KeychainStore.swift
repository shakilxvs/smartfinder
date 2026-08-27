import Foundation
import Security

/// Stores the pairing token in the iOS Keychain rather than UserDefaults,
/// for the same reason as the Android EncryptedSharedPreferences choice:
/// the token is equivalent to a local-network password for this device.
/// See docs/security.md.
final class KeychainStore {
    static let shared = KeychainStore()
    private let service = "com.smartfind.client"

    private init() {}

    var serverAddress: String? {
        get { read("serverAddress") }
        set { write("serverAddress", newValue) }
    }
    var deviceId: String? {
        get { read("deviceId") }
        set { write("deviceId", newValue) }
    }
    var token: String? {
        get { read("token") }
        set { write("token", newValue) }
    }
    var deviceName: String? {
        get { read("deviceName") }
        set { write("deviceName", newValue) }
    }

    var isPaired: Bool { deviceId != nil && token != nil && serverAddress != nil }

    func clear() {
        for key in ["serverAddress", "deviceId", "token", "deviceName"] {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: key,
            ]
            SecItemDelete(query as CFDictionary)
        }
    }

    private func read(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func write(_ key: String, _ value: String?) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
        guard let value, let data = value.data(using: .utf8) else { return }
        var newItem = query
        newItem[kSecValueData as String] = data
        SecItemAdd(newItem as CFDictionary, nil)
    }
}
