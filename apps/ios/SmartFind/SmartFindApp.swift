import SwiftUI

/// SmartFind for iOS.
///
/// READ docs/ios-limitations.md before assuming this behaves like the
/// Android client. The short version: everything here works reliably
/// while the app is open or freshly backgrounded. Once iOS fully suspends
/// the app (typically seconds to a couple of minutes after backgrounding,
/// entirely at the OS's discretion) or the device is locked for a while,
/// a plain WebSocket cannot be kept alive - that is an iOS platform
/// restriction, not a bug in this client, and no app (including this one)
/// can route around it without Apple's push infrastructure.
@main
struct SmartFindApp: App {
    @StateObject private var connection = ConnectionManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(connection)
                .onAppear { connection.resumeIfPaired() }
        }
    }
}
