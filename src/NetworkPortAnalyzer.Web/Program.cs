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
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;

var appRoot = AppContext.BaseDirectory;
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = appRoot,
    WebRootPath = appRoot
});
var requestedPort = ReadPort(args) ?? 0;
builder.WebHost.UseKestrel(o =>
{
    o.Listen(IPAddress.Loopback, requestedPort);
    o.Limits.MaxRequestBodySize = 1024 * 1024;
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("admin-auth", limiter =>
    {
        limiter.PermitLimit = 10;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
    });
});

builder.Services.AddSingleton<WindowsAdapterService>();
builder.Services.AddSingleton<WindowsIdentityService>();
builder.Services.AddSingleton<PassiveCaptureService>();
builder.Services.AddSingleton<ScanRegistry>();
builder.Services.AddSingleton<EvidenceStore>();
builder.Services.AddSingleton<PortLedgerStore>();
builder.Services.AddSingleton<LicenseService>();
builder.Services.AddSingleton<AuditLog>();
builder.Services.AddSingleton<AdminService>();
builder.Services.AddSingleton<AdminReviewStore>();
builder.Services.AddSingleton<TechnicalReviewService>();
builder.Services.AddSingleton<AccessPolicyService>();
builder.Services.AddHostedService<EvidenceSyncService>();

var app = builder.Build();

// Local browser requests must remain on the literal loopback origin. This also
// rejects DNS-rebinding hostnames and cross-origin form submissions.
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";
    context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
    var resourcePath = context.Request.Path.Value ?? "";
    context.Response.Headers.CacheControl =
        resourcePath.EndsWith(".css", StringComparison.OrdinalIgnoreCase) ||
        resourcePath.EndsWith(".js", StringComparison.OrdinalIgnoreCase) ||
        resourcePath.StartsWith("/assets/", StringComparison.OrdinalIgnoreCase)
            ? "private, max-age=0, must-revalidate" : "no-store";
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

app.UseRouting();
app.UseRateLimiter();

// A browser session is required for capture and saved evidence. Sign-in and
// administrator recovery stay reachable even when the Windows account is denied.
app.Use(async (context, next) =>
{
    var path = context.Request.Path.Value ?? "";
    var publicApi = path is "/api/session" or "/api/access/login" or "/api/access/profile" or "/api/access/logout"
        or "/api/admin/status" or "/api/admin/unlock" or "/api/admin/password";
    if ((path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase) && !publicApi) || path.StartsWith("/reports/", StringComparison.OrdinalIgnoreCase))
    {
        var admin = context.RequestServices.GetRequiredService<AdminService>();
        var access = context.RequestServices.GetRequiredService<AccessPolicyService>();
        var identity = context.RequestServices.GetRequiredService<WindowsIdentityService>().Capture(true);
        var adminValid = admin.ValidateToken(context.Request.Cookies["jackpeek-admin"] ?? context.Request.Headers["x-jackpeek-admin"].FirstOrDefault());
        if (!adminValid && !access.ValidateSession(context.Request.Cookies["jackpeek-session"], identity))
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new { error = "Sign in to continue." });
            return;
        }
    }
    await next();
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

app.MapGet("/api/adapters/{adapterId}/traffic", (string adapterId, WindowsAdapterService windows) =>
    windows.GetTrafficSnapshot(adapterId) is { } snapshot
        ? Results.Ok(snapshot)
        : Results.NotFound(new { error = "Traffic counters are unavailable for the selected wired adapter." }));

app.MapGet("/api/session", (HttpRequest http, WindowsIdentityService identity, EvidenceStore evidence, LicenseService licenses, AdminService admin, AccessPolicyService access) =>
{
    var settings = evidence.GetSettings();
    var accessIdentity = identity.Capture(includeWindowsUser: true);
    var userSignedIn = access.ValidateSession(http.Cookies["jackpeek-session"], accessIdentity);
    var adminUnlocked = !userSignedIn && admin.ValidateToken(http.Cookies["jackpeek-admin"]);
    var signedIn = adminUnlocked || userSignedIn;
    return Results.Ok(new
    {
        workstation = access.Enrich(identity.Capture(settings.IncludeWindowsUser)),
        settings = signedIn ? settings : null,
        license = signedIn ? licenses.GetStatus() : null,
        admin = admin.GetStatus() with { IsUnlocked = adminUnlocked },
        pendingCache = signedIn ? evidence.ListPendingCache() : [],
        access = access.Evaluate(accessIdentity)
    });
});

