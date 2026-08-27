import SwiftUI

struct RootView: View {
    @EnvironmentObject var connection: ConnectionManager
    @State private var isPaired = KeychainStore.shared.isPaired

    var body: some View {
        ZStack {
            Group {
                if isPaired {
                    StatusView(onUnpair: {
                        KeychainStore.shared.clear()
                        isPaired = false
                    })
                } else {
                    PairingView(onPaired: {
                        isPaired = true
                        connection.connect()
                    })
                }
            }

            if let ring = connection.activeRing {
                RingOverlayView(durationMs: ring.durationMs) {
                    connection.activeRing = nil
                }
                .transition(.opacity)
            }

            if let message = connection.activeMessage {
                MessageOverlayView(text: message.text) {
                    connection.activeMessage = nil
                }
                .transition(.opacity)
            }
        }
        .animation(.easeInOut, value: connection.activeRing != nil)
        .animation(.easeInOut, value: connection.activeMessage != nil)
    }
}
