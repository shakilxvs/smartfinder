import Foundation
import Network

/// Uses Apple's Network framework (NWBrowser) to find the SmartFind server
/// via the same "_smartfind._tcp" Bonjour service the Node server advertises.
/// Note: as of iOS 14+, local network discovery requires the user to grant
/// the "Local Network" permission when prompted (Info.plist
/// NSLocalNetworkUsageDescription + NSBonjourServices) - this is an Apple
/// privacy control, not something SmartFind can skip, and the first
/// discovery attempt is what triggers that system prompt.
final class BonjourDiscovery {
    private var browser: NWBrowser?

    func discover(
        onFound: @escaping (_ host: String, _ port: Int, _ name: String) -> Void,
        onTimeout: @escaping () -> Void
    ) {
        let parameters = NWParameters()
        parameters.includePeerToPeer = true
        let descriptor = NWBrowser.Descriptor.bonjour(type: "_smartfind._tcp", domain: nil)
        let browser = NWBrowser(for: descriptor, using: parameters)
        self.browser = browser

        var found = false

        browser.browseResultsChangedHandler = { results, _ in
            guard let first = results.first, !found else { return }
            found = true

            let connection = NWConnection(to: first.endpoint, using: .tcp)
            connection.stateUpdateHandler = { state in
                if case .ready = state {
                    if case let .hostPort(host, port) = connection.currentPath?.remoteEndpoint {
                        onFound("\(host)", Int(port.rawValue), "SmartFind")
                    }
                    connection.cancel()
                    self.stop()
                }
            }
            connection.start(queue: .main)
        }

        browser.start(queue: .main)

        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in
            if !found {
                self?.stop()
                onTimeout()
            }
        }
    }

    func stop() {
        browser?.cancel()
        browser = nil
    }
}
