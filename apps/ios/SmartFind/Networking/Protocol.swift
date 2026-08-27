import Foundation

/// Mirrors packages/protocol/src/index.ts. Swift can't import the shared
/// TypeScript package, so - same as the Android client - this file is the
/// iOS side of a manually-synchronized contract. See docs/protocol.md for
/// the canonical JSON wire shape both sides must agree on.

enum CommandStatus: String, Codable {
    case sending, delivered, executing, completed, failed
    case timedOut = "timed_out"
}

enum IncomingCommand {
    case ring(requestId: String, target: String, durationMs: Double)
    case stopRing(requestId: String, target: String)
    case message(requestId: String, target: String, text: String)
    case ping(requestId: String)
}

enum ServerToClient {
    case welcome(deviceId: String, serverTime: Double)
    case command(IncomingCommand)
    case deviceList(Data)
    case statusUpdate(Data)
    case error(String)
}

enum ProtocolCodec {

    static func parse(_ jsonData: Data) -> ServerToClient? {
        guard
            let obj = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
            let kind = obj["kind"] as? String
        else { return nil }

        switch kind {
        case "welcome":
            guard let deviceId = obj["deviceId"] as? String,
                  let serverTime = obj["serverTime"] as? Double else { return nil }
            return .welcome(deviceId: deviceId, serverTime: serverTime)

        case "command":
            guard let cmd = obj["command"] as? [String: Any],
                  let requestId = cmd["requestId"] as? String,
                  let type = cmd["type"] as? String else { return nil }
            switch type {
            case "RING":
                let target = cmd["target"] as? String ?? ""
                let duration = cmd["durationMs"] as? Double ?? 30_000
                return .command(.ring(requestId: requestId, target: target, durationMs: duration))
            case "STOP_RING":
                let target = cmd["target"] as? String ?? ""
                return .command(.stopRing(requestId: requestId, target: target))
            case "MESSAGE":
                let target = cmd["target"] as? String ?? ""
                let text = cmd["message"] as? String ?? ""
                return .command(.message(requestId: requestId, target: target, text: text))
            case "PING":
                return .command(.ping(requestId: requestId))
            default:
                return nil
            }

        case "device_list": return .deviceList(jsonData)
        case "status_update": return .statusUpdate(jsonData)
        case "error":
            return .error(obj["message"] as? String ?? "unknown_error")
        default:
            return nil
        }
    }

    static func hello(deviceId: String, token: String) -> String {
        let obj: [String: Any] = [
            "kind": "hello", "deviceId": deviceId, "token": token, "deviceInfo": [:],
        ]
        return jsonString(obj)
    }

    static func ack(requestId: String, status: CommandStatus, detail: String? = nil) -> String {
        var obj: [String: Any] = ["kind": "ack", "requestId": requestId, "status": status.rawValue]
        if let detail { obj["detail"] = detail }
        return jsonString(obj)
    }

    static func heartbeat(batteryPercent: Int?, charging: Bool?) -> String {
        var obj: [String: Any] = ["kind": "heartbeat"]
        if let batteryPercent { obj["battery"] = batteryPercent }
        if let charging { obj["charging"] = charging }
        return jsonString(obj)
    }

    private static func jsonString(_ obj: [String: Any]) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: obj)) ?? Data()
        return String(data: data, encoding: .utf8) ?? "{}"
    }
}
