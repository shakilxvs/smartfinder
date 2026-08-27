import Foundation
import UIKit
import Combine

/// Connection state exposed to the UI, including an honest "backgroundLimited"
/// state so the interface can tell the user the truth instead of implying a
/// guarantee iOS does not make.
enum ConnectionState {
    case disconnected
    case connecting
    case online
    case backgroundLimited // app is backgrounded; socket may already be suspended by iOS
}

/// This class is the entire honest story of "Find My iPhone-style ringing on
/// iOS, built by a third party app." Read this comment before changing
/// anything here.
///
/// WHAT WORKS RELIABLY:
///  - While SmartFind is in the foreground, this maintains a live WebSocket
///    to the local server exactly like the Android client, and RING/MESSAGE
///    commands arrive and display immediately.
///  - For a short grace window after backgrounding (iOS gives an app roughly
///    30 seconds via a UIBackgroundTask, occasionally longer opportunistically),
///    the socket can still receive one more command.
///
/// WHAT DOES NOT WORK, AND CANNOT BE MADE TO WORK WITHOUT APPLE'S OWN PUSH
/// INFRASTRUCTURE:
///  - A backgrounded or locked iPhone cannot keep an arbitrary TCP/WebSocket
///    connection alive indefinitely. iOS suspends network sockets for
///    backgrounded apps to save battery; this is enforced by the OS kernel,
///    not something any app-level trick, "keep alive" library, or background
///    fetch scheduling can reliably defeat. Background App Refresh, silent
///    push, and BGTaskScheduler all give *occasional, OS-scheduled* wake
///    windows measured in minutes-to-hours, not an always-on channel.
///  - The only Apple-sanctioned way to reliably reach a backgrounded/locked
///    iPhone on demand is Apple Push Notification service (APNs). That
///    requires: your own Apple Developer Program membership, your own APNs
///    auth key, and your SmartFind server calling out to Apple's cloud
///    (api.push.apple.com) to request delivery - a real, non-optional cloud
///    dependency for this one feature, unlike the rest of SmartFind's
///    local-only design. This client ships with a stubbed APNs registration
///    path (see registerForRemoteNotificationsIfConfigured) that does
///    nothing until you supply your own APNs credentials server-side -
///    see docs/ios-limitations.md for the exact setup.
///  - Full-Screen Alarm-style takeover of a locked screen additionally
///    requires the "Critical Alerts" or "Time Sensitive Notifications"
///    entitlement, which Apple grants only for specific approved use cases
///    on a case-by-case review. We request the standard, always-available
///    "Time Sensitive" interruption level, which surfaces the alert more
///    prominently than a normal notification but does NOT bypass Silent
///    Mode/Focus the way Android's alarm stream does, and does not turn the
///    screen on by itself.
final class ConnectionManager: NSObject, ObservableObject {

    @Published var state: ConnectionState = .disconnected
    @Published var activeRing: (requestId: String, durationMs: Double)?
    @Published var activeMessage: (requestId: String, text: String)?

    private var task: URLSessionWebSocketTask?
    private var session: URLSession!
    private var reconnectAttempt = 0
    private var reconnectTimer: Timer?
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

    override init() {
        super.init()
        session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        NotificationCenter.default.addObserver(
            self, selector: #selector(appDidEnterBackground),
            name: UIApplication.didEnterBackgroundNotification, object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(appWillEnterForeground),
            name: UIApplication.willEnterForegroundNotification, object: nil
        )
    }

    func resumeIfPaired() {
        guard KeychainStore.shared.isPaired else { return }
        connect()
    }

    func connect() {
        guard
            let serverAddress = KeychainStore.shared.serverAddress,
            let deviceId = KeychainStore.shared.deviceId,
            let token = KeychainStore.shared.token,
            let wsURL = wsURL(from: serverAddress)
        else { return }

        state = .connecting
        let socketTask = session.webSocketTask(with: wsURL)
        task = socketTask
        socketTask.resume()
        send(ProtocolCodec.hello(deviceId: deviceId, token: token))
        listen()
        startHeartbeatLoop(batteryPercent: currentBatteryPercent(), charging: isCharging())
    }

