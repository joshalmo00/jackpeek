using System.Collections.Concurrent;
using System.Diagnostics;
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
builder.Services.AddSingleton<PortLedgerStore>();
builder.Services.AddSingleton<LicenseService>();
builder.Services.AddSingleton<AuditLog>();
builder.Services.AddSingleton<AdminService>();
builder.Services.AddHostedService<EvidenceSyncService>();

var app = builder.Build();

// Local browser requests must remain on the literal loopback origin. This also
// rejects DNS-rebinding hostnames and cross-origin form submissions.
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
    context.Response.Headers.CacheControl = "no-store";
    if (!LocalRequestPolicy.IsAllowedHost(context.Request.Host.Host) ||
        !LocalRequestPolicy.IsAllowedOrigin(context.Request.Headers.Origin.ToString(), context.Connection.LocalPort) ||
        context.Request.Headers["Sec-Fetch-Site"] == "cross-site")
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new { error = "Open JackPeek using the local address printed by the application." });
        return;
    }
    if (HttpMethods.IsPost(context.Request.Method) && !context.Request.HasJsonContentType())
    {
        context.Response.StatusCode = StatusCodes.Status415UnsupportedMediaType;
        await context.Response.WriteAsJsonAsync(new { error = "This action requires a JSON request." });
        return;
    }
    try { await next(); }
    catch (Exception ex) when (!context.Response.HasStarted)
    {
        app.Logger.LogWarning("Request failed with {ErrorType}.", ex.GetType().Name);
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new { error = "JackPeek could not complete the request. Check local storage permissions and try again." });
    }
});

app.MapGet("/", () => ServeEmbeddedWebFile("index.html"));
app.MapGet("/privacy", () => ServeEmbeddedWebFile("privacy.html"));
app.MapGet("/terms", () => ServeEmbeddedWebFile("terms.html"));
app.MapGet("/{fileName:regex(^[a-zA-Z0-9_.-]+$)}", (string fileName) => ServeEmbeddedWebFile(fileName));
app.MapGet("/assets/{fileName:regex(^[a-zA-Z0-9_.-]+$)}", (string fileName) => ServeEmbeddedWebFile($"assets/{fileName}"));

app.MapGet("/api/adapters", (WindowsAdapterService windows, PassiveCaptureService capture) =>
{
    var adapters = windows.GetAdapters();
    return Results.Ok(capture.GetCaptureDevices(adapters));
});