app.MapPost("/api/access/login", (HttpRequest request, HttpResponse response, WindowsIdentityService identity, AccessPolicyService access, AdminService admin, AuditLog audit) =>
{
    // Choosing Windows sign-in ends any existing administrator session.
    admin.Lock(request.Cookies["jackpeek-admin"]);
    response.Cookies.Delete("jackpeek-admin");
    var workstation = identity.Capture(true);
    var status = access.Evaluate(workstation);
    var token = access.SignIn(workstation);
    if (token is not null) response.Cookies.Append("jackpeek-session", token, SessionCookie());
    audit.Write("access.login", token is not null ? "success" : status.IsApproved ? "profile-required" : "denied");
    return Results.Ok(status);
});
app.MapPost("/api/access/profile", (ProfileRequest request, WindowsIdentityService identity, AccessPolicyService access) =>
{
    try { access.RegisterName(identity.Capture(true), request.FirstName, request.LastName); return Results.Ok(new { message = "Name saved." }); }
    catch (InvalidOperationException ex) { return Results.BadRequest(new { error = ex.Message }); }
});
app.MapPost("/api/access/logout", (HttpRequest request, HttpResponse response, AccessPolicyService access, AdminService admin) =>
{
    access.SignOut(request.Cookies["jackpeek-session"]);
    admin.Lock(request.Cookies["jackpeek-admin"]);
    response.Cookies.Delete("jackpeek-session");
    response.Cookies.Delete("jackpeek-admin");
    return Results.Ok(new { message = "Signed out." });
});
app.MapGet("/api/admin/accounts", (HttpRequest http, AdminService admin, AccessPolicyService access) =>
    admin.ValidateToken(http.Cookies["jackpeek-admin"] ?? http.Headers["x-jackpeek-admin"].FirstOrDefault())
        ? Results.Ok(access.List()) : Results.StatusCode(403));
app.MapPost("/api/admin/accounts", (AccountApprovalRequest request, HttpRequest http, AdminService admin, AccessPolicyService access, AuditLog audit) =>
{
    if (!admin.ValidateToken(http.Cookies["jackpeek-admin"] ?? http.Headers["x-jackpeek-admin"].FirstOrDefault())) return Results.StatusCode(403);
    try
    {
        var account = access.SetApproval(request.Account, request.Enabled);
        audit.Write("account.approval", request.Enabled ? "approved" : "disabled", detail: account.Account);
        return Results.Ok(account);
    }
    catch (InvalidOperationException ex) { return Results.BadRequest(new { error = ex.Message }); }
});

bool IsAdmin(HttpRequest http, AdminService admin) => admin.ValidateToken(http.Cookies["jackpeek-admin"] ?? http.Headers["x-jackpeek-admin"].FirstOrDefault());
app.MapGet("/api/admin/technical-review", (HttpRequest http, AdminService admin, TechnicalReviewService review) =>
    IsAdmin(http, admin) ? Results.Ok(review.Read()) : Results.StatusCode(403));
app.MapGet("/api/admin/technical-review/export", (HttpRequest http, AdminService admin, TechnicalReviewService review, AuditLog audit) =>
{
    if (!IsAdmin(http, admin)) return Results.StatusCode(403);
    var package = review.Export();
    audit.Write("technical-review.export", "success");
    return Results.File(package, "application/zip", "JackPeek-Technical-Review.zip");
});
app.MapGet("/api/admin/reviews", (HttpRequest http, AdminService admin, AdminReviewStore reviews) => IsAdmin(http, admin) ? Results.Ok(reviews.List()) : Results.StatusCode(403));
app.MapGet("/api/admin/reviews/{evidenceId}", (string evidenceId, HttpRequest http, AdminService admin, AdminReviewStore reviews, EvidenceStore evidence) =>
    !IsAdmin(http, admin) ? Results.StatusCode(403) : reviews.Find(evidenceId) is { } item && evidence.TryReadRecord(evidenceId) is { } record ? Results.Ok(new { item, record }) : Results.NotFound(new { error = "Review not found." }));
