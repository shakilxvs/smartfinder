import SwiftUI
import AVFoundation

/// The in-app ring alert. This only fires reliably while SmartFind is in
/// the foreground - see ConnectionManager's header comment. It plays sound
/// through AVAudioSession's .playback category, which is the one category
/// that can sound even if the iPhone's silent switch is flipped, but it
/// still respects the user's Focus/Do Not Disturb settings, same as any
/// other well-behaved app - SmartFind does not attempt to override Focus.
struct RingOverlayView: View {
    let durationMs: Double
    var onStop: () -> Void

    @State private var player: AVAudioPlayer?
    @State private var remaining: Double

    init(durationMs: Double, onStop: @escaping () -> Void) {
        self.durationMs = durationMs
        self.onStop = onStop
        _remaining = State(initialValue: durationMs / 1000)
    }

    var body: some View {
        VStack(spacing: 24) {
            Text("🔔 SmartFind").font(.title.bold()).foregroundColor(.sfText)
            Text("Your device is being located").foregroundColor(.sfTextMuted)
            Spacer()
            Button("STOP") { stop() }
                .buttonStyle(SFPrimaryButtonStyle())
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 40)
            Spacer().frame(height: 40)
        }
        .padding(.top, 120)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.sfBackground.ignoresSafeArea())
        .onAppear(perform: start)
        .onDisappear { player?.stop() }
    }

    private func start() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, options: [.duckOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            // Non-fatal: if audio session setup fails, the visual full-screen
            // overlay still communicates "your device is being located."
        }

        if let url = Bundle.main.url(forResource: "ring_alert", withExtension: "caf") {
            player = try? AVAudioPlayer(contentsOf: url)
            player?.numberOfLoops = -1
            player?.play()
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + durationMs / 1000) {
            stop()
        }
    }

    private func stop() {
        player?.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        onStop()
    }
}