app.MapGet("/api/session", (WindowsIdentityService identity, EvidenceStore evidence, LicenseService licenses, AdminService admin) =>
{
    var settings = evidence.GetSettings();
    return Results.Ok(new
    {
        workstation = identity.Capture(settings.IncludeWindowsUser),
        settings,
        license = licenses.GetStatus(),
        admin = admin.GetStatus(),
        pendingCache = evidence.ListPendingCache()
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
        audit.Write("license.import", "failed", detail: ex.GetType().Name);
        return Results.BadRequest(new { error = "The license could not be imported. Check its format, signature, validity dates, and workstation assignment." });
    }
});

app.MapGet("/api/evidence/settings", (EvidenceStore evidence) => Results.Ok(evidence.GetSettings()));

app.MapPost("/api/evidence/settings", (EvidenceSettingsUpdate request, HttpRequest http, EvidenceStore evidence, AdminService admin, AuditLog audit) =>
{
    try
    {
        var adminStatus = admin.GetStatus();
        var adminUnlocked = adminStatus.IsConfigured && admin.ValidateToken(http.Headers["x-jackpeek-admin"].FirstOrDefault());
        if (adminStatus.IsConfigured && !adminUnlocked)
        {
            audit.Write("settings.update", "blocked", detail: "admin unlock required");
            return Results.StatusCode(StatusCodes.Status403Forbidden);
        }

        var settings = evidence.SaveSettings(request, adminUnlocked);
        audit.Write("settings.update", "success");
        return Results.Ok(settings);
    }
    catch (Exception ex)
    {
        audit.Write("settings.update", "failed", detail: ex.GetType().Name);
        return Results.BadRequest(new { error = ex is InvalidOperationException ? ex.Message : "Settings could not be saved. Check folder paths, permissions, and free disk space." });
    }
});

app.MapGet("/api/evidence/cache", (EvidenceStore evidence) => Results.Ok(evidence.ListPendingCache()));

app.MapPost("/api/evidence/sync", (HttpRequest http, EvidenceStore evidence, AdminService admin, AuditLog audit) =>
{
    var adminStatus = admin.GetStatus();
    if (adminStatus.IsConfigured && !admin.ValidateToken(http.Headers["x-jackpeek-admin"].FirstOrDefault()))
    {
        audit.Write("evidence.cache.sync", "blocked", detail: "admin unlock required");
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    var result = evidence.SyncPendingCache();
    audit.Write("evidence.cache.sync", result.Failed == 0 ? "success" : "partial", detail: $"pending={result.PendingBefore}; uploaded={result.Uploaded}; deletedExpired={result.DeletedExpired}; failed={result.Failed}; lastError={result.LastError}");
    return Results.Ok(result);
});

app.MapGet("/api/admin/status", (AdminService admin) => Results.Ok(admin.GetStatus()));

app.MapPost("/api/admin/unlock", (AdminUnlockRequest request, AdminService admin, AuditLog audit) =>
{
    var result = admin.Unlock(request.Password);
    audit.Write("admin.unlock", result.Unlocked ? "success" : "failed");
    return result.Unlocked ? Results.Ok(result) : Results.Unauthorized();
});

app.MapPost("/api/admin/password", (AdminPasswordRequest request, AdminService admin, AuditLog audit) =>
{
    try
    {
        admin.SetPassword(request.CurrentPassword, request.NewPassword);
        audit.Write("admin.password", "success");
        return Results.Ok(new { message = "Admin password saved." });
    }
    catch (Exception ex)
    {
        audit.Write("admin.password", "failed", detail: ex.GetType().Name);
        return Results.BadRequest(new { error = ex is InvalidOperationException ? ex.Message : "Admin password could not be saved." });
    }
});

app.MapGet("/api/reports", (EvidenceStore evidence) => Results.Ok(evidence.ListReports()));

app.MapGet("/api/ports/log", (PortLedgerStore ledger) => Results.Ok(ledger.List()));

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

    return Results.File(EvidenceExport.Json(record), "application/json", $"jackpeek-evidence-{evidenceId}.json");
});

app.MapGet("/api/reports/{evidenceId}/csv", (string evidenceId, EvidenceStore evidence, AuditLog audit) =>
{
    var record = evidence.TryReadRecord(evidenceId);
    if (record is null) return Results.NotFound(new { error = "Report not found." });
    audit.Write("evidence.export", "success", evidenceId, "csv");
    return Results.File(EvidenceExport.Csv(record), "text/csv", $"jackpeek-evidence-{evidenceId}.csv");
});

app.MapGet("/api/reports/{evidenceId}/package", (string evidenceId, EvidenceStore evidence, AuditLog audit) =>
{
    var record = evidence.TryReadRecord(evidenceId);
    if (record is null) return Results.NotFound(new { error = "Report not found." });
    var package = EvidenceExport.Package(record, evidence.BuildHtmlReport(record));
    audit.Write("evidence.export", "success", evidenceId, "package");
    return Results.File(package, "application/zip", $"jackpeek-evidence-{evidenceId}.zip");
});

app.MapGet("/reports/{evidenceId}.html", (string evidenceId, EvidenceStore evidence) =>
{
    var record = evidence.TryReadRecord(evidenceId);
    return record is null
        ? Results.NotFound(new { error = "Report not found." })
        : Results.Text(evidence.BuildHtmlReport(record), "text/html; charset=utf-8");
});

