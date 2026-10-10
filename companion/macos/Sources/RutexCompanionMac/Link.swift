import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The wire to the platform: poll for work, post results, stay alive.
/// Speaks to companion-link with the device secret. Knows nothing about
/// screens or mice — that is Hands' job.
enum LinkError: Error {
    case badResponse
}

final class Link {
    private let base: URL
    private let secret: String
    private let session = URLSession.shared

    init(supabaseURL: String, secret: String) {
        self.base = URL(string: supabaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            .appending("/functions/v1/companion-link"))!
        self.secret = secret
    }

    private func post(_ body: [String: Any]) async throws -> [String: Any] {
        var req = URLRequest(url: base)
        req.httpMethod = "POST"
        req.setValue("Bearer \(secret)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, res) = try await session.data(for: req)
        guard (res as? HTTPURLResponse)?.statusCode == 200 else {
            throw LinkError.badResponse
        }
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    func heartbeat() async throws {
        _ = try await post(["action": "heartbeat"])
    }

    struct Polled {
        let id: String
        let tool: String
        let args: [String: Any]
    }

    func poll() async throws -> Polled? {
        let res = try await post(["action": "poll"])
        guard let cmd = res["command"] as? [String: Any],
              let id = cmd["id"] as? String,
              let tool = cmd["tool"] as? String else { return nil }
        return Polled(id: id, tool: tool, args: cmd["args"] as? [String: Any] ?? [:])
    }

    func complete(id: String, ok: Bool, result: [String: Any]?, error: String?) async throws {
        var body: [String: Any] = ["action": "complete", "command_id": id, "ok": ok]
        if let result { body["result"] = result }
        if let error { body["error"] = error }
        _ = try await post(body)
    }
}
