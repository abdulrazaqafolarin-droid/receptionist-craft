import AppKit
import Foundation

/// Headless tool dispatch: the same eight tools as Bluey, minus the
/// overlay theater. No fly-to animation, no click effects, no bubbles —
/// the brain gets text back and decides the next step. Refusals mirror
/// Bluey exactly: password fields, lock/logout/force-quit shortcuts,
/// stale ids. Result shape matches the Windows companion so the brain
/// never learns which machine it is driving.
final class Hands {
    private var snapshot: ScreenSnapshot?

    private func look() async -> String {
        do {
            let snap = try await ScreenReader.snapshot()
            snapshot = snap
            return snap.targetList
        } catch {
            return "I couldn't see the screen: \(error.localizedDescription)"
        }
    }

    private func number(_ args: [String: Any], _ key: String) -> Double? {
        if let n = args[key] as? Double { return n }
        if let n = args[key] as? Int { return Double(n) }
        if let s = args[key] as? String { return Double(s) }
        return nil
    }

    private func str(_ args: [String: Any], _ key: String) -> String {
        (args[key] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func flag(_ args: [String: Any], _ key: String) -> Bool {
        (args[key] as? Bool) ?? false
    }

    private func spot(_ args: [String: Any], id idKey: String, x xKey: String, y yKey: String) -> (point: CGPoint, name: String)? {
        if let id = args[idKey] as? String, !id.isEmpty, let target = snapshot?.target(id) {
            return (CGPoint(x: target.rect.midX, y: target.rect.midY), target.text)
        }
        if let x = number(args, xKey), let y = number(args, yKey), let size = snapshot?.size {
            return (CGPoint(x: x / 1000 * size.width, y: y / 1000 * size.height), "that spot")
        }
        return nil
    }

    private static let refusedShortcuts: Set<String> = [
        "cmd+shift+q", "cmd+option+shift+q", "ctrl+cmd+q",
        "cmd+option+escape", "cmd+option+esc",
    ]

    func execute(tool: String, args: [String: Any]) async -> (ok: Bool, result: [String: Any]?, error: String?) {
        switch tool {
        case "look_at_screen":
            return (true, ["screen": await look()], nil)

        case "click": do {
            guard snapshot != nil else {
                return (false, nil, "Call look_at_screen first.")
            }
            guard let target = spot(args, id: "target_id", x: "x", y: "y") else {
                return (false, nil, "Tell me what to click: a target id from look_at_screen, or x and y.")
            }
            let right = flag(args, "right")
            let count = flag(args, "double") ? 2 : 1
            let saved = ComputerControl.mouseLocation
            await ComputerControl.click(at: target.point, right: right, count: count)
            try? await Task.sleep(for: .milliseconds(60))
            ComputerControl.warp(to: saved)
            try? await Task.sleep(for: .milliseconds(380))
            let verb = right ? "Right-clicked" : count == 2 ? "Double-clicked" : "Clicked"
            let screen = await look()
            let what = target.name == "that spot" ? "there" : "\"\(target.name)\""
            return (true, ["message": "\(verb) \(what).", "screen": screen], nil)
        }

        case "type_text": do {
            let text = str(args, "text")
            guard !text.isEmpty else { return (false, nil, "Nothing to type.") }
            let field = ControlsReader.focusedField()
            if field.secure {
                return (false, nil, "That's a password field. Ask the user to type it themselves.")
            }
            await ComputerControl.type(String(text.prefix(2000))) { _ in }
            if flag(args, "press_return") {
                try? await Task.sleep(for: .milliseconds(120))
                _ = try? ComputerControl.press("return")
                try? await Task.sleep(for: .milliseconds(550))
                return (true, ["message": "Typed it and pressed Return.", "screen": await look()], nil)
            }
            return (true, ["message": "Typed it."], nil)
        }

        case "press_keys": do {
            let keys = str(args, "keys")
            guard !keys.isEmpty else { return (false, nil, "Which keys?") }
            let normalized = keys.lowercased().replacingOccurrences(of: " ", with: "")
            if Self.refusedShortcuts.contains(normalized) {
                return (false, nil, "I won't press that one (it logs out, locks or force-quits). Ask the user to do it.")
            }
            let label: String
            do { label = try ComputerControl.press(keys) }
            catch { return (false, nil, error.localizedDescription) }
            try? await Task.sleep(for: .milliseconds(380))
            return (true, ["message": "Pressed \(keys).", "screen": await look()], nil)
        }

        case "scroll": do {
            guard snapshot != nil else {
                return (false, nil, "Call look_at_screen first.")
            }
            let direction = str(args, "direction").lowercased()
            let amount = min(max(number(args, "amount") ?? 3, 1), 10)
            let point = spot(args, id: "target_id", x: "x", y: "y")?.point
                ?? CGPoint(x: (snapshot?.size.width ?? 1000) / 2, y: (snapshot?.size.height ?? 1000) / 2)
            let pixels = Int(amount * 120)
            let (dx, dy, word): (Int, Int, String) = {
                switch direction {
                case "up": return (0, -pixels, "up")
                case "left": return (-pixels, 0, "left")
                case "right": return (pixels, 0, "right")
                default: return (0, pixels, "down")
                }
            }()
            let saved = ComputerControl.mouseLocation
            ComputerControl.warp(to: point)
            await ComputerControl.scroll(dx: dx, dy: dy, at: point)
            ComputerControl.warp(to: saved)
            try? await Task.sleep(for: .milliseconds(280))
            return (true, ["message": "Scrolled \(word).", "screen": await look()], nil)
        }

        case "drag": do {
            guard let from = spot(args, id: "from_id", x: "from_x", y: "from_y"),
                  let to = spot(args, id: "to_id", x: "to_x", y: "to_y") else {
                return (false, nil, "Tell me where to drag from and to (ids or x and y).")
            }
            let saved = ComputerControl.mouseLocation
            ComputerControl.dragBegin(at: from.point)
            try? await Task.sleep(for: .milliseconds(120))
            let steps = 12
            for i in 1...steps {
                ComputerControl.dragMove(to: CGPoint(
                    x: from.point.x + (to.point.x - from.point.x) * CGFloat(i) / CGFloat(steps),
                    y: from.point.y + (to.point.y - from.point.y) * CGFloat(i) / CGFloat(steps)))
                try? await Task.sleep(for: .milliseconds(16))
            }
            ComputerControl.dragMove(to: to.point)
            try? await Task.sleep(for: .milliseconds(80))
            ComputerControl.dragEnd(at: to.point)
            try? await Task.sleep(for: .milliseconds(60))
            ComputerControl.warp(to: saved)
            try? await Task.sleep(for: .milliseconds(280))
            return (true, ["message": "Dragged.", "screen": await look()], nil)
        }

        case "open_app": do {
            let name = str(args, "name")
            guard !name.isEmpty else { return (false, nil, "Which app?") }
            let result = await ComputerControl.openApp(name)
            try? await Task.sleep(for: .milliseconds(900))
            return (true, ["message": result, "screen": await look()], nil)
        }

        case "open_url": do {
            let url = str(args, "url")
            guard !url.isEmpty else { return (false, nil, "Which address?") }
            let result = ComputerControl.openURL(url)
            try? await Task.sleep(for: .milliseconds(1100))
            return (true, ["message": result, "screen": await look()], nil)
        }

        default:
            return (false, nil, "Unknown tool \(tool).")
        }
    }
}
