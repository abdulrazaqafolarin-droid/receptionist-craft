import AppKit
import Foundation

/// Entry point: configure once, then poll forever. Ctrl-C stops
/// everything instantly — there is nothing to uninstall or disable.
@main
struct RutexCompanionMac {
    static func main() async {
        let store = SecretStore()
        var url = store.url
        var secret = store.secret
        if url == nil || secret == nil {
            print("Rutex Companion — first run.")
            print("Supabase URL (https://<ref>.supabase.co): ", terminator: "")
            url = readLine()?.trimmingCharacters(in: .whitespacesAndNewlines)
            print("Device secret (Director > Computers > Pair, shown once): ", terminator: "")
            secret = readLine()?.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let u = url, !u.isEmpty, let s = secret, s.hasPrefix("rcd_") else {
                print("Need both values — run me again when you have them.")
                return
            }
            store.url = u
            store.secret = s
            print("Saved. Starting hands — Ctrl-C stops everything.")
        }
        guard let supabaseURL = store.url, let deviceSecret = store.secret else { return }

        // Accessibility permission is the one OS gate. Ask once, plainly.
        if !ComputerControl.isTrusted {
            print("This Mac needs Accessibility permission for the companion.")
            print("Opening the request — allow RutexCompanion, then run me again.")
            ComputerControl.askForPermission()
            return
        }

        let link = Link(supabaseURL: supabaseURL, secret: deviceSecret)
        let hands = Hands()
        print("Hands live. Polling every 2s — Ctrl-C stops everything.")
        var lastBeat = Date.distantPast
        while true {
            do {
                if Date().timeIntervalSince(lastBeat) >= 60 {
                    lastBeat = Date()
                    try await link.heartbeat()
                }
                if let cmd = try await link.poll() {
                    print("[\(Self.clock())] \(cmd.tool)")
                    let (ok, result, error) = await hands.execute(tool: cmd.tool, args: cmd.args)
                    try await link.complete(id: cmd.id, ok: ok, result: result, error: error)
                    print(ok ? "  done" : "  FAILED: \(error ?? "unknown")")
                }
            } catch {
                print("link error (retrying): \(error.localizedDescription.split(separator: "\n").first ?? "")")
            }
            try? await Task.sleep(for: .seconds(2))
        }
    }

    private static func clock() -> String {
        let f = DateFormatter()
        f.timeStyle = .medium
        f.dateStyle = .none
        return f.string(from: Date())
    }
}

/// Device secret + URL, private to this Mac's user (0700 dir, 0600
/// file) — adapted from Bluey's Keychain.swift (Unlicense). The secret
/// is shown once at pairing and lives only here afterwards.
final class SecretStore {
    private var cache: [String: String]?
    private var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("RutexCompanion", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true,
                                                 attributes: [.posixPermissions: 0o700])
        return dir.appendingPathComponent("config.json")
    }
    private func load() -> [String: String] {
        if let cache { return cache }
        let stored = (try? Data(contentsOf: fileURL))
            .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: String] } ?? [:]
        cache = stored
        return stored
    }
    private func save(_ all: [String: String]) {
        cache = all
        guard let data = try? JSONSerialization.data(withJSONObject: all, options: [.prettyPrinted, .sortedKeys]) else { return }
        FileManager.default.createFile(atPath: fileURL.path, contents: data, attributes: [.posixPermissions: 0o600])
    }
    var url: String? {
        get { load()["supabase_url"] }
        set { var all = load(); all["supabase_url"] = newValue; save(all) }
    }
    var secret: String? {
        get { load()["device_secret"] }
        set { var all = load(); all["device_secret"] = newValue; save(all) }
    }
}
