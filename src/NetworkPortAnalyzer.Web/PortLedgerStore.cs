using System.Text.Json;
using System.Security.Cryptography;
using System.Runtime.Versioning;
using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Web;

public sealed class PortLedgerStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly Func<EvidenceSettings> _settings;
    private readonly EvidenceStore? _evidence;

    public PortLedgerStore(EvidenceStore evidence)
    {
        _settings = evidence.GetSettings;
        _evidence = evidence;
    }

    internal PortLedgerStore(Func<EvidenceSettings> settings)
    {
        _settings = settings;
    }

    public PortLedgerSaveResult Save(EvidenceRecord record)
    {
        var settings = _settings();
        // In NAS-primary mode the evidence is the source of truth. Derive ledger
        // views in memory so an offline capture does not leave a plaintext copy.
        if (settings.StorageMode == EvidenceStore.StorageNasOnlyWithCache)
            return new PortLedgerSaveResult(0, 0);
        var localRoot = Path.Combine(settings.LocalHistoryPath, "PortLedger");
        Directory.CreateDirectory(localRoot);

        var mirrorRoot = settings.AllowNasMirror && !string.IsNullOrWhiteSpace(settings.ArchiveMirrorPath)
            ? Path.Combine(settings.ArchiveMirrorPath, "PortLedger")
            : null;

        var entries = BuildEntries(record);
        var mirrorFailures = 0;
        foreach (var entry in entries)
        {
            var fileName = $"{entry.ScannedAt:yyyyMMdd-HHmmss}-{entry.LedgerId}.json";
            var localPath = Path.Combine(localRoot, fileName);
            if (settings.RequireEvidenceEncryption) localPath += ".dpapi";
            var stored = entry with { LocalJsonPath = localPath };
            WriteEntry(localPath, stored, settings);

            if (mirrorRoot is null)
            {
                continue;
            }

            try
            {
                Directory.CreateDirectory(mirrorRoot);
                var mirrorPath = Path.Combine(mirrorRoot, fileName);
                stored = stored with { MirrorJsonPath = mirrorPath };
                WriteEntry(localPath, stored, settings);
                WriteEntry(mirrorPath, stored, settings);
            }
            catch
            {
                mirrorFailures++;
            }
        }

        return new PortLedgerSaveResult(entries.Count, mirrorFailures);
    }

    public IReadOnlyList<PortLedgerSummary> List()
    {
        var entries = ReadEntries(out _);

        var summaries = new List<PortLedgerSummary>(entries.Length);
        for (var index = 0; index < entries.Length; index++)
        {
            var entry = entries[index];
            var changes = Array.Empty<PortChange>();
            if (entry.HasCompleteIdentity)
            {
                var previous = entries
                    .Take(index)
                    .Where(candidate => IdentityMatchScore(entry, candidate) >= 2)
                    .OrderByDescending(candidate => SamePort(entry.SwitchPort, candidate.SwitchPort))
                    .ThenByDescending(candidate => candidate.ScannedAt)
                    .FirstOrDefault();
                if (previous is not null)
                {
                    changes = Compare(previous, entry).ToArray();
                }
            }

            summaries.Add(new PortLedgerSummary(entry, changes, changes.Length > 0));
        }

        return summaries
            .OrderByDescending(summary => summary.Entry.ScannedAt)
            .Take(250)
            .ToArray();
    }

    internal static IReadOnlyList<PortLedgerEntry> BuildEntries(EvidenceRecord record)
    {
        return PortSnapshots.FromScan(record.Scan).Select(p => BuildEntry(record, p)).ToArray();
    }

    private static PortLedgerEntry BuildEntry(EvidenceRecord record, PortSnapshot latest)
    {
        var switchName = latest.SwitchName;
        var chassisId = latest.ChassisId;
        var port = latest.Port;
        var hasCompleteIdentity = PortSnapshots.Complete(latest);
        var protocols = latest.Protocols;
        return new PortLedgerEntry(
            Guid.NewGuid().ToString("n"),
            record.CreatedAt,
            switchName,
            chassisId,
            port,
            protocols,
            latest.NativeVlan,
            latest.VoiceVlan,
            latest.SwitchIp,
            Clean(latest.Duplex),
            latest.Capabilities.Where(c => !string.IsNullOrWhiteSpace(c)).Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.OrdinalIgnoreCase).ToArray(),
            record.Workstation.MachineName,
            record.Workstation.UserName,
            record.Workstation.DomainName,
            record.Workstation.UserSid,
            record.Scan.AdapterId,
            record.EvidenceId,
            record.Scan.ScanId,
            hasCompleteIdentity,
            hasCompleteIdentity ? NormalizeIdentity(switchName ?? chassisId, port) : null,
            null,
            null,
            record.Workstation.DisplayName,
            latest.PortDescription);
    }

    private PortLedgerEntry[] ReadEntries(out bool archiveUnavailable)
    {
        archiveUnavailable = false;
        var settings = _settings();
        if (settings.StorageMode == EvidenceStore.StorageNasOnlyWithCache && _evidence is not null)
            return _evidence.ListReports().Select(summary => _evidence.TryReadRecord(summary.EvidenceId))
                .Where(record => record is not null && _evidence.Verify(record))
                .SelectMany(record => BuildEntries(record!)).OrderBy(entry => entry.ScannedAt).ToArray();
        var roots = new List<(string Path, bool Archive)> { (Path.Combine(settings.LocalHistoryPath, "PortLedger"), false) };
        if (settings.AllowNasMirror && !string.IsNullOrWhiteSpace(settings.ArchiveMirrorPath))
            roots.Add((Path.Combine(settings.ArchiveMirrorPath, "PortLedger"), true));
        var rows = new List<PortLedgerEntry>();
        foreach (var root in roots)
        {
            try
            {
                foreach (var path in Directory.EnumerateFiles(root.Path, "*.json*")
                    .Where(p => p.EndsWith(".json") || p.EndsWith(".json.dpapi")))
                    if (TryRead(path) is { } entry) rows.Add(entry);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                if (root.Archive) archiveUnavailable = true;
                else if (ex is not DirectoryNotFoundException) throw;
            }
        }
        return rows.GroupBy(e => e.LedgerId, StringComparer.OrdinalIgnoreCase).Select(g => g.First()).OrderBy(e => e.ScannedAt).ToArray();
    }

    internal static PortSnapshot Snapshot(PortLedgerEntry e) => new(
        e.SwitchName, e.SwitchChassisId, PortSnapshots.Mac(e.SwitchChassisId), e.SwitchPort,
        e.PortDescription, e.ManagementIp, e.NativeVlan, e.VoiceVlan, e.Duplex, e.Capabilities, [], e.Protocols);

    public PortHistoryResult History(string? switchName, string? chassisId, string port, string? excludeEvidenceId, DateTimeOffset? before)
    {
        var target = new PortSnapshot(switchName, chassisId, PortSnapshots.Mac(chassisId), port, null, null, null, null, null, [], [], []);
        if (!PortSnapshots.Complete(target)) return new([], "Port identity is incomplete. History cannot be matched safely.");
        var records = ReadEntries(out var archiveUnavailable)
            .Where(e => e.HasCompleteIdentity && e.EvidenceId != excludeEvidenceId && (before is null || e.ScannedAt < before) && PortSnapshots.SamePort(target, Snapshot(e), allowChassisChange: true))
            .GroupBy(e => e.EvidenceId)
            .SelectMany(g => PortSnapshots.Combine(g.OrderByDescending(e => e.ScannedAt).Select(Snapshot)).Select(snapshot =>
            {
                var entry = g.First();
                return new PortHistoryEntry(entry.EvidenceId, entry.ScannedAt, entry.DisplayName ?? entry.UserName, entry.Workstation, snapshot);
            }))
            .OrderByDescending(e => e.ScannedAt).Take(250).ToArray();
        return new(records, archiveUnavailable ? "The archive could not be read. Showing available local history." : null);
    }

    private static IEnumerable<PortChange> Compare(PortLedgerEntry previous, PortLedgerEntry current)
    {
        foreach (var change in CompareText("Switch", previous.SwitchName ?? previous.SwitchChassisId, current.SwitchName ?? current.SwitchChassisId))
        {
            yield return change;
        }
        foreach (var change in CompareText("Port", PortSnapshots.NormalizePort(previous.SwitchPort), PortSnapshots.NormalizePort(current.SwitchPort)))
        {
            yield return change;
        }
        foreach (var change in CompareText("Native VLAN", previous.NativeVlan?.ToString(), current.NativeVlan?.ToString()))
        {
            yield return change;
        }
        foreach (var change in CompareText("Voice VLAN", previous.VoiceVlan?.ToString(), current.VoiceVlan?.ToString()))
        {
            yield return change;
        }
        foreach (var change in CompareText("Switch IP", previous.ManagementIp, current.ManagementIp))
        {
            yield return change;
        }
        foreach (var change in CompareText("MAC / chassis ID", PortSnapshots.Mac(previous.SwitchChassisId) ?? previous.SwitchChassisId, PortSnapshots.Mac(current.SwitchChassisId) ?? current.SwitchChassisId))
        {
            yield return change;
        }
        foreach (var change in CompareText("Port description", previous.PortDescription, current.PortDescription))
        {
            yield return change;
        }
        foreach (var change in CompareText("Duplex", previous.Duplex, current.Duplex))
        {
            yield return change;
        }
        foreach (var change in CompareText("Capabilities", string.Join(", ", previous.Capabilities), string.Join(", ", current.Capabilities)))
        {
            yield return change;
        }
    }

    private static IEnumerable<PortChange> CompareText(string field, string? previous, string? current)
    {
        previous = Clean(previous);
        current = Clean(current);
        if (previous is not null && current is not null && !string.Equals(previous, current, StringComparison.OrdinalIgnoreCase))
        {
            yield return new PortChange(field, previous, current);
        }
    }

    private static PortLedgerEntry? TryRead(string path)
    {
        try
        {
            if (new FileInfo(path).Length > 1024 * 1024) return null;
            var bytes = File.ReadAllBytes(path);
            if (path.EndsWith(".dpapi", StringComparison.OrdinalIgnoreCase))
            {
                bytes = TryUnprotect(bytes)
                    ?? throw new CryptographicException("Port ledger decryption failed.");
            }
            return JsonSerializer.Deserialize<PortLedgerEntry>(bytes, JsonOptions);
        }
        catch
        {
            return null;
        }
    }

    private static string NormalizeIdentity(string? switchIdentity, string? port) =>
        $"{PortSnapshots.NormalizeSwitch(switchIdentity)}|{PortSnapshots.NormalizePort(port)}";

    private static void WriteEntry(string path, PortLedgerEntry entry, EvidenceSettings settings)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(entry, JsonOptions);
        if (path.EndsWith(".dpapi", StringComparison.OrdinalIgnoreCase))
            bytes = ProtectWithDpapi(bytes, settings.AdminManagedCacheEncryption);
        var temporary = path + "." + Guid.NewGuid().ToString("n") + ".tmp";
        try { File.WriteAllBytes(temporary, bytes); File.Move(temporary, path, true); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }

    private static byte[]? TryUnprotect(byte[] bytes)
    {
        if (!OperatingSystem.IsWindows()) return null;
        try { return UnprotectWithDpapi(bytes, DataProtectionScope.LocalMachine); }
        catch (CryptographicException) { return UnprotectWithDpapi(bytes, DataProtectionScope.CurrentUser); }
    }

    private static byte[] ProtectWithDpapi(byte[] bytes, bool useMachineScope)
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("DPAPI port ledger encryption is available only on Windows.");
#pragma warning disable CA1416
        return ProtectedData.Protect(bytes, null, useMachineScope ? DataProtectionScope.LocalMachine : DataProtectionScope.CurrentUser);
