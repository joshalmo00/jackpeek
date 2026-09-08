using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using NetworkPortAnalyzer.Core;
using NetworkPortAnalyzer.Windows;

namespace NetworkPortAnalyzer.Web;

public sealed class EvidenceStore
{
    public const string StorageLocalAndNasMirror = "local-nas-mirror";
    public const string StorageNasOnlyWithCache = "nas-only-encrypted-cache";
    public const string StorageLocalOnly = "local-only";

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

            if (!raw.Contains("\"storageMode\"", StringComparison.OrdinalIgnoreCase))
            {
                settings = settings with
                {
                    StorageMode = StorageLocalAndNasMirror,
                    LocalCachePath = DefaultCachePath(),
                    CacheExpirationHours = 24,
                    CacheWarningHours = [3, 2],
                    NasSyncIntervalMinutes = 60,
                    AdminManagedCacheEncryption = true
                };
            }

            return Normalize(settings);
        }
        catch
        {
            return DefaultSettings();
        }
    }

    public EvidenceSettings SaveSettings(EvidenceSettingsUpdate update, bool force = false)
    {
        var current = GetSettings();
        if (!current.AllowSettingsEdit && !force)
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
            update.AllowedExportFormats ?? current.AllowedExportFormats,
            string.IsNullOrWhiteSpace(update.StorageMode) ? current.StorageMode : update.StorageMode.Trim(),
            string.IsNullOrWhiteSpace(update.LocalCachePath) ? current.LocalCachePath : update.LocalCachePath.Trim(),
            update.CacheExpirationHours ?? current.CacheExpirationHours,
            update.CacheWarningHours ?? current.CacheWarningHours,
            update.NasSyncIntervalMinutes ?? current.NasSyncIntervalMinutes,
            update.AdminManagedCacheEncryption ?? current.AdminManagedCacheEncryption));

        EnsureFullyQualifiedPath(next.LocalHistoryPath, "Local history path");
        EnsureFullyQualifiedPath(next.LocalCachePath, "Local cache path");
        if (next.StorageMode.Equals(StorageNasOnlyWithCache, StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(next.ArchiveMirrorPath))
        {
            throw new InvalidOperationException("NAS-only mode requires a fully qualified NAS / shared archive path.");
        }

        if (!string.IsNullOrWhiteSpace(next.ArchiveMirrorPath))
        {
            EnsureFullyQualifiedPath(next.ArchiveMirrorPath, "NAS / shared archive path");
        }

        if (!next.StorageMode.Equals(StorageNasOnlyWithCache, StringComparison.OrdinalIgnoreCase))
        {
            Directory.CreateDirectory(next.LocalHistoryPath);
        }

        Directory.CreateDirectory(next.LocalCachePath);

        WriteTextAtomic(_settingsPath, JsonSerializer.Serialize(next, JsonOptions));
        return next;
    }

    public EvidenceSummary SaveScan(ScanResult scan)
    {
        var settings = GetSettings();
        if (!settings.StorageMode.Equals(StorageNasOnlyWithCache, StringComparison.OrdinalIgnoreCase))
        {
            Directory.CreateDirectory(settings.LocalHistoryPath);
        }

        Directory.CreateDirectory(settings.LocalCachePath);
        ApplyRetention(settings);

        var createdAt = DateTimeOffset.Now;
        var workstation = _identity.Capture(settings.IncludeWindowsUser);
        var evidenceId = BuildEvidenceId(workstation.MachineName, scan.AdapterId);
        var result = scan with { ScanId = evidenceId };
        var unsigned = new EvidenceRecord(evidenceId, createdAt, workstation, settings, result, string.Empty);
        var hash = Sha256(JsonSerializer.Serialize(unsigned, JsonOptions));
        var record = unsigned with { Sha256 = hash };

        if (settings.StorageMode.Equals(StorageNasOnlyWithCache, StringComparison.OrdinalIgnoreCase))
        {
            var cachePath = BuildRecordPath(settings.LocalCachePath, record, encrypted: true);
            WriteRecord(cachePath, record, encrypted: true, useMachineScope: settings.AdminManagedCacheEncryption);
            var priorReview = FindPriorReview(record, settings);
            var mirrorPath = TryMirrorToNas(record, settings, priorReview, out _);
            if (mirrorPath is not null)
            {
                TryDelete(cachePath);
                return ToSummary(record, null, mirrorPath, "nas-synced", null, priorReview);
            }

            return ToSummary(record, cachePath, null, "pending-nas-sync", record.CreatedAt.AddHours(settings.CacheExpirationHours), priorReview);
        }

        var localEncrypted = settings.RequireEvidenceEncryption;
        var localPath = BuildRecordPath(settings.LocalHistoryPath, record, localEncrypted);
        WriteRecord(localPath, record, localEncrypted, useMachineScope: settings.AdminManagedCacheEncryption);

        string? archivePath = null;
        SwitchReviewMatch? archivePriorReview = null;
        if (settings.StorageMode.Equals(StorageLocalAndNasMirror, StringComparison.OrdinalIgnoreCase))
        {
            archivePriorReview = FindPriorReview(record, settings);
            archivePath = TryMirrorToNas(record, settings, archivePriorReview, out _);
        }

        return ToSummary(record, localPath, archivePath, archivePath is null ? "local-saved" : "local-and-nas-synced", null, archivePriorReview);
    }

    public IReadOnlyList<EvidenceSummary> ListReports()
    {
        var settings = GetSettings();
        var summaries = new List<EvidenceSummary>();

        AddSummaries(settings.LocalHistoryPath, summaries, "local-saved", null);
        AddSummaries(settings.LocalCachePath, summaries, "pending-nas-sync", settings);
        if (!string.IsNullOrWhiteSpace(settings.ArchiveMirrorPath))
        {
            AddSummaries(settings.ArchiveMirrorPath, summaries, "nas-synced", null);
        }

        return summaries
            .GroupBy(summary => summary.EvidenceId)
            .Select(group => group.OrderBy(summary => StorageRank(summary.StorageState)).First())
            .OrderByDescending(summary => summary.CreatedAt)
            .Take(100)
            .ToArray();
    }

    public IReadOnlyList<PendingEvidenceCacheItem> ListPendingCache()
    {
        var settings = GetSettings();
        if (!Directory.Exists(settings.LocalCachePath))
        {
            return [];
        }

        var now = DateTimeOffset.Now;
        return EnumerateEvidenceFiles(settings.LocalCachePath)
            .Select(path => TryReadPending(path, settings, now))
            .Where(item => item is not null)
            .Select(item => item!)
            .OrderBy(item => item.ExpiresAt)
            .ToArray();
    }

    public EvidenceSyncResult SyncPendingCache()
    {
        var settings = GetSettings();
        if (!Directory.Exists(settings.LocalCachePath))
        {
            return new EvidenceSyncResult(0, 0, 0, 0, null);
        }

        var pendingPaths = EnumerateEvidenceFiles(settings.LocalCachePath).ToArray();
        var uploaded = 0;
        var deleted = 0;
        var failed = 0;
        string? lastError = null;
        var now = DateTimeOffset.Now;

        foreach (var path in pendingPaths)
        {
            try
            {
                var record = ReadRecord(path);
                if (record is null)
                {
                    TryDelete(path);
                    deleted++;
                    continue;
                }

                if (record.CreatedAt.AddHours(settings.CacheExpirationHours) <= now)
                {
                    TryDelete(path);
                    deleted++;
                    continue;
                }

                var priorReview = FindPriorReview(record, settings);
                var mirrorPath = TryMirrorToNas(record, settings, priorReview, out var error);
                if (mirrorPath is null)
                {
                    failed++;
                    lastError = error;
                    continue;
                }

                TryDelete(path);
                uploaded++;
            }
            catch (Exception ex)
            {
                failed++;
                lastError = ex.Message;
            }
        }

        return new EvidenceSyncResult(pendingPaths.Length, uploaded, deleted, failed, lastError);
    }

    public EvidenceRecord? TryReadRecord(string evidenceId)
    {
        if (string.IsNullOrWhiteSpace(evidenceId) || !evidenceId.All(char.IsLetterOrDigit))
        {
            return null;
        }

        var settings = GetSettings();
        foreach (var root in new[] { settings.LocalHistoryPath, settings.LocalCachePath, settings.ArchiveMirrorPath })
        {
            if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
            {
                continue;
            }

            var path = EnumerateEvidenceFiles(root)
                .FirstOrDefault(file => Path.GetFileName(file).Contains(evidenceId, StringComparison.OrdinalIgnoreCase));
            if (path is not null)
            {
                return ReadRecord(path);
            }
        }

        return null;
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

        var paths = new[] { settings.LocalHistoryPath, settings.LocalCachePath }
            .Where(path => Directory.Exists(path))
            .SelectMany(EnumerateEvidenceFiles)
            .Where(path => Path.GetFileName(path).Contains(evidenceId, StringComparison.OrdinalIgnoreCase))
            .ToArray();

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
    <div class="box"><span>Storage mode</span><strong>{{Html(record.Settings.StorageMode)}}</strong></div>
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

    private void AddSummaries(string? root, List<EvidenceSummary> summaries, string state, EvidenceSettings? settings)
    {
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
        {
            return;
        }

        foreach (var path in EnumerateEvidenceFiles(root))
        {
            var summary = TryReadSummary(path, state, settings);
            if (summary is not null)
            {
                summaries.Add(summary);
            }
        }
    }

    private EvidenceSummary? TryReadSummary(string path, string state, EvidenceSettings? settings)
    {
        try
        {
            var record = ReadRecord(path);
            if (record is null)
            {
                return null;
            }

            var expiresAt = state == "pending-nas-sync"
                ? record.CreatedAt.AddHours(settings?.CacheExpirationHours ?? 24)
                : (DateTimeOffset?)null;
            return ToSummary(record, state == "nas-synced" ? null : path, state == "nas-synced" ? path : null, state, expiresAt, null);
        }
        catch
        {
            return null;
        }
    }

    private PendingEvidenceCacheItem? TryReadPending(string path, EvidenceSettings settings, DateTimeOffset now)
    {
        try
        {
            var record = ReadRecord(path);
            if (record is null)
            {
                return null;
            }

            var expiresAt = record.CreatedAt.AddHours(settings.CacheExpirationHours);
            var hoursUntilExpiration = Math.Max(0, (int)Math.Ceiling((expiresAt - now).TotalHours));
            var warningDue = settings.CacheWarningHours.Any(hour => hoursUntilExpiration <= hour);
            return new PendingEvidenceCacheItem(record.EvidenceId, record.CreatedAt, expiresAt, hoursUntilExpiration, warningDue, path, record.Sha256);
        }
        catch
        {
            return null;
        }
    }

    private EvidenceSummary ToSummary(EvidenceRecord record, string? localPath, string? mirrorPath, string state, DateTimeOffset? cacheExpiresAt, SwitchReviewMatch? priorReview)
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
            record.Sha256,
            state,
            cacheExpiresAt,
            priorReview is not null,
            priorReview?.Record.CreatedAt,
            priorReview?.Record.EvidenceId,
            priorReview?.Score ?? 0,
            priorReview is not null && (!priorReview.ContinueHistory || priorReview.Score < 3),
            priorReview?.Reason);
    }

    private string? TryMirrorToNas(EvidenceRecord record, EvidenceSettings settings, SwitchReviewMatch? priorReview, out string? error)
    {
        error = null;
        if (!settings.AllowNasMirror || string.IsNullOrWhiteSpace(settings.ArchiveMirrorPath))
        {
            return null;
        }

        try
        {
            var destination = BuildNasRecordPath(settings.ArchiveMirrorPath, record, priorReview?.ContinueHistory == true ? priorReview.Record : null);
            WriteRecord(destination, record, encrypted: false, useMachineScope: false);
            WriteNasSidecars(destination, record, priorReview);
            var written = ReadRecord(destination);
            if (written is null || !Verify(written))
            {
                TryDelete(destination);
                error = "NAS evidence hash verification failed.";
                return null;
            }

            return destination;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return null;
        }
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

        var cachePath = string.IsNullOrWhiteSpace(settings.LocalCachePath)
            ? DefaultCachePath()
            : settings.LocalCachePath.Trim();
        if (!Path.IsPathFullyQualified(cachePath))
        {
            cachePath = DefaultCachePath();
        }

        var archivePath = string.IsNullOrWhiteSpace(settings.ArchiveMirrorPath) ? null : settings.ArchiveMirrorPath.Trim();
        if (!string.IsNullOrWhiteSpace(archivePath) && !Path.IsPathFullyQualified(archivePath))
        {
            archivePath = null;
        }

        var storageMode = settings.StorageMode switch
        {
            StorageNasOnlyWithCache => StorageNasOnlyWithCache,
            StorageLocalOnly => StorageLocalOnly,
            _ => StorageLocalAndNasMirror
        };

        return settings with
        {
            LocalHistoryPath = localPath,
            ArchiveMirrorPath = archivePath,
            MaxCaptureDurationSeconds = Math.Clamp(settings.MaxCaptureDurationSeconds == 0 ? 30 : settings.MaxCaptureDurationSeconds, 5, 120),
            EvidenceRetentionDays = Math.Max(0, settings.EvidenceRetentionDays),
            AllowedExportFormats = settings.AllowedExportFormats is { Count: > 0 } ? settings.AllowedExportFormats : DefaultExportFormats(),
            StorageMode = storageMode,
            LocalCachePath = cachePath,
            CacheExpirationHours = Math.Clamp(settings.CacheExpirationHours == 0 ? 24 : settings.CacheExpirationHours, 1, 168),
            CacheWarningHours = settings.CacheWarningHours is { Count: > 0 } ? settings.CacheWarningHours.Where(hour => hour > 0).Distinct().OrderDescending().ToArray() : [3, 2],
            NasSyncIntervalMinutes = Math.Clamp(settings.NasSyncIntervalMinutes == 0 ? 60 : settings.NasSyncIntervalMinutes, 5, 1440),
            AdminManagedCacheEncryption = settings.AdminManagedCacheEncryption
        };
    }

    private EvidenceSettings DefaultSettings() => new(
        true,
        true,
        DefaultHistoryPath(),
        null,
        120,
        true,
        false,
        false,
        0,
        false,
        true,
        DefaultExportFormats(),
        StorageLocalAndNasMirror,
        DefaultCachePath(),
        24,
        [3, 2],
        60,
        true);

    private static IReadOnlyList<string> DefaultExportFormats() => ["json", "html", "package"];

    private static string DefaultHistoryPath()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(appData, "JackPeek", "Evidence");
    }

    private static string DefaultCachePath()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(appData, "JackPeek", "PendingCache");
    }

    private static string BuildEvidenceId(string machineName, string adapterId)
    {
        var cleanMachine = CleanSegment(machineName);
        var cleanAdapter = CleanSegment(Sha256(adapterId)[..8]);
        return $"{cleanMachine}{DateTimeOffset.UtcNow:yyyyMMddHHmmssfff}{cleanAdapter}{RandomNumberGenerator.GetHexString(6).ToLowerInvariant()}";
    }

    private static string BuildRecordPath(string root, EvidenceRecord record, bool encrypted)
    {
        var machine = CleanSegment(record.Workstation.MachineName);
        var day = record.CreatedAt.ToString("yyyy-MM-dd");
        var folder = Path.Combine(root, machine, day);
        Directory.CreateDirectory(folder);
        var extension = encrypted ? ".json.dpapi" : ".json";
        var fileName = $"JP-{machine}-{record.CreatedAt:yyyyMMdd-HHmmss}-{record.EvidenceId}{extension}";
        return Path.Combine(folder, fileName);
    }

    private static string BuildNasRecordPath(string root, EvidenceRecord record, EvidenceRecord? folderAnchor)
    {
        var latest = record.Scan.Observations.FirstOrDefault()?.Latest;
        var anchorLatest = folderAnchor?.Scan.Observations.FirstOrDefault()?.Latest;
        var switchName = FolderSwitchIdentity(anchorLatest) ?? FolderSwitchIdentity(latest);
        var switchPort = latest?.PortDescription ?? latest?.PortId;
        var day = record.CreatedAt.ToString("yyyy-MM-dd");
        string folder;

        if (!string.IsNullOrWhiteSpace(switchName) && !string.IsNullOrWhiteSpace(switchPort))
        {
            folder = Path.Combine(root, "Switches", CleanFolderSegment(switchName), CleanFolderSegment(switchPort), day);
        }
        else
        {
            folder = Path.Combine(root, "Unresolved", CleanSegment(record.Workstation.MachineName), day);
        }

        Directory.CreateDirectory(folder);
        var machine = CleanSegment(record.Workstation.MachineName);
        var fileName = $"JP-{machine}-{record.CreatedAt:yyyyMMdd-HHmmss}-{record.EvidenceId}.json";
        return Path.Combine(folder, fileName);
    }

    private SwitchReviewMatch? FindPriorReview(EvidenceRecord current, EvidenceSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.ArchiveMirrorPath) || !Directory.Exists(settings.ArchiveMirrorPath))
        {
            return null;
        }

        var currentIdentity = SwitchIdentityParts(current);
        if (string.IsNullOrWhiteSpace(currentIdentity.Port))
        {
            return null;
        }

        return EnumerateEvidenceFiles(settings.ArchiveMirrorPath)
            .Select(path =>
            {
                try
                {
                    return ReadRecord(path);
                }
                catch
                {
                    return null;
                }
            })
            .Select(record => record is null || record.EvidenceId == current.EvidenceId ? null : BuildMatch(currentIdentity, record))
            .Where(match => match is not null && match.Score >= 1)
            .OrderByDescending(match => match!.Score)
            .ThenByDescending(match => match!.ContinueHistory)
            .ThenByDescending(match => match!.Record.CreatedAt)
            .FirstOrDefault();
    }

    private static SwitchReviewMatch? BuildMatch(SwitchIdentityParts current, EvidenceRecord prior)
    {
        var previous = SwitchIdentityParts(prior);
        var matched = new List<string>();
        var changed = new List<string>();
        CompareIdentity("name", current.Name, previous.Name, matched, changed);
        CompareIdentity("ip", current.ManagementIp, previous.ManagementIp, matched, changed);
        CompareIdentity("mac", current.ChassisId, previous.ChassisId, matched, changed);
        if (matched.Count < 1)
        {
            return null;
        }

        var samePort = Same(current.Port, previous.Port);
        var continueHistory = samePort && matched.Count >= 2;
        var reason = matched.Count switch
        {
            3 when samePort => "All switch identity fields and port matched.",
            1 => $"Single switch identity match ({string.Join("+", matched)}). New folder created; admin should verify before merging history.",
            _ when !samePort => $"Matched {string.Join("+", matched)}, but port changed or is missing. New folder created; admin should verify with networking.",
            _ => $"Matched {string.Join("+", matched)}; verify changed or missing {string.Join("+", changed)} with networking."
        };
        return new SwitchReviewMatch(prior, matched.Count, continueHistory, reason);
    }

    private static SwitchIdentityParts SwitchIdentityParts(EvidenceRecord record)
    {
        var packet = record.Scan.Observations.FirstOrDefault()?.Latest;
        return new SwitchIdentityParts(
            NormalizeIdentity(packet?.DeviceName),
            NormalizeIdentity(packet?.ManagementAddress),
            NormalizeIdentity(packet?.ChassisId),
            NormalizeIdentity(packet?.PortDescription ?? packet?.PortId));
    }

    private static string? FolderSwitchIdentity(ProtocolPacket? packet)
    {
        if (packet is null)
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(packet.DeviceName) && !string.IsNullOrWhiteSpace(packet.ManagementAddress))
        {
            return $"{packet.DeviceName}_{packet.ManagementAddress}";
        }

        return FirstNonEmpty(packet.DeviceName, packet.ManagementAddress, packet.ChassisId);
    }

    private static void CompareIdentity(string label, string? current, string? previous, List<string> matched, List<string> changed)
    {
        if (string.IsNullOrWhiteSpace(current) || string.IsNullOrWhiteSpace(previous))
        {
            changed.Add(label);
            return;
        }

        if (Same(current, previous))
        {
            matched.Add(label);
        }
        else
        {
            changed.Add(label);
        }
    }

    private static bool Same(string? left, string? right) =>
        !string.IsNullOrWhiteSpace(left) &&
        !string.IsNullOrWhiteSpace(right) &&
        string.Equals(NormalizeIdentity(left), NormalizeIdentity(right), StringComparison.OrdinalIgnoreCase);

    private static string? NormalizeIdentity(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToUpperInvariant();

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));

    private static string CleanSegment(string value)
    {
        var chars = value.Where(char.IsLetterOrDigit).Take(32).ToArray();
        return chars.Length == 0 ? "UNKNOWN" : new string(chars);
    }

    private static string CleanFolderSegment(string value)
    {
        var builder = new StringBuilder();
        foreach (var ch in value.Trim().Take(80))
        {
            builder.Append(char.IsLetterOrDigit(ch) ? ch : '_');
        }

        var clean = builder.ToString().Trim('_');
        return string.IsNullOrWhiteSpace(clean) ? "Unknown" : clean;
    }

    private static void WriteNasSidecars(string jsonPath, EvidenceRecord record, SwitchReviewMatch? priorReview)
    {
        var shaPath = Path.ChangeExtension(jsonPath, ".sha256");
        var indexPath = Path.Combine(Path.GetDirectoryName(jsonPath)!, "index.csv");
        WriteTextAtomic(shaPath, $"{record.Sha256}  {Path.GetFileName(jsonPath)}{Environment.NewLine}");
        var latest = record.Scan.Observations.FirstOrDefault()?.Latest;
        var row = string.Join(',', new[]
        {
            Csv(record.EvidenceId),
            Csv(record.CreatedAt.ToString("O")),
            Csv(record.Workstation.MachineName),
            Csv(record.Workstation.UserName),
            Csv(latest?.DeviceName ?? latest?.ChassisId),
            Csv(latest?.PortDescription ?? latest?.PortId),
            Csv(latest?.ManagementAddress),
            Csv(record.Sha256),
            Csv(Path.GetFileName(jsonPath))
        });

        if (!File.Exists(indexPath))
        {
            WriteTextAtomic(indexPath, "evidenceId,createdAt,machineName,userName,switchName,switchPort,managementAddress,sha256,fileName" + Environment.NewLine + row + Environment.NewLine);
        }
        else
        {
            File.AppendAllText(indexPath, row + Environment.NewLine);
        }

        if (priorReview is not null && (!priorReview.ContinueHistory || priorReview.Score < 3))
        {
            var reviewPath = Path.ChangeExtension(jsonPath, ".admin-review.json");
            WriteTextAtomic(reviewPath, JsonSerializer.Serialize(new
            {
                state = priorReview.ContinueHistory ? "continuity-kept-review-required" : "new-folder-review-required",
                evidenceId = record.EvidenceId,
                priorEvidenceId = priorReview.Record.EvidenceId,
                priorCapturedAt = priorReview.Record.CreatedAt,
                matchScore = priorReview.Score,
                reason = priorReview.Reason
            }, JsonOptions));
        }
    }

    private static string Csv(string? value) => $"\"{(value ?? string.Empty).Replace("\"", "\"\"")}\"";

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

    private static void WriteRecord(string path, EvidenceRecord record, bool encrypted, bool useMachineScope)
    {
        var json = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(record, JsonOptions));
        var bytes = encrypted
            ? ProtectedData.Protect(json, null, useMachineScope ? DataProtectionScope.LocalMachine : DataProtectionScope.CurrentUser)
            : json;
        WriteBytesAtomic(path, bytes);
    }

    private static EvidenceRecord? ReadRecord(string path)
    {
        var bytes = File.ReadAllBytes(path);
        if (path.EndsWith(".dpapi", StringComparison.OrdinalIgnoreCase))
        {
            bytes = TryUnprotect(bytes, DataProtectionScope.LocalMachine) ?? TryUnprotect(bytes, DataProtectionScope.CurrentUser) ?? bytes;
        }

        return JsonSerializer.Deserialize<EvidenceRecord>(bytes, JsonOptions);
    }

    private static byte[]? TryUnprotect(byte[] bytes, DataProtectionScope scope)
    {
        try
        {
            return ProtectedData.Unprotect(bytes, null, scope);
        }
        catch
        {
            return null;
        }
    }

    private static IEnumerable<string> EnumerateEvidenceFiles(string root)
    {
        if (!Directory.Exists(root))
        {
            return [];
        }

        return Directory.EnumerateFiles(root, "*.json*", SearchOption.AllDirectories);
    }

    private static int StorageRank(string state) => state switch
    {
        "nas-synced" => 0,
        "local-and-nas-synced" => 1,
        "pending-nas-sync" => 2,
        _ => 3
    };

    private static void ApplyRetention(EvidenceSettings settings)
    {
        if (settings.EvidenceRetentionDays <= 0 || !settings.AllowEvidenceDeletion || !Directory.Exists(settings.LocalHistoryPath))
        {
            return;
        }

        var cutoff = DateTimeOffset.Now.AddDays(-settings.EvidenceRetentionDays);
        foreach (var path in EnumerateEvidenceFiles(settings.LocalHistoryPath))
        {
            if (File.GetLastWriteTimeUtc(path) < cutoff.UtcDateTime)
            {
                File.Delete(path);
            }
        }
    }

    private static void WriteTextAtomic(string path, string content) =>
        WriteBytesAtomic(path, Encoding.UTF8.GetBytes(content));

    private static void WriteBytesAtomic(string path, byte[] bytes)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tempPath = $"{path}.{Guid.NewGuid():n}.tmp";
        File.WriteAllBytes(tempPath, bytes);
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        File.Move(tempPath, path);
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
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
    IReadOnlyList<string>? AllowedExportFormats,
    string? StorageMode,
    string? LocalCachePath,
    int? CacheExpirationHours,
    IReadOnlyList<int>? CacheWarningHours,
    int? NasSyncIntervalMinutes,
    bool? AdminManagedCacheEncryption);

file sealed record SwitchIdentityParts(string? Name, string? ManagementIp, string? ChassisId, string? Port);

file sealed record SwitchReviewMatch(EvidenceRecord Record, int Score, bool ContinueHistory, string Reason);
