using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using NetworkPortAnalyzer.Capture;
using NetworkPortAnalyzer.Core;
using NetworkPortAnalyzer.Web;
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
builder.Services.AddSingleton<WindowsIdentityService>();
builder.Services.AddSingleton<PassiveCaptureService>();
builder.Services.AddSingleton<ScanRegistry>();
builder.Services.AddSingleton<EvidenceStore>();
builder.Services.AddSingleton<LicenseService>();
builder.Services.AddSingleton<AuditLog>();

var app = builder.Build();

app.MapGet("/", () => ServeEmbeddedWebFile("index.html"));
app.MapGet("/{fileName:regex(^[a-zA-Z0-9_.-]+$)}", (string fileName) => ServeEmbeddedWebFile(fileName));
app.MapGet("/assets/{fileName:regex(^[a-zA-Z0-9_.-]+$)}", (string fileName) => ServeEmbeddedWebFile($"assets/{fileName}"));

app.MapGet("/api/adapters", (WindowsAdapterService windows, PassiveCaptureService capture) =>
{
    var adapters = windows.GetAdapters();
    return Results.Ok(capture.GetCaptureDevices(adapters));
});

app.MapGet("/api/session", (WindowsIdentityService identity, EvidenceStore evidence, LicenseService licenses) =>
{
    var settings = evidence.GetSettings();
    return Results.Ok(new
    {
        workstation = identity.Capture(settings.IncludeWindowsUser),
        settings,
        license = licenses.GetStatus()
    });
});

app.MapGet("/api/license", (LicenseService licenses) => Results.Ok(licenses.GetStatus()));

app.MapPost("/api/license/import", async (HttpRequest request, LicenseService licenses, AuditLog audit) =>
{
    try
    {
        using var reader = new StreamReader(request.Body);
        var status = licenses.Import(await reader.ReadToEndAsync());
        audit.Write("license.import", "success", detail: status.LicenseId);
        return Results.Ok(status);
    }
    catch (Exception ex)
    {
        audit.Write("license.import", "failed", detail: ex.Message);
        return Results.BadRequest(new { error = ex.Message });
    }
});

app.MapGet("/api/evidence/settings", (EvidenceStore evidence) => Results.Ok(evidence.GetSettings()));

app.MapPost("/api/evidence/settings", (EvidenceSettingsUpdate request, EvidenceStore evidence, AuditLog audit) =>
{
    try
    {
        var settings = evidence.SaveSettings(request);
        audit.Write("settings.update", "success");
        return Results.Ok(settings);
    }
    catch (Exception ex)
    {
        audit.Write("settings.update", "failed", detail: ex.Message);
        return Results.BadRequest(new { error = ex.Message });
    }
});

app.MapGet("/api/reports", (EvidenceStore evidence) => Results.Ok(evidence.ListReports()));

app.MapGet("/api/reports/{evidenceId}", (string evidenceId, EvidenceStore evidence) =>
    evidence.TryReadRecord(evidenceId) is { } record ? Results.Ok(record) : Results.NotFound(new { error = "Report not found." }));

app.MapGet("/api/reports/{evidenceId}/verify", (string evidenceId, EvidenceStore evidence, AuditLog audit) =>
{
    var record = evidence.TryReadRecord(evidenceId);
    if (record is null)
    {
        return Results.NotFound(new { error = "Report not found." });
    }

    var valid = evidence.Verify(record);
    audit.Write("evidence.verify", valid ? "valid" : "modified", evidenceId);
    return Results.Ok(new { evidenceId, valid, state = valid ? "Valid" : "Modified", sha256 = record.Sha256 });
});

app.MapDelete("/api/reports/{evidenceId}", (string evidenceId, EvidenceStore evidence, AuditLog audit) =>
{
    var deleted = evidence.Delete(evidenceId);
    audit.Write("evidence.delete", deleted ? "success" : "blocked-or-not-found", evidenceId);
    return deleted ? Results.NoContent() : Results.BadRequest(new { error = "Evidence deletion is disabled by enterprise policy or the report was not found." });
});

app.MapGet("/api/reports/{evidenceId}/download", (string evidenceId, EvidenceStore evidence) =>
{
    var record = evidence.TryReadRecord(evidenceId);
    if (record is null)
    {
        return Results.NotFound(new { error = "Report not found." });
    }

    var json = System.Text.Json.JsonSerializer.Serialize(record, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    });
    return Results.File(System.Text.Encoding.UTF8.GetBytes(json), "application/json", $"jackpeek-evidence-{evidenceId}.json");
});

app.MapGet("/api/reports/{evidenceId}/csv", (string evidenceId, EvidenceStore evidence, AuditLog audit) =>
{
    var record = evidence.TryReadRecord(evidenceId);
    if (record is null)
    {
        return Results.NotFound(new { error = "Report not found." });
    }

    var rows = new List<string> { "evidenceId,createdAt,protocol,device,port,managementAddress,nativeVlan,voiceVlan,frames" };
    rows.AddRange(record.Scan.Observations.Select(observation =>
    {
        var packet = observation.Latest;
        return string.Join(',', new[]
        {
            Csv(record.EvidenceId), Csv(record.CreatedAt.ToString("O")), Csv(observation.Protocol),
            Csv(packet.DeviceName ?? packet.ChassisId), Csv(packet.PortDescription ?? packet.PortId),
            Csv(packet.ManagementAddress), Csv(packet.NativeVlan?.ToString()), Csv(packet.VoiceVlan?.ToString()),
            Csv(observation.FramesSeen.ToString())
        });
    }));
    audit.Write("evidence.export", "success", evidenceId, "csv");
    return Results.File(System.Text.Encoding.UTF8.GetBytes(string.Join(Environment.NewLine, rows) + Environment.NewLine), "text/csv", $"jackpeek-evidence-{evidenceId}.csv");
});