    private func wsURL(from httpAddress: String) -> URL? {
        guard var components = URLComponents(string: httpAddress) else { return nil }
        components.scheme = components.scheme == "https" ? "wss" : "ws"
        components.path = "/ws"
        return components.url
    }

    private func listen() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure:
                self.scheduleReconnect()
            case .success(let message):
                if case .string(let text) = message, let data = text.data(using: .utf8) {
                    self.handle(data)
                }
                self.listen() // keep receiving
            }
        }
    }

    private func handle(_ data: Data) {
        guard let parsed = ProtocolCodec.parse(data) else { return }
        switch parsed {
        case .welcome:
            DispatchQueue.main.async {
                self.state = .online
                self.reconnectAttempt = 0
            }
        case .command(let command):
            handleCommand(command)
        case .error, .deviceList, .statusUpdate:
            break
        }
    }

    private func handleCommand(_ command: IncomingCommand) {
        switch command {
        case .ring(let requestId, _, let durationMs):
            send(ProtocolCodec.ack(requestId: requestId, status: .executing))
            DispatchQueue.main.async { self.activeRing = (requestId, durationMs) }
            send(ProtocolCodec.ack(requestId: requestId, status: .completed))
        case .stopRing:
            DispatchQueue.main.async { self.activeRing = nil }
        case .message(let requestId, _, let text):
            send(ProtocolCodec.ack(requestId: requestId, status: .executing))
            DispatchQueue.main.async { self.activeMessage = (requestId, text) }
            send(ProtocolCodec.ack(requestId: requestId, status: .completed))
        case .ping(let requestId):
            send(ProtocolCodec.ack(requestId: requestId, status: .completed))
        }
    }

    private func send(_ text: String) {
        task?.send(.string(text)) { _ in }
    }

    private func startHeartbeatLoop(batteryPercent: Int?, charging: Bool?) {
        UIDevice.current.isBatteryMonitoringEnabled = true
        Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] timer in
            guard let self, self.task != nil else { timer.invalidate(); return }
            self.send(ProtocolCodec.heartbeat(
                batteryPercent: self.currentBatteryPercent(),
                charging: self.isCharging()
            ))
        }
    }

    private func currentBatteryPercent() -> Int? {
        let level = UIDevice.current.batteryLevel
        return level < 0 ? nil : Int(level * 100)
    }

    private func isCharging() -> Bool {
        UIDevice.current.batteryState == .charging || UIDevice.current.batteryState == .full
    }

    private func scheduleReconnect() {
        DispatchQueue.main.async {
            self.state = UIApplication.shared.applicationState == .active ? .connecting : .backgroundLimited
        }
        let delay = min(pow(2.0, Double(reconnectAttempt)), 30.0)
        reconnectAttempt += 1
        reconnectTimer?.invalidate()
        reconnectTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            self?.connect()
        }
    }

    // MARK: - App lifecycle: the honest boundary

    @objc private func appDidEnterBackground() {
        // iOS grants a short extra-time window via UIBackgroundTask; we use
        // it to let any in-flight ack finish sending, NOT to pretend we can
        // stay connected indefinitely.
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "smartfind-drain") { [weak self] in
            self?.endBackgroundTask()
        }
        state = .backgroundLimited
        DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in
            self?.endBackgroundTask()
        }
    }

    @objc private func appWillEnterForeground() {
        endBackgroundTask()
        connect()
    }

    private func endBackgroundTask() {
        if backgroundTask != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTask)
            backgroundTask = .invalid
        }
    }

    // MARK: - Optional APNs path (inert until you configure your own server-side push)

    /// Calling this only requests standard, non-critical notification
    /// permission and registers for remote notifications. It does nothing
    /// useful until you (a) enroll in the Apple Developer Program, (b) add
    /// your APNs auth key to the SmartFind server, and (c) extend the
    /// server to call Apple's push API when a device is offline. See
    /// docs/ios-limitations.md for what that additional work involves -
    /// it is real work, not a checkbox, and it is the one place in
    /// SmartFind's architecture where a cloud dependency becomes necessary.
    func registerForRemoteNotificationsIfConfigured() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }
}

import UserNotifications

extension ConnectionManager: URLSessionWebSocketDelegate {
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                     didOpenWithProtocol protocol: String?) {
        // no-op; welcome message from the server is the real confirmation
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                     didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        scheduleReconnect()
    }
}
