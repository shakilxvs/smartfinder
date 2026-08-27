import SwiftUI

struct PairingView: View {
    var onPaired: () -> Void

    @State private var serverAddress = ""
    @State private var deviceName = UIDevice.current.name
    @State private var code = ""
    @State private var status = ""
    @State private var submitting = false
    private let discovery = BonjourDiscovery()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("SmartFind setup")
                    .font(.title2.bold())
                    .foregroundColor(.sfText)

                Button {
                    status = "Searching your Wi-Fi network…"
                    discovery.discover(
                        onFound: { host, port, name in
                            serverAddress = "http://\(host):\(port)"
                            status = "Found \(name)"
                        },
                        onTimeout: {
                            status = "Not found automatically. iOS will ask for Local Network " +
                                "permission the first time — allow it, then try again, or enter " +
                                "the address shown in the server's terminal output below."
                        }
                    )
                } label: {
                    Text("Auto-discover server on Wi-Fi")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SFSecondaryButtonStyle())

                TextField("Server address, e.g. http://192.168.1.42:8787", text: $serverAddress)
                    .textFieldStyle(SFFieldStyle())
                    .keyboardType(.URL)
                    .autocapitalization(.none)

                TextField("Name this device", text: $deviceName)
                    .textFieldStyle(SFFieldStyle())

                TextField("6-digit pairing code (blank if first device)", text: $code)
                    .textFieldStyle(SFFieldStyle())
                    .keyboardType(.numberPad)

                Button {
                    submit()
                } label: {
                    Text(submitting ? "Setting up…" : "Pair")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SFPrimaryButtonStyle())
                .disabled(submitting || serverAddress.isEmpty || deviceName.isEmpty)

                if !status.isEmpty {
                    Text(status)
                        .font(.footnote)
                        .foregroundColor(.sfTextMuted)
                }
            }
            .padding(20)
        }
        .background(Color.sfBackground.ignoresSafeArea())
    }

    private func submit() {
        submitting = true
        let path = code.isEmpty ? "/api/pairing/bootstrap" : "/api/pairing/complete"
        guard let url = URL(string: serverAddress + path) else {
            status = "That doesn't look like a valid address."
            submitting = false
            return
        }
        var body: [String: Any] = [
            "deviceName": deviceName,
            "platform": "ios",
            "model": UIDevice.current.model,
        ]
        if !code.isEmpty { body["code"] = code }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                submitting = false
                guard
                    let data,
                    let http = response as? HTTPURLResponse,
                    let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                else {
                    status = "Couldn't reach that server: \(error?.localizedDescription ?? "unknown error")"
                    return
                }
                guard http.statusCode == 200,
                      let deviceId = json["deviceId"] as? String,
                      let token = json["token"] as? String else {
                    status = "Failed: \(json["error"] as? String ?? "unknown error")"
                    return
                }
                KeychainStore.shared.serverAddress = serverAddress
                KeychainStore.shared.deviceId = deviceId
                KeychainStore.shared.token = token
                KeychainStore.shared.deviceName = deviceName
                onPaired()
            }
        }.resume()
    }
}