app.MapGet("/api/reports/{evidenceId}/package", (string evidenceId, EvidenceStore evidence, AuditLog audit) =>
{
    var record = evidence.TryReadRecord(evidenceId);
    if (record is null)
    {
        return Results.NotFound(new { error = "Report not found." });
    }

    var json = System.Text.Json.JsonSerializer.Serialize(record, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    });
    var html = evidence.BuildHtmlReport(record);
    using var package = new MemoryStream();
    using (var archive = new ZipArchive(package, ZipArchiveMode.Create, true))
    {
        AddEntry(archive, $"jackpeek-evidence-{evidenceId}.json", json);
        AddEntry(archive, $"jackpeek-evidence-{evidenceId}.html", html);
        AddEntry(archive, $"jackpeek-evidence-{evidenceId}.sha256", $"{record.Sha256}  jackpeek-evidence-{evidenceId}.json\n");
        AddEntry(archive, "manifest.json", System.Text.Json.JsonSerializer.Serialize(new
        {
            product = "JackPeek",
            evidenceId,
            createdAt = record.CreatedAt,
            sha256 = record.Sha256,
            passiveOnly = true,
            contents = new[] { "JSON", "HTML", "SHA-256" }
        }, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web) { WriteIndented = true }));
    }

    audit.Write("evidence.export", "success", evidenceId, "package");
    return Results.File(package.ToArray(), "application/zip", $"jackpeek-evidence-{evidenceId}.zip");
});

app.MapGet("/reports/{evidenceId}.html", (string evidenceId, EvidenceStore evidence) =>
{
    var record = evidence.TryReadRecord(evidenceId);
    return record is null
        ? Results.NotFound(new { error = "Report not found." })
        : Results.Text(evidence.BuildHtmlReport(record), "text/html; charset=utf-8");
});

app.MapPost("/api/scans", (ScanRequest request, ScanRegistry scans, PassiveCaptureService capture, EvidenceStore evidence, LicenseService licenses, AuditLog audit) =>
{
    if (string.IsNullOrWhiteSpace(request.AdapterId))
    {
        return Results.BadRequest(new { error = "AdapterId is required." });
    }

    var settings = evidence.GetSettings();
    var license = licenses.GetStatus();
    if (settings.RequireValidLicense && !license.IsValid)
    {
        audit.Write("capture.start", "blocked", detail: license.State);
        return Results.StatusCode(StatusCodes.Status402PaymentRequired);
    }

    var scanId = Guid.NewGuid().ToString("n");
    audit.Write("capture.start", "accepted", scanId, request.AdapterId);
    scans.Set(scanId, new ScanStatus(scanId, "running", null, null, null));
    _ = Task.Run(async () =>
    {
        var seconds = Math.Clamp(request.DurationSeconds ?? 30, 5, settings.MaxCaptureDurationSeconds);
        var result = await capture.ScanAsync(scanId, request.AdapterId, TimeSpan.FromSeconds(seconds), CancellationToken.None);
        EvidenceSummary? summary = null;
        string? error = result.Error;
        try
        {
            summary = evidence.SaveScan(result);
        }
        catch (Exception ex)
        {
            error = string.IsNullOrWhiteSpace(error)
                ? $"Capture completed, but evidence could not be saved: {ex.Message}"
                : $"{error} Evidence could not be saved: {ex.Message}";
        }

        scans.Set(scanId, new ScanStatus(scanId, "complete", result, summary, error));
        audit.Write("capture.complete", error is null ? "success" : "completed-with-error", scanId, error);
    });

    return Results.Accepted($"/api/scans/{scanId}", new { scanId });
});

app.MapGet("/api/scans/{scanId}", (string scanId, ScanRegistry scans) =>
    scans.TryGet(scanId, out var status) ? Results.Ok(status) : Results.NotFound(new { error = "Scan not found." }));

await app.StartAsync();
var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
Console.WriteLine($"JackPeek listening on {address}");
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

static void AddEntry(ZipArchive archive, string name, string content)
{
    using var writer = new StreamWriter(archive.CreateEntry(name).Open(), System.Text.Encoding.UTF8);
    writer.Write(content);
}

static string Csv(string? value) => $"\"{(value ?? string.Empty).Replace("\"", "\"\"")}\"";

public sealed record ScanRequest(string AdapterId, int? DurationSeconds);

public sealed record ScanStatus(string ScanId, string State, ScanResult? Result, EvidenceSummary? Evidence, string? Error);

public sealed class ScanRegistry
{
    private readonly ConcurrentDictionary<string, ScanStatus> _scans = new();
    public void Set(string scanId, ScanStatus status) => _scans[scanId] = status;
    public bool TryGet(string scanId, out ScanStatus? status) => _scans.TryGetValue(scanId, out status);
}
