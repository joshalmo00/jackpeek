using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using NetworkPortAnalyzer.Core;
using NetworkPortAnalyzer.Windows;

namespace NetworkPortAnalyzer.Web;

public sealed class EvidenceStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly string _settingsPath;
    private readonly WindowsIdentityService _identity;

    public EvidenceStore(WindowsIdentityService identity)
    {
        _identity = identity;
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var root = Path.Combine(appData, "JackPeek");
        Directory.CreateDirectory(root);
        _settingsPath = Path.Combine(root, "settings.json");
    }

    public EvidenceSettings GetSettings()
    {
        if (!File.Exists(_settingsPath))
        {
            return DefaultSettings();
        }

        try
        {
            var raw = File.ReadAllText(_settingsPath);
            var settings = JsonSerializer.Deserialize<EvidenceSettings>(raw, JsonOptions) ?? DefaultSettings();
            if (!raw.Contains("\"allowSettingsEdit\"", StringComparison.OrdinalIgnoreCase))
            {
                settings = settings with { AllowSettingsEdit = true };
            }

            if (!raw.Contains("\"requireValidLicense\"", StringComparison.OrdinalIgnoreCase))
            {
                settings = settings with
                {
                    RequireValidLicense = false,
                    RequireEvidenceEncryption = false,
                    EvidenceRetentionDays = 0,
                    AllowEvidenceDeletion = false,
                    AllowNasMirror = true,
                    AllowedExportFormats = DefaultExportFormats()
                };
            }

            return Normalize(settings);
        }
        catch
        {
            return DefaultSettings();
        }
    }

    public EvidenceSettings SaveSettings(EvidenceSettingsUpdate update)
    {
        var current = GetSettings();
        if (!current.AllowSettingsEdit)
        {
            throw new InvalidOperationException("Enterprise policy does not allow settings changes on this workstation.");
        }

        var next = Normalize(new EvidenceSettings(
            update.SecureMode ?? current.SecureMode,
            update.IncludeWindowsUser ?? current.IncludeWindowsUser,
            string.IsNullOrWhiteSpace(update.LocalHistoryPath) ? current.LocalHistoryPath : update.LocalHistoryPath.Trim(),
            string.IsNullOrWhiteSpace(update.ArchiveMirrorPath) ? null : update.ArchiveMirrorPath.Trim(),
            update.MaxCaptureDurationSeconds ?? current.MaxCaptureDurationSeconds,
            update.AllowSettingsEdit ?? current.AllowSettingsEdit,
            update.RequireValidLicense ?? current.RequireValidLicense,
            update.RequireEvidenceEncryption ?? current.RequireEvidenceEncryption,
            update.EvidenceRetentionDays ?? current.EvidenceRetentionDays,
            update.AllowEvidenceDeletion ?? current.AllowEvidenceDeletion,
            update.AllowNasMirror ?? current.AllowNasMirror,
            update.AllowedExportFormats ?? current.AllowedExportFormats));

        EnsureFullyQualifiedPath(next.LocalHistoryPath, "Local history path");
        if (!string.IsNullOrWhiteSpace(next.ArchiveMirrorPath))
        {
            EnsureFullyQualifiedPath(next.ArchiveMirrorPath, "Archive mirror path");
        }

        Directory.CreateDirectory(next.LocalHistoryPath);
        if (next.AllowNasMirror && !string.IsNullOrWhiteSpace(next.ArchiveMirrorPath))
        {
            Directory.CreateDirectory(next.ArchiveMirrorPath);
        }

        File.WriteAllText(_settingsPath, JsonSerializer.Serialize(next, JsonOptions));
        return next;
    }

    public EvidenceSummary SaveScan(ScanResult scan)
    {
        var settings = GetSettings();
        Directory.CreateDirectory(settings.LocalHistoryPath);
        ApplyRetention(settings);

        var createdAt = DateTimeOffset.Now;
        var workstation = _identity.Capture(settings.IncludeWindowsUser);
        var unsigned = new EvidenceRecord(scan.ScanId, createdAt, workstation, settings, scan, string.Empty);
        var hash = Sha256(JsonSerializer.Serialize(unsigned, JsonOptions));
        var record = unsigned with { Sha256 = hash };
        var fileName = $"{createdAt:yyyyMMdd-HHmmss}-{scan.ScanId}.json";
        var localPath = Path.Combine(settings.LocalHistoryPath, settings.RequireEvidenceEncryption ? fileName + ".dpapi" : fileName);
        WriteRecord(localPath, record, settings.RequireEvidenceEncryption);

        string? mirrorPath = null;
        if (settings.AllowNasMirror && !string.IsNullOrWhiteSpace(settings.ArchiveMirrorPath))
        {
            try
            {
                Directory.CreateDirectory(settings.ArchiveMirrorPath);
                mirrorPath = Path.Combine(settings.ArchiveMirrorPath, Path.GetFileName(localPath));
                File.Copy(localPath, mirrorPath, true);
            }
            catch
            {
                mirrorPath = null;
            }
        }

        return ToSummary(record, localPath, mirrorPath);
    }

    public IReadOnlyList<EvidenceSummary> ListReports()
    {
        var settings = GetSettings();
        if (!Directory.Exists(settings.LocalHistoryPath))
        {
            return [];
        }

        return Directory.EnumerateFiles(settings.LocalHistoryPath, "*.json*")
            .Select(TryReadSummary)
            .Where(summary => summary is not null)
            .Select(summary => summary!)
            .OrderByDescending(summary => summary.CreatedAt)
            .Take(100)
            .ToArray();
    }

    public EvidenceRecord? TryReadRecord(string evidenceId)
    {
        if (string.IsNullOrWhiteSpace(evidenceId) || !evidenceId.All(char.IsLetterOrDigit))
        {
            return null;
        }

        var settings = GetSettings();
        if (!Directory.Exists(settings.LocalHistoryPath))
        {
            return null;
        }

        var path = Directory.EnumerateFiles(settings.LocalHistoryPath, $"*-{evidenceId}.json*").FirstOrDefault();
        if (path is null)
        {
            return null;
        }

        return ReadRecord(path);
    }

    public bool Verify(EvidenceRecord record)
    {
        var unsigned = record with { Sha256 = string.Empty };
        var expected = Sha256(JsonSerializer.Serialize(unsigned, JsonOptions));
        return string.Equals(expected, record.Sha256, StringComparison.OrdinalIgnoreCase);
    }

    public bool Delete(string evidenceId)
    {
        var settings = GetSettings();
        if (!settings.AllowEvidenceDeletion || !evidenceId.All(char.IsLetterOrDigit))
        {
            return false;
        }

        var paths = Directory.Exists(settings.LocalHistoryPath)
            ? Directory.EnumerateFiles(settings.LocalHistoryPath, $"*-{evidenceId}.json*").ToArray()
            : [];
        foreach (var path in paths)
        {
            File.Delete(path);
        }

        return paths.Length > 0;
    }

    public string BuildHtmlReport(EvidenceRecord record)
    {
        var latest = record.Scan.Observations.FirstOrDefault()?.Latest;
        var rows = record.Scan.Observations.Select(o =>
            $"<tr><td>{Html(o.Protocol)}</td><td>{Html(o.Latest.DeviceName ?? o.Latest.ChassisId ?? "Not advertised")}</td><td>{Html(o.Latest.PortDescription ?? o.Latest.PortId ?? "Not advertised")}</td><td>{Html(o.Latest.NativeVlan?.ToString() ?? "Not advertised")}</td><td>{Html(o.Latest.VoiceVlan?.ToString() ?? "Not advertised")}</td><td>{Html(o.FramesSeen.ToString())}</td></tr>");

        return $$"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>JackPeek Evidence {{Html(record.EvidenceId)}}</title>
  <style>
    body { font-family: "Cascadia Code", "Cascadia Mono", Consolas, monospace; color: #172027; font-size: 12px; margin: 28px; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin-top: 22px; }
    .muted { color: #63717f; font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 22px 0; }
    .box { border: 1px solid #d7e0e8; border-radius: 8px; padding: 12px; }
    .box span { color: #63717f; display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .box strong { display: block; font-size: 12px; margin-top: 4px; overflow-wrap: anywhere; }
    table { border-collapse: collapse; width: 100%; margin-top: 18px; }
    th, td { border-bottom: 1px solid #d7e0e8; padding: 8px; text-align: left; vertical-align: top; }
    th { font-size: 10px; text-transform: uppercase; color: #63717f; }
    pre { background: #152229; border: 1px solid #263942; border-radius: 6px; color: #e7f0f2; padding: 12px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>JackPeek Evidence Report</h1>
  <p class="muted">Passive LLDP/CDP capture. No switch login, SNMP, ping sweep, port scan, or probing was performed.</p>
  <div class="grid">
    <div class="box"><span>Evidence ID</span><strong>{{Html(record.EvidenceId)}}</strong></div>
    <div class="box"><span>SHA-256</span><strong>{{Html(record.Sha256)}}</strong></div>
    <div class="box"><span>Created</span><strong>{{Html(record.CreatedAt.ToString("u"))}}</strong></div>
    <div class="box"><span>Workstation</span><strong>{{Html(record.Workstation.MachineName)}}</strong></div>
    <div class="box"><span>Windows user</span><strong>{{Html(record.Workstation.UserName ?? "Not recorded")}}</strong></div>
    <div class="box"><span>Domain</span><strong>{{Html(record.Workstation.DomainName ?? "Not recorded")}}</strong></div>
    <div class="box"><span>Adapter</span><strong>{{Html(record.Scan.AdapterId)}}</strong></div>
    <div class="box"><span>Frames captured</span><strong>{{Html(record.Scan.FramesCaptured.ToString())}}</strong></div>
    <div class="box"><span>Nearest device</span><strong>{{Html(latest?.DeviceName ?? latest?.ChassisId ?? "Not observed")}}</strong></div>
    <div class="box"><span>Switch port</span><strong>{{Html(latest?.PortDescription ?? latest?.PortId ?? "Not observed")}}</strong></div>
  </div>
  <h2>Observed Neighbors</h2>
  <table>
    <thead><tr><th>Protocol</th><th>Device</th><th>Port</th><th>Native VLAN</th><th>Voice VLAN</th><th>Frames</th></tr></thead>
    <tbody>{{string.Join(Environment.NewLine, rows)}}</tbody>
  </table>
  <h2>Raw Evidence</h2>
  <pre>{{Html(JsonSerializer.Serialize(record, JsonOptions))}}</pre>
</body>
</html>
""";
    }

    private EvidenceSummary? TryReadSummary(string path)
    {
        try
        {
            var record = ReadRecord(path);
            return record is null ? null : ToSummary(record, path, null);
        }
        catch
        {
            return null;
        }
    }

    private EvidenceSummary ToSummary(EvidenceRecord record, string localPath, string? mirrorPath)
    {
        var latest = record.Scan.Observations.FirstOrDefault()?.Latest;
        return new EvidenceSummary(
            record.EvidenceId,
            record.CreatedAt,
            record.Workstation.MachineName,
            record.Workstation.UserName,
            record.Scan.AdapterId,
            latest?.DeviceName ?? latest?.ChassisId,
            latest?.PortDescription ?? latest?.PortId,
            record.Scan.FramesCaptured,
            record.Scan.Observations.Count,
            localPath,
            mirrorPath,
            record.Sha256);
    }

    private EvidenceSettings Normalize(EvidenceSettings settings)
    {
        var localPath = string.IsNullOrWhiteSpace(settings.LocalHistoryPath)
            ? DefaultHistoryPath()
            : settings.LocalHistoryPath.Trim();
        if (!Path.IsPathFullyQualified(localPath))
        {
            localPath = DefaultHistoryPath();
        }

        var archivePath = string.IsNullOrWhiteSpace(settings.ArchiveMirrorPath) ? null : settings.ArchiveMirrorPath.Trim();
        if (!string.IsNullOrWhiteSpace(archivePath) && !Path.IsPathFullyQualified(archivePath))
        {
            archivePath = null;
        }

        return settings with
        {
            LocalHistoryPath = localPath,
            ArchiveMirrorPath = archivePath,
            MaxCaptureDurationSeconds = Math.Clamp(settings.MaxCaptureDurationSeconds == 0 ? 30 : settings.MaxCaptureDurationSeconds, 5, 120),
            EvidenceRetentionDays = Math.Max(0, settings.EvidenceRetentionDays),
            AllowedExportFormats = settings.AllowedExportFormats is { Count: > 0 } ? settings.AllowedExportFormats : DefaultExportFormats()
        };
    }

    private EvidenceSettings DefaultSettings() => new(true, true, DefaultHistoryPath(), null, 120, true, false, false, 0, false, true, DefaultExportFormats());

    private static IReadOnlyList<string> DefaultExportFormats() => ["json", "html", "package"];

    private static string DefaultHistoryPath()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(appData, "JackPeek", "Evidence");
    }

    private static string Sha256(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static void EnsureFullyQualifiedPath(string path, string label)
    {
        if (!Path.IsPathFullyQualified(path))
        {
            throw new InvalidOperationException($"{label} must be a fully qualified local or UNC path.");
        }
    }

    private static string Html(string value) =>
        System.Net.WebUtility.HtmlEncode(value);

    private static void WriteRecord(string path, EvidenceRecord record, bool encrypted)
    {
        var json = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(record, JsonOptions));
        if (encrypted)
        {
            File.WriteAllBytes(path, ProtectedData.Protect(json, null, DataProtectionScope.CurrentUser));
            return;
        }

        File.WriteAllBytes(path, json);
    }

    private static EvidenceRecord? ReadRecord(string path)
    {
        var bytes = File.ReadAllBytes(path);
        if (path.EndsWith(".dpapi", StringComparison.OrdinalIgnoreCase))
        {
            bytes = ProtectedData.Unprotect(bytes, null, DataProtectionScope.CurrentUser);
        }

        return JsonSerializer.Deserialize<EvidenceRecord>(bytes, JsonOptions);
    }

    private static void ApplyRetention(EvidenceSettings settings)
    {
        if (settings.EvidenceRetentionDays <= 0 || !settings.AllowEvidenceDeletion || !Directory.Exists(settings.LocalHistoryPath))
        {
            return;
        }

        var cutoff = DateTimeOffset.Now.AddDays(-settings.EvidenceRetentionDays);
        foreach (var path in Directory.EnumerateFiles(settings.LocalHistoryPath, "*.json*"))
        {
            if (File.GetLastWriteTimeUtc(path) < cutoff.UtcDateTime)
            {
                File.Delete(path);
            }
        }
    }
}

public sealed record EvidenceSettingsUpdate(
    bool? SecureMode,
    bool? IncludeWindowsUser,
    string? LocalHistoryPath,
    string? ArchiveMirrorPath,
    int? MaxCaptureDurationSeconds,
    bool? AllowSettingsEdit,
    bool? RequireValidLicense,
    bool? RequireEvidenceEncryption,
    int? EvidenceRetentionDays,
    bool? AllowEvidenceDeletion,
    bool? AllowNasMirror,
    IReadOnlyList<string>? AllowedExportFormats);