#pragma warning restore CA1416
    }

    private static byte[] UnprotectWithDpapi(byte[] bytes, DataProtectionScope scope)
    {
#pragma warning disable CA1416
        return ProtectedData.Unprotect(bytes, null, scope);
#pragma warning restore CA1416
    }

    private static int IdentityMatchScore(PortLedgerEntry current, PortLedgerEntry previous)
    {
        var currentValues = new[] { current.SwitchName, current.ManagementIp, PortSnapshots.Mac(current.SwitchChassisId) ?? current.SwitchChassisId };
        var previousValues = new[] { previous.SwitchName, previous.ManagementIp, PortSnapshots.Mac(previous.SwitchChassisId) ?? previous.SwitchChassisId };
        return Enumerable.Range(0, currentValues.Length).Count(index =>
            !string.IsNullOrWhiteSpace(currentValues[index]) &&
            !string.IsNullOrWhiteSpace(previousValues[index]) &&
            string.Equals(currentValues[index]!.Trim(), previousValues[index]!.Trim(), StringComparison.OrdinalIgnoreCase));
    }

    private static bool SamePort(string? current, string? previous) =>
        !string.IsNullOrWhiteSpace(current) &&
        !string.IsNullOrWhiteSpace(previous) &&
        PortSnapshots.NormalizePort(current) == PortSnapshots.NormalizePort(previous);

    private static string? Clean(string? value)
    {
        value = value?.Trim();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }
}

public sealed record PortLedgerSaveResult(int EntriesWritten, int MirrorFailures);


public sealed record PortHistoryEntry(string EvidenceId, DateTimeOffset ScannedAt, string? ScannedBy, string Workstation, PortSnapshot Port);
public sealed record PortHistoryResult(IReadOnlyList<PortHistoryEntry> Entries, string? Warning);
