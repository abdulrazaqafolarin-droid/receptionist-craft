// Hands — executes one brain command on this Windows machine.
//
// Every tool returns (ok, result, error). The grid layer converts the
// brain's 0-1000 positions to pixels; ids resolve against a fresh
// look first (stale ids fail closed — never click a guess).
//
// Refusals, Bluey's rules, enforced here where the hardware is:
// - password/credential fields: never typed (UIA IsPassword + name
//   patterns); the brain is told to ask the owner instead.
// - lock/shutdown shortcuts: never pressed (Win+L and friends).
// - anything else the brain asks for: done, then the screen re-read
//   so the next step reasons from what actually happened.

using System.Diagnostics;
using System.Runtime.Versioning;
using System.Text.Json;
using System.Windows.Automation;

[SupportedOSPlatform("windows")]
class Hands
{
    private static readonly HashSet<string> RefusedPress =
        new(StringComparer.OrdinalIgnoreCase) { "win+l", "meta+l", "super+l", "cmd+l" };

    private static string Str(JsonElement args, string key) =>
        args.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";

    private static double Num(JsonElement args, string key, double fallback = 0) =>
        args.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : fallback;

    private static bool Flag(JsonElement args, string key) =>
        args.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.True;

    private static (int X, int Y)? Spot(JsonElement args, Screen.Snapshot snap)
    {
        var id = Str(args, "target_id");
        if (id.Length > 0)
        {
            var t = snap.Find(id);
            if (t is null) return null;
            return Screen.ToPixels(t.X, t.Y);
        }
        if (args.TryGetProperty("x", out _) || args.TryGetProperty("y", out _))
        {
            return Screen.ToPixels((int)Num(args, "x"), (int)Num(args, "y"));
        }
        return null;
    }

    public async Task<(bool Ok, object? Result, string? Error)> Execute(string tool, JsonElement args)
    {
        try
        {
            return tool switch
            {
                "look_at_screen" => Ok(new { screen = Screen.Look().Describe(Screen.ScreenSize().W, Screen.ScreenSize().H) }),
                "click" => await Click(args),
                "type_text" => await TypeText(args),
                "press_keys" => await PressKeys(args),
                "scroll" => await Scroll(args),
                "drag" => await Drag(args),
                "open_app" => await OpenApp(args),
                "open_url" => await OpenUrl(args),
                _ => Fail($"unknown tool: {tool}"),
            };
        }
        catch (Exception ex)
        {
            return Fail(ex.Message.Split('\n')[0]);
        }
    }

    private static (bool, object?, string?) Ok(object result) => (true, result, null);
    private static (bool, object?, string?) Fail(string error) => (false, null, error.Length > 300 ? error[..300] : error);

    private async Task<(bool, object?, string?)> Click(JsonElement args)
    {
        var snap = Screen.Look();
        var spot = Spot(args, snap);
        if (spot is null) return Fail("Tell me what to click: a target id from look_at_screen, or x and y.");
        var (sx, sy) = Input.MouseNow();
        var right = Flag(args, "right");
        var count = Flag(args, "double") ? 2 : 1;
        Input.Click(spot.Value.X, spot.Value.Y, right, count);
        await Task.Delay(90);
        Input.GiveBack(sx, sy);
        await Task.Delay(380);
        var after = Screen.Look();
        return Ok(new
        {
            message = $"{(right ? "Right-clicked" : count == 2 ? "Double-clicked" : "Clicked")} at ({spot.Value.X},{spot.Value.Y}).",
            screen = after.Describe(Screen.ScreenSize().W, Screen.ScreenSize().H),
        });
    }

    private async Task<(bool, object?, string?)> TypeText(JsonElement args)
    {
        var text = Str(args, "text");
        if (text.Length == 0) return Fail("Nothing to type.");
        if (text.Length > 2000) text = text[..2000];
        // Refuse credential fields at the focused element, where the truth is.
        try
        {
            var focused = AutomationElement.FocusedElement;
            var isPw = focused.GetCurrentPropertyValue(AutomationElement.IsPasswordProperty) is bool pw && pw;
            var nm = ((focused.GetCurrentPropertyValue(AutomationElement.NameProperty) as string) ?? "").ToLowerInvariant();
            if (isPw || nm.Contains("password") || nm.Contains("passcode") || nm.Contains("cvv") || nm.Contains("card number"))
                return Fail("That's a password field. Ask the user to type it themselves.");
        }
        catch { }
        Input.TypeUnicode(text);
        if (Flag(args, "press_return"))
        {
            await Task.Delay(120);
            Input.TapReturn();
            await Task.Delay(550);
            var after = Screen.Look();
            return Ok(new
            {
                message = "Typed it and pressed Return.",
                screen = after.Describe(Screen.ScreenSize().W, Screen.ScreenSize().H),
            });
        }
        return Ok(new { message = "Typed it." });
    }

