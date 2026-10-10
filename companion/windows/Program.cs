// RutexCompanion — the Director's hands on Windows.
//
// A small console app that polls the platform for work and executes it
// with real mouse, keyboard, and UI Automation reads. It is ONLY hands:
// every decision comes from the Director's brain through
// director_commands. It never acts on its own, never scripts, and stops
// the moment it is disabled, revoked, or closed.
//
// First run asks for two things (saved to config.json beside the exe):
//   1. Supabase URL  (https://<ref>.supabase.co)
//   2. Device secret (paired in the app: Director > Computers > Pair;
//      shown ONCE there — paste it here)
// Then it polls every 2s and heartbeats every 60s. Close the window to
// stop everything instantly.
//
// Build (needs .NET 8 SDK, Windows):
//   dotnet publish -c Release
// The exe lands in bin/Release/net8.0-windows/win-x64/publish/.

using System.Net.Http;
using System.Net.Http.Json;
using System.IO;
using System.Text.Json;

var configPath = Path.Combine(AppContext.BaseDirectory, "config.json");
var config = Config.Load(configPath);
if (config is null)
{
    Console.WriteLine("Rutex Companion — first run.");
    Console.Write("Supabase URL (https://<ref>.supabase.co): ");
    var url = (Console.ReadLine() ?? "").Trim().TrimEnd('/');
    Console.Write("Device secret (Director > Computers > Pair, shown once): ");
    var secret = (Console.ReadLine() ?? "").Trim();
    if (string.IsNullOrWhiteSpace(url) || !secret.StartsWith("rcd_"))
    {
        Console.WriteLine("Need both values — run me again when you have them.");
        return 1;
    }
    config = new Config(url, secret, 2000);
    config.Save(configPath);
    Console.WriteLine("Saved. Starting hands — close this window to stop.");
}

using var http = new HttpClient { BaseAddress = new Uri(config.SupabaseUrl + "/functions/v1/companion-link") };
http.DefaultRequestHeaders.Add("apikey", "companion");
var link = new Link(http, config.DeviceSecret);
var hands = new Hands();

Console.WriteLine($"Hands live. Polling every {config.PollMs}ms — close this window to stop.");
var lastBeat = DateTime.MinValue;
while (true)
{
    try
    {
        if ((DateTime.UtcNow - lastBeat).TotalSeconds >= 60)
        {
            lastBeat = DateTime.UtcNow;
            await link.Call("heartbeat", new {});
        }
        var cmd = await link.Poll();
        if (cmd is not null)
        {
            Console.WriteLine($"[{DateTime.Now:T}] {cmd.Tool}");
            var (ok, result, error) = await hands.Execute(cmd.Tool, cmd.Args);
            await link.Complete(cmd.Id, ok, result, error);
            Console.WriteLine(ok ? "  done" : $"  FAILED: {error}");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"link error (retrying): {ex.Message.Split('\n')[0]}");
    }
    await Task.Delay(config.PollMs);
}

record Config(string SupabaseUrl, string DeviceSecret, int PollMs)
{
    public void Save(string path) =>
        File.WriteAllText(path, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));

    public static Config? Load(string path)
    {
        try
        {
            if (!File.Exists(path)) return null;
            var c = JsonSerializer.Deserialize<Config>(File.ReadAllText(path));
            return c is { SupabaseUrl.Length: > 0, DeviceSecret.Length: > 0 } ? c : null;
        }
        catch { return null; }
    }
}

record Command(string Id, string Tool, JsonElement Args);

class Link(HttpClient http, string secret)
{
    public async Task Call(string action, object body)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, "");
        req.Headers.Add("Authorization", $"Bearer {secret}");
        req.Content = JsonContent.Create(new Dictionary<string, object?> { ["action"] = action }.Concat(
            body is Dictionary<string, object?> d ? d : new Dictionary<string, object?>()).ToDictionary(kv => kv.Key, kv => kv.Value));
        using var res = await http.SendAsync(req);
        res.EnsureSuccessStatusCode();
    }

    public async Task<Command?> Poll()
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, "");
        req.Headers.Add("Authorization", $"Bearer {secret}");
        req.Content = JsonContent.Create(new { action = "poll" });
        using var res = await http.SendAsync(req);
        if (!res.IsSuccessStatusCode) return null;
        using var doc = await JsonDocument.ParseAsync(await res.Content.ReadAsStreamAsync());
        var root = doc.RootElement;
        if (!root.TryGetProperty("command", out var c) || c.ValueKind == JsonValueKind.Null) return null;
        return new Command(
            c.GetProperty("id").GetString() ?? "",
            c.GetProperty("tool").GetString() ?? "",
            c.TryGetProperty("args", out var a) && a.ValueKind == JsonValueKind.Object
                ? a.Clone()
                : JsonDocument.Parse("{}").RootElement.Clone());
    }

    public async Task Complete(string id, bool ok, object? result, string? error)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, "");
        req.Headers.Add("Authorization", $"Bearer {secret}");
        req.Content = JsonContent.Create(new { action = "complete", command_id = id, ok, result, error });
        using var res = await http.SendAsync(req);
        res.EnsureSuccessStatusCode();
    }
}
