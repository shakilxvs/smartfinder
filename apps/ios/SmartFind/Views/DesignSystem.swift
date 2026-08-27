import SwiftUI

// Same tokens as apps/dashboard/app/globals.css, ported by hand so the
// iOS app doesn't feel like a different product from the web dashboard.
extension Color {
    static let sfBackground = Color(red: 0x12 / 255, green: 0x15 / 255, blue: 0x1C / 255)
    static let sfSurface = Color(red: 0x1B / 255, green: 0x21 / 255, blue: 0x2C / 255)
    static let sfText = Color(red: 0xE7 / 255, green: 0xEA / 255, blue: 0xF0 / 255)
    static let sfTextMuted = Color(red: 0x89 / 255, green: 0x93 / 255, blue: 0xA8 / 255)
    static let sfSignal = Color(red: 0x4C / 255, green: 0xDB / 255, blue: 0xC4 / 255)
    static let sfOffline = Color(red: 0x5B / 255, green: 0x64 / 255, blue: 0x78 / 255)
    static let sfDanger = Color(red: 0xF0 / 255, green: 0x66 / 255, blue: 0x5A / 255)
}

struct SFPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.vertical, 12)
            .foregroundColor(.sfBackground)
            .background(Color.sfSignal.opacity(configuration.isPressed ? 0.8 : 1))
            .cornerRadius(10)
            .fontWeight(.semibold)
    }
}

struct SFSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.vertical, 12)
            .foregroundColor(.sfText)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.sfTextMuted.opacity(0.4)))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

struct SFDestructiveButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.vertical, 10)
            .foregroundColor(.sfDanger)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

struct SFFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(10)
            .background(Color.sfSurface)
            .cornerRadius(8)
            .foregroundColor(.sfText)
    }
}