    private async Task<(bool, object?, string?)> PressKeys(JsonElement args)
    {
        var keys = Str(args, "keys").Trim();
        if (keys.Length == 0) return Fail("Which keys?");
        var norm = keys.ToLowerInvariant().Replace(" ", "").Replace("command", "win").Replace("meta", "win").Replace("super", "win").Replace("alt", "alt");
        if (RefusedPress.Contains(norm))
            return Fail("I won't press that one (it locks the computer). Ask the user to do it.");
        string label;
        try { label = Input.PressCombo(keys); }
        catch (Exception ex) { return Fail(ex.Message); }
        await Task.Delay(380);
        var after = Screen.Look();
        return Ok(new
        {
            message = label,
            screen = after.Describe(Screen.ScreenSize().W, Screen.ScreenSize().H),
        });
    }

    private async Task<(bool, object?, string?)> Scroll(JsonElement args)
    {
        var snap = Screen.Look();
        var spot = Spot(args, snap);
        var dir = Str(args, "direction").ToLowerInvariant();
        // Horizontal wheel needs a separate event path this build does not
        // carry — say so instead of reporting a scroll that never moved.
        if (dir is "left" or "right")
            return Fail("Sideways scroll isn't supported yet — up or down instead?");
        var amount = Math.Clamp((int)Num(args, "amount", 3), 1, 10);
        var (px, py) = spot ?? (Screen.ScreenSize().W / 2, Screen.ScreenSize().H / 2);
        Input.Move(px, py);
        await Task.Delay(40);
        var delta = 120 * amount;
        for (var i = 0; i < 12; i++)
        {
            Input.Wheel(dir == "up" ? delta / 12 : -delta / 12);
            await Task.Delay(16);
        }
        await Task.Delay(200);
        var after = Screen.Look();
        return Ok(new
        {
            message = $"Scrolled {dir switch { "up" => "up", _ => "down" }}.",
            screen = after.Describe(Screen.ScreenSize().W, Screen.ScreenSize().H),
        });
    }

    private async Task<(bool, object?, string?)> Drag(JsonElement args)
    {
        var snap = Screen.Look();
        (int X, int Y)? From(JsonElement a, string idKey, string xKey, string yKey)
        {
            var id = Str(a, idKey);
            if (id.Length > 0)
            {
                var t = snap.Find(id);
                if (t is null) return null;
                return Screen.ToPixels(t.X, t.Y);
            }
            return Screen.ToPixels((int)Num(a, xKey), (int)Num(a, yKey));
        }
        var from = From(args, "from_id", "from_x", "from_y");
        var to = From(args, "to_id", "to_x", "to_y");
        if (from is null || to is null) return Fail("Drag needs from and to: ids or x/y positions.");
        Input.Drag(from.Value.X, from.Value.Y, to.Value.X, to.Value.Y);
        await Task.Delay(300);
        var after = Screen.Look();
        return Ok(new
        {
            message = "Dragged.",
            screen = after.Describe(Screen.ScreenSize().W, Screen.ScreenSize().H),
        });
    }

    private async Task<(bool, object?, string?)> OpenApp(JsonElement args)
    {
        var name = Str(args, "name").Trim();
        if (name.Length == 0) return Fail("Which app?");
        if (name.Length > 120) return Fail("App name too long.");
        try
        {
            using var p = Process.Start(new ProcessStartInfo
            {
                FileName = name,
                UseShellExecute = true,
            });
            await Task.Delay(900);
            var after = Screen.Look();
            return Ok(new
            {
                message = $"Opened {name}.",
                screen = after.Describe(Screen.ScreenSize().W, Screen.ScreenSize().H),
            });
        }
        catch (Exception ex)
        {
            return Fail($"Could not open \"{name}\": {ex.Message.Split('\n')[0]}");
        }
    }

    private async Task<(bool, object?, string?)> OpenUrl(JsonElement args)
    {
        var url = Str(args, "url").Trim();
        if (url.Length == 0) return Fail("Which address?");
        if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            url = "https://" + url;
        if (url.Length > 500 || url.Any(char.IsWhiteSpace)) return Fail("That address looks wrong.");
        try
        {
            using var p = Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
            await Task.Delay(1200);
            var after = Screen.Look();
            return Ok(new
            {
                message = $"Opened {url}.",
                screen = after.Describe(Screen.ScreenSize().W, Screen.ScreenSize().H),
            });
        }
        catch (Exception ex)
        {
            return Fail($"Could not open that address: {ex.Message.Split('\n')[0]}");
        }
    }
}