app.MapPost("/api/admin/reviews/{evidenceId}/decision", (string evidenceId, AdminReviewDecisionRequest request, HttpRequest http, AdminService admin, AdminReviewStore reviews, AuditLog audit, WindowsIdentityService identity) =>
{
    if (!IsAdmin(http, admin)) return Results.StatusCode(403);
    try
    {
        var workstation = identity.Capture(true);
        var administrator = workstation.DisplayName ?? workstation.UserName ?? "Administrator";
        var decision = reviews.SaveDecision(evidenceId, request.Status, request.Comment, administrator);
        audit.Write("admin.review.decision", decision.Status, evidenceId, decision.Comment);
        return Results.Ok(decision);
    }
    catch (InvalidOperationException ex) { return Results.BadRequest(new { error = ex.Message }); }
});
app.MapPost("/api/admin/reviews/sync", (HttpRequest http, AdminService admin, EvidenceStore evidence, AuditLog audit) =>
{
    if (!IsAdmin(http, admin)) return Results.StatusCode(403);
    var result = evidence.SyncPendingCache();
    audit.Write("admin.review.sync", result.Failed == 0 ? "success" : "partial", detail: $"uploaded={result.Uploaded}; failed={result.Failed}");
    return Results.Ok(result);
});

app.MapGet("/api/license", (LicenseService licenses) => Results.Ok(licenses.GetStatus()));

app.MapPost("/api/license/import", async (HttpRequest request, LicenseService licenses, AuditLog audit, AdminService admin) =>
{
    if (!IsAdmin(request, admin)) return Results.StatusCode(403);
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
        var adminUnlocked = adminStatus.IsConfigured && admin.ValidateToken(http.Cookies["jackpeek-admin"] ?? http.Headers["x-jackpeek-admin"].FirstOrDefault());
        if (!adminUnlocked)
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
    if (adminStatus.IsConfigured && !admin.ValidateToken(http.Cookies["jackpeek-admin"] ?? http.Headers["x-jackpeek-admin"].FirstOrDefault()))
    {
        audit.Write("evidence.cache.sync", "blocked", detail: "admin unlock required");
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    var result = evidence.SyncPendingCache();
    audit.Write("evidence.cache.sync", result.Failed == 0 ? "success" : "partial", detail: $"pending={result.PendingBefore}; uploaded={result.Uploaded}; deletedExpired={result.DeletedExpired}; failed={result.Failed}; lastError={result.LastError}");
    return Results.Ok(result);
});

app.MapGet("/api/admin/status", (AdminService admin) => Results.Ok(admin.GetStatus()));

app.MapPost("/api/admin/unlock", (AdminUnlockRequest request, HttpResponse response, AdminService admin, AuditLog audit) =>
{
    var result = admin.Unlock(request.Password);
    if (result.Unlocked) response.Cookies.Append("jackpeek-admin", result.Token!, SessionCookie());
    audit.Write("admin.unlock", result.Unlocked ? "success" : "failed");
    return result.Unlocked ? Results.Ok(new { result.Unlocked, result.Message }) : Results.Unauthorized();
}).RequireRateLimiting("admin-auth");

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
}).RequireRateLimiting("admin-auth");

app.MapGet("/api/reports", (EvidenceStore evidence) => Results.Ok(evidence.ListReports()));

app.MapGet("/api/ports/log", (PortLedgerStore ledger) => Results.Ok(ledger.List()));
app.MapGet("/api/ports/history", (string? switchName, string? chassisId, string port, string? excludeEvidenceId, DateTimeOffset? before, PortLedgerStore ledger) =>
    Results.Ok(ledger.History(switchName, chassisId, port, excludeEvidenceId, before)));

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

app.MapPost("/api/scans", (ScanRequest request, ScanRegistry scans, PassiveCaptureService capture, EvidenceStore evidence, PortLedgerStore ledger, LicenseService licenses, AuditLog audit, WindowsAdapterService windows, WindowsIdentityService identity, AccessPolicyService access) =>
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

    var scanner = access.Enrich(identity.Capture(settings.IncludeWindowsUser));
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
            var saved = evidence.SaveScan(result, scanner);
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

        scans.Set(scanId, new ScanStatus(scanId, "complete", result, summary, error, PortSnapshots.FromScan(result)));
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

static CookieOptions SessionCookie() => new() { HttpOnly = true, SameSite = SameSiteMode.Strict, Path = "/", IsEssential = true };

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
public sealed record AdminReviewDecisionRequest(string Status, string? Comment);

public sealed record ScanStatus(string ScanId, string State, ScanResult? Result, EvidenceSummary? Evidence, string? Error, IReadOnlyList<PortSnapshot>? Ports = null);

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
