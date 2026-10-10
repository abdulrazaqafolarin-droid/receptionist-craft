// Screen reading: UI Automation tree serialized as the brain's grid.
//
// Same shape as Bluey's look_at_screen so the same reasoning works:
// front app, clickable controls (C ids), every text chunk with a
// 0-1000 position. UIA bounding rectangles ground the ids — no OCR
// needed for native apps. Canvas-only surfaces come back sparse; the
// grid says what it sees and never invents the rest.

using System.Runtime.Versioning;
using System.Text;
using System.Windows.Automation;

[SupportedOSPlatform("windows")]
static partial class Screen
{
    public record Spot(string Id, string Kind, string Label, int X, int Y);

    public class Snapshot
    {
        public string App { get; set; } = "";
        public List<Spot> Controls { get; } = new();
        public List<Spot> Texts { get; } = new();

        public Spot? Find(string id) =>
            Controls.Concat(Texts).FirstOrDefault(s => s.Id == id);

        public string Describe(int screenW, int screenH)
        {
            var sb = new StringBuilder();
            sb.AppendLine($"Front app: {App}");
            sb.AppendLine("Controls (click these by id):");
            sb.Append(Controls.Count == 0 ? "(none found)" :
                string.Join("\n", Controls.Select(c => $"{c.Id} {c.Kind} @({c.X},{c.Y})" + (c.Label.Length > 0 ? $" \"{c.Label}\"" : ""))));
            sb.AppendLine();
            sb.AppendLine("Text on screen (id @x,y):");
            sb.Append(Texts.Count == 0 ? "(no text found)" :
                string.Join("\n", Texts.Select(t => $"{t.Id} @({t.X},{t.Y}) \"{t.Label}\"")));
            return sb.ToString();
        }
    }

    [System.Runtime.InteropServices.LibraryImport("user32.dll")]
    private static partial int GetSystemMetrics(int nIndex);

    public static (int W, int H) ScreenSize()
    {
        var w = GetSystemMetrics(0);
        var h = GetSystemMetrics(1);
        return (Math.Max(1, w), Math.Max(1, h));
    }

    private static int Gx(double px, int w) => Math.Clamp((int)(px / w * 1000), 0, 1000);
    private static int Gy(double py, int h) => Math.Clamp((int)(py / h * 1000), 0, 1000);

    public static (int X, int Y) ToPixels(int gx, int gy)
    {
        var (w, h) = ScreenSize();
        return (gx * w / 1000, gy * h / 1000);
    }

    public static Snapshot Look()
    {
        var snap = new Snapshot();
        var (w, h) = ScreenSize();
        try
        {
            var root = AutomationElement.RootElement;
            var focused = AutomationElement.FocusedElement;
            string app = "";
            // Front app: the focused element's top-level window process.
            try
            {
                var el = focused;
                while (el != null)
                {
                    var parent = TreeWalker.RawViewWalker.GetParent(el);
                    if (parent == null || parent == AutomationElement.RootElement) break;
                    el = parent;
                }
                if (el != null && el.TryGetCurrentPattern(WindowPattern.Pattern, out _))
                {
                    app = el.Current.Name ?? "";
                }
            }
            catch { }
            if (app.Length == 0)
            {
                try
                {
                    [System.Runtime.InteropServices.DllImport("user32.dll")]
                    static extern nint GetForegroundWindow();
                    [System.Runtime.InteropServices.DllImport("user32.dll")]
                    static extern uint GetWindowThreadProcessId(nint hWnd, out uint pid);
                    GetWindowThreadProcessId(GetForegroundWindow(), out var pid);
                    app = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName;
                }
                catch { app = "unknown"; }
            }
            snap.App = app.Length > 80 ? app[..80] : app;

            int ci = 0, ti = 0;
            var seen = new HashSet<string>();
            void Walk(AutomationElement el, int depth)
            {
                if (depth > 6 || ci + ti > 220) return;
                AutomationElementCollection kids;
                try { kids = el.FindAll(TreeScope.Children, Condition.TrueCondition); }
                catch { return; }
                foreach (AutomationElement kid in kids)
                {
                    string name, kind, key;
                    System.Windows.Rect rect;
                    bool offscreen, password;
                    try
                    {
                        name = (kid.GetCurrentPropertyValue(AutomationElement.NameProperty) as string ?? "").Trim();
                        kind = kid.GetCurrentPropertyValue(AutomationElement.ControlTypeProperty) is ControlType ct ? ct.ProgrammaticName.Replace("ControlType.", "") : "?";
                        rect = kid.Current.BoundingRectangle;
                        offscreen = kid.Current.IsOffscreen;
                        password = kind == "Edit" && (kid.GetCurrentPropertyValue(AutomationElement.IsPasswordProperty) is bool pw && pw);
                    }
                    catch { continue; }
                    if (offscreen || rect.Width < 4 || rect.Height < 4) { Walk(kid, depth + 1); continue; }
                    key = $"{name}|{kind}|{(int)rect.X}|{(int)rect.Y}";
                    if (!seen.Add(key)) { Walk(kid, depth + 1); continue; }
                    var cx = Gx(rect.X + rect.Width / 2, w);
                    var cy = Gy(rect.Y + rect.Height / 2, h);
                    var label = name.Replace('\n', ' ');
                    if (label.Length > 60) label = label[..60];
                    var clickable = kind is "Button" or "Hyperlink" or "MenuItem" or "TabItem" or "ListItem" or "TreeItem" or "CheckBox" or "RadioButton" or "ComboBox" or "SplitButton" or "DropDownButton";
                    if (clickable || (kind == "Edit" && !password))
                    {
                        ci++;
                        snap.Controls.Add(new Spot($"C{ci}", kind, password ? "(credential field)" : label, cx, cy));
                    }
                    else if (kind is "Text" or "Document" || label.Length > 0)
                    {
                        ti++;
                        snap.Texts.Add(new Spot($"W{ti}", kind, label, cx, cy));
                    }
                    Walk(kid, depth + 1);
                }
            }
            Walk(root, 0);
        }
        catch (Exception ex)
        {
            snap.App = "unreadable";
            snap.Texts.Add(new Spot("W0", "error", ex.Message.Split('\n')[0][..Math.Min(120, ex.Message.Length)], 500, 500));
        }
        return snap;
    }
}
