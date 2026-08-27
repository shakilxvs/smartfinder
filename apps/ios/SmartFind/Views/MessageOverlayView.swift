import SwiftUI

struct MessageOverlayView: View {
    let text: String
    var onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Text("SmartFind").font(.headline).foregroundColor(.sfTextMuted)
            Text("\u{201C}\(text)\u{201D}")
                .font(.title2)
                .multilineTextAlignment(.center)
                .foregroundColor(.sfText)
                .padding(.horizontal, 24)
            Button("OK") { onDismiss() }
                .buttonStyle(SFPrimaryButtonStyle())
                .frame(maxWidth: 160)
        }
        .padding(.top, 140)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.sfBackground.ignoresSafeArea())
    }
}
