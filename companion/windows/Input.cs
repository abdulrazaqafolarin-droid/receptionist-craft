// Low-level hands: real mouse, keyboard, and shortcuts via Win32.
// Positions are screen pixels (the grid layer converts 0-1000 for us).
// The real pointer is handed back where it was after every click —
// Bluey's rule, so the owner never loses their place.

using System.Runtime.InteropServices;
using System.Runtime.Versioning;

[SupportedOSPlatform("windows")]
static partial class Input
{
    [LibraryImport("user32.dll")] private static partial void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [LibraryImport("user32.dll", SetLastError = true)] private static partial uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool SetCursorPos(int x, int y);
    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool GetCursorPos(out POINT lpPoint);

    private const uint MOUSEEVENTF_MOVE = 0x0001, MOUSEEVENTF_LEFTDOWN = 0x0002, MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008, MOUSEEVENTF_RIGHTUP = 0x0010, MOUSEEVENTF_WHEEL = 0x0800;
    private const uint KEYEVENTF_KEYUP = 0x0002, KEYEVENTF_UNICODE = 0x0004, KEYEVENTF_SCANCODE = 0x0008;
    private const ushort VK_RETURN = 0x0D, VK_TAB = 0x09, VK_ESCAPE = 0x1B, VK_SHIFT = 0x10;

    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT
    {
        public uint Type; public InputUnion U;
        public static int Size => Marshal.SizeOf<INPUT>();
    }
    [StructLayout(LayoutKind.Explicit)] struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT Mi;
        [FieldOffset(0)] public KEYBDINPUT Ki;
    }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT
    { public int Dx; public int Dy; public uint MouseData; public uint DwFlags; public uint Time; public UIntPtr DwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT
    { public ushort WVk; public ushort WScan; public uint DwFlags; public uint Time; public UIntPtr DwExtraInfo; }

    public static (int X, int Y) MouseNow()
    {
        GetCursorPos(out var p);
        return (p.X, p.Y);
    }

    public static void Move(int x, int y) => SetCursorPos(x, y);

    public static void Click(int x, int y, bool right = false, int count = 1)
    {
        Move(x, y);
        Thread.Sleep(30);
        for (var i = 0; i < Math.Max(1, count); i++)
        {
            if (right) { mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0); Thread.Sleep(35); mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0); }
            else { mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); Thread.Sleep(35); mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0); }
            if (i + 1 < count) Thread.Sleep(80);
        }
    }

    public static void GiveBack(int x, int y) => SetCursorPos(x, y);

    public static void Drag(int x1, int y1, int x2, int y2)
    {
        Move(x1, y1);
        Thread.Sleep(40);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
        Thread.Sleep(60);
        const int steps = 12;
        for (var i = 1; i <= steps; i++)
        {
            Move(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps);
            Thread.Sleep(16);
        }
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
    }

    public static void Wheel(int delta)
    {
        var input = new INPUT
        {
            Type = 0,
            U = new InputUnion { Mi = new MOUSEINPUT { MouseData = (uint)delta, DwFlags = MOUSEEVENTF_WHEEL } },
        };
        SendInput(1, [input], INPUT.Size);
    }

    public static void TypeUnicode(string text)
    {
        foreach (var ch in text)
        {
            SendKey(scancode: ch, unicode: true, up: false);
            SendKey(scancode: ch, unicode: true, up: true);
            Thread.Sleep(text.Length > 160 ? 4 : 12);
        }
    }

    public static void KeyDown(ushort vk) => SendKey(vk, unicode: false, up: false);
    public static void KeyUp(ushort vk) => SendKey(vk, unicode: false, up: true);

    private static void SendKey(ushort scancode, bool unicode, bool up)
    {
        var ki = new KEYBDINPUT
        {
            WVk = unicode ? (ushort)0 : scancode,
            WScan = unicode ? scancode : (ushort)0,
            DwFlags = (unicode ? KEYEVENTF_UNICODE : 0) | (up ? KEYEVENTF_KEYUP : 0),
        };
        if (!unicode && !up) ki.DwFlags |= KEYEVENTF_SCANCODE;
        SendInput(1, [new INPUT { Type = 1, U = new InputUnion { Ki = ki } }], INPUT.Size);
    }

    public static void Tap(ushort vk)
    {
        KeyDown(vk);
        Thread.Sleep(30);
        KeyUp(vk);
    }

    public static void TapReturn() => Tap(VK_RETURN);
    public static void TapTab() => Tap(VK_TAB);
    public static void TapEscape() => Tap(VK_ESCAPE);

    // Named keys for press_keys. Win+L (lock) is refused upstairs in Hands.
    private static readonly Dictionary<string, ushort> Named = new(StringComparer.OrdinalIgnoreCase)
    {
        ["return"] = VK_RETURN, ["enter"] = VK_RETURN, ["tab"] = VK_TAB, ["escape"] = VK_ESCAPE, ["esc"] = VK_ESCAPE,
        ["space"] = 0x20, ["backspace"] = 0x08, ["delete"] = 0x2E,
        ["up"] = 0x26, ["down"] = 0x28, ["left"] = 0x25, ["right"] = 0x27,
        ["home"] = 0x24, ["end"] = 0x23, ["pageup"] = 0x21, ["pagedown"] = 0x22,
        ["f1"] = 0x70, ["f2"] = 0x71, ["f3"] = 0x72, ["f4"] = 0x73, ["f5"] = 0x74, ["f6"] = 0x75,
        ["f7"] = 0x76, ["f8"] = 0x77, ["f9"] = 0x78, ["f10"] = 0x79, ["f11"] = 0x7A, ["f12"] = 0x7B,
    };

    private static readonly Dictionary<string, ushort> Modifiers = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ctrl"] = 0x11, ["control"] = 0x11, ["shift"] = VK_SHIFT, ["alt"] = 0x12, ["menu"] = 0x12,
        ["win"] = 0x5B, ["cmd"] = 0x5B, ["super"] = 0x5B, ["meta"] = 0x5B,
    };

    /// Press "ctrl+t", "alt+f4", "down", "f5"... Returns a label or throws.
    public static string PressCombo(string combo)
    {
        var parts = combo.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length == 0) throw new Exception("Empty shortcut.");
        var held = new List<ushort>();
        for (var i = 0; i < parts.Length - 1; i++)
        {
            if (!Modifiers.TryGetValue(parts[i], out var mod)) throw new Exception($"Unknown modifier \"{parts[i]}\".");
            held.Add(mod);
            KeyDown(mod);
            Thread.Sleep(25);
        }
        var last = parts[^1];
        if (last.Length == 1 && held.Count > 0)
        {
            // Unicode injection ignores held modifiers — combos need
            // virtual keys. Letters and digits map directly.
            var c = char.ToUpperInvariant(last[0]);
            ushort vk = c is >= 'A' and <= 'Z' ? (ushort)(0x41 + c - 'A')
                : c is >= '0' and <= '9' ? (ushort)(0x30 + c - '0')
                : throw new Exception($"Key \"{last}\" needs no modifiers, or is unsupported with them.");
            Tap(vk);
        }
        else if (last.Length == 1) TypeUnicode(last);
        else if (Named.TryGetValue(last, out var vk)) Tap(vk);
        else throw new Exception($"Unknown key \"{last}\".");
        Thread.Sleep(30);
        foreach (var mod in held.AsEnumerable().Reverse()) KeyUp(mod);
        return $"Pressed {combo}.";
    }
}