app.MapPost("/api/scans", (ScanRequest request, ScanRegistry scans, PassiveCaptureService capture, EvidenceStore evidence, PortLedgerStore ledger, LicenseService licenses, AuditLog audit, WindowsAdapterService windows) =>
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

    if (!windows.GetAdapters().Any(adapter => string.Equals(adapter.Id, request.AdapterId, StringComparison.OrdinalIgnoreCase)))
    {
        return Results.BadRequest(new { error = "Select a physical wired Ethernet adapter from the current adapter list." });
    }

    var scanId = Guid.NewGuid().ToString("n");
    audit.Write("capture.start", "accepted", scanId, request.AdapterId);
    if (!scans.TryStart(scanId))
    {
        return Results.Conflict(new { error = "Another capture is running. Wait for it to finish before starting a new capture." });
    }
    _ = Task.Run(async () =>
    {
        var seconds = Math.Clamp(request.DurationSeconds ?? 30, 5, settings.MaxCaptureDurationSeconds);
        ScanResult result;
        try
        {
            result = await capture.ScanAsync(scanId, request.AdapterId, TimeSpan.FromSeconds(seconds), app.Lifetime.ApplicationStopping);
        }
        catch (Exception ex)
        {
            app.Logger.LogWarning("Capture failed with {ErrorType}.", ex.GetType().Name);
            result = new ScanResult(scanId, request.AdapterId, DateTimeOffset.Now, DateTimeOffset.Now, 0, [],
                "Capture could not complete. Refresh adapters and check Npcap access before retrying.");
        }
        EvidenceSummary? summary = null;
        string? error = result.Error;
        try
        {
            var saved = evidence.SaveScan(result);
            summary = saved.Summary;
            if (summary.AdminReviewRequired)
            {
                audit.Write("switch.identity.review", "admin-review-required", summary.EvidenceId, summary.AdminReviewReason);
            }
            var ledgerResult = ledger.Save(saved.Record);
            audit.Write("port-log.write", "success", scanId, $"{ledgerResult.EntriesWritten} entries");
            if (ledgerResult.MirrorFailures > 0)
            {
                audit.Write("port-log.mirror", "failed", scanId, $"{ledgerResult.MirrorFailures} entries");
            }
        }
        catch (Exception ex)
        {
            app.Logger.LogWarning("Evidence save failed with {ErrorType}.", ex.GetType().Name);
            error = string.IsNullOrWhiteSpace(error)
                ? "Capture completed, but evidence could not be saved. Check history folder permissions and free disk space."
                : $"{error} Evidence could not be saved. Check history folder permissions and free disk space.";
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

    using var buffer = new MemoryStream();
    stream.CopyTo(buffer);
    return Results.File(buffer.ToArray(), contentType);
}

public sealed record ScanRequest(string AdapterId, int? DurationSeconds);

public sealed record ScanStatus(string ScanId, string State, ScanResult? Result, EvidenceSummary? Evidence, string? Error);

public sealed class ScanRegistry
{
    private readonly ConcurrentDictionary<string, ScanStatus> _scans = new();
    private readonly object _gate = new();
    private string? _runningId;
    public bool TryStart(string scanId)
    {
        lock (_gate)
        {
            if (_runningId is not null) return false;
            // Retain only a bounded number of completed in-memory results.
            if (_scans.Count >= 100) _scans.Clear();
            _runningId = scanId;
            _scans[scanId] = new ScanStatus(scanId, "running", null, null, null);
            return true;
        }
    }
    public void Set(string scanId, ScanStatus status)
    {
        lock (_gate)
        {
            _scans[scanId] = status;
            if (status.State == "complete" && _runningId == scanId) _runningId = null;
        }
    }
    public bool TryGet(string scanId, out ScanStatus? status) => _scans.TryGetValue(scanId, out status);
}
