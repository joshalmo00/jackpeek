using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Reflection;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using NetworkPortAnalyzer.Capture;
using NetworkPortAnalyzer.Core;
using NetworkPortAnalyzer.Windows;

var appRoot = AppContext.BaseDirectory;
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = appRoot,
    WebRootPath = appRoot
});
var requestedPort = ReadPort(args) ?? 0;
builder.WebHost.UseKestrel(o => o.Listen(IPAddress.Loopback, requestedPort));

builder.Services.AddSingleton<WindowsAdapterService>();
builder.Services.AddSingleton<PassiveCaptureService>();
builder.Services.AddSingleton<ScanRegistry>();

var app = builder.Build();

app.MapGet("/", () => ServeEmbeddedWebFile("index.html"));
app.MapGet("/{fileName:regex(^[a-zA-Z0-9_.-]+$)}", (string fileName) => ServeEmbeddedWebFile(fileName));
app.MapGet("/assets/{fileName:regex(^[a-zA-Z0-9_.-]+$)}", (string fileName) => ServeEmbeddedWebFile($"assets/{fileName}"));

app.MapGet("/api/adapters", (WindowsAdapterService windows, PassiveCaptureService capture) =>
{
    var adapters = windows.GetAdapters();
    return Results.Ok(capture.GetCaptureDevices(adapters));
});

app.MapPost("/api/scans", (ScanRequest request, ScanRegistry scans, PassiveCaptureService capture) =>
{
    if (string.IsNullOrWhiteSpace(request.AdapterId))
    {
        return Results.BadRequest(new { error = "AdapterId is required." });
    }

    var scanId = Guid.NewGuid().ToString("n");
    scans.Set(scanId, new ScanStatus(scanId, "running", null, null));
    _ = Task.Run(async () =>
    {
        var seconds = Math.Clamp(request.DurationSeconds ?? 30, 5, 120);
        var result = await capture.ScanAsync(scanId, request.AdapterId, TimeSpan.FromSeconds(seconds), CancellationToken.None);
        scans.Set(scanId, new ScanStatus(scanId, "complete", result, result.Error));
    });

    return Results.Accepted($"/api/scans/{scanId}", new { scanId });
});

app.MapGet("/api/scans/{scanId}", (string scanId, ScanRegistry scans) =>
    scans.TryGet(scanId, out var status) ? Results.Ok(status) : Results.NotFound(new { error = "Scan not found." }));

await app.StartAsync();
var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
Console.WriteLine($"Network Port Analyzer listening on {address}");
Console.WriteLine("The capture engine is passive-only. Close this window to stop the app.");
if (!args.Contains("--no-browser", StringComparer.OrdinalIgnoreCase))
{
    Process.Start(new ProcessStartInfo(address) { UseShellExecute = true });
}

await app.WaitForShutdownAsync();

static int? ReadPort(string[] args)
{
    var arg = args.FirstOrDefault(a => a.StartsWith("--port=", StringComparison.OrdinalIgnoreCase));
    return arg is null ? null : int.TryParse(arg["--port=".Length..], out var port) ? port : null;
}

static IResult ServeEmbeddedWebFile(string fileName)
{
    var contentType = Path.GetExtension(fileName).ToLowerInvariant() switch
    {
        ".html" => "text/html; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".js" => "application/javascript; charset=utf-8",
        ".png" => "image/png",
        ".ico" => "image/x-icon",
        _ => "application/octet-stream"
    };

    var assembly = Assembly.GetExecutingAssembly();
    var resourcePath = $"wwwroot/{fileName}".Replace('\\', '/');
    var resourceName = assembly.GetManifestResourceNames()
        .FirstOrDefault(name => name.Replace('\\', '/').Equals(resourcePath, StringComparison.OrdinalIgnoreCase));
    using var stream = resourceName is null ? null : assembly.GetManifestResourceStream(resourceName);
    if (stream is null)
    {
        return Results.NotFound();
    }

    using var reader = new StreamReader(stream);
    return Results.Text(reader.ReadToEnd(), contentType);
}

public sealed record ScanRequest(string AdapterId, int? DurationSeconds);

public sealed record ScanStatus(string ScanId, string State, ScanResult? Result, string? Error);

public sealed class ScanRegistry
{
    private readonly ConcurrentDictionary<string, ScanStatus> _scans = new();
    public void Set(string scanId, ScanStatus status) => _scans[scanId] = status;
    public bool TryGet(string scanId, out ScanStatus? status) => _scans.TryGetValue(scanId, out status);
}
