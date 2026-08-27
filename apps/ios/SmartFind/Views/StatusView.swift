import SwiftUI

struct StatusView: View {
    @EnvironmentObject var connection: ConnectionManager
    var onUnpair: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("SmartFind").font(.title2.bold()).foregroundColor(.sfText)
            Text("Paired as \(KeychainStore.shared.deviceName ?? "this device")")
                .foregroundColor(.sfTextMuted)

            HStack(spacing: 8) {
                Circle()
                    .fill(dotColor)
                    .frame(width: 10, height: 10)
                Text(stateLabel)
                    .font(.subheadline)
                    .foregroundColor(.sfTextMuted)
            }

            if connection.state == .backgroundLimited {
                warningBox(
                    "This device can only be reliably reached while SmartFind " +
                    "is open. That's an iOS platform limit, not a bug — see the " +
                    "iOS limitations doc for why, and what would be needed to change it."
                )
            }

            Spacer()

            Button("Unpair this device") {
                onUnpair()
            }
            .buttonStyle(SFDestructiveButtonStyle())
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.sfBackground.ignoresSafeArea())
    }

    private var dotColor: Color {
        switch connection.state {
        case .online: return .sfSignal
        case .connecting: return .sfTextMuted
        case .backgroundLimited: return .sfDanger
        case .disconnected: return .sfOffline
        }
    }

    private var stateLabel: String {
        switch connection.state {
        case .online: return "Connected"
        case .connecting: return "Connecting…"
        case .backgroundLimited: return "Backgrounded — reachability not guaranteed"
        case .disconnected: return "Disconnected"
        }
    }

    private func warningBox(_ text: String) -> some View {
        Text("⚠️ \(text)")
            .font(.footnote)
            .padding(12)
            .background(Color.sfDanger.opacity(0.15))
            .cornerRadius(10)
            .foregroundColor(.sfText)
    }
}
