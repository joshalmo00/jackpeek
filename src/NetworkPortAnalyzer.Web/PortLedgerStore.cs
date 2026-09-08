using System.Text.Json;
using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Web;

public sealed class PortLedgerStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly Func<EvidenceSettings> _settings;

    public PortLedgerStore(EvidenceStore evidence)
    {
        _settings = evidence.GetSettings;
    }

    internal PortLedgerStore(Func<EvidenceSettings> settings)
    {
        _settings = settings;
    }

    public PortLedgerSaveResult Save(EvidenceRecord record)
    {
        var settings = _settings();
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
            var stored = entry with { LocalJsonPath = localPath };
            File.WriteAllText(localPath, JsonSerializer.Serialize(stored, JsonOptions));

            if (mirrorRoot is null)
            {
                continue;
            }

            try
            {
                Directory.CreateDirectory(mirrorRoot);
                var mirrorPath = Path.Combine(mirrorRoot, fileName);
                File.Copy(localPath, mirrorPath, true);
                stored = stored with { MirrorJsonPath = mirrorPath };
                File.WriteAllText(localPath, JsonSerializer.Serialize(stored, JsonOptions));
                File.Copy(localPath, mirrorPath, true);
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

        var previousByPort = new Dictionary<string, PortLedgerEntry>(StringComparer.OrdinalIgnoreCase);
        var summaries = new List<PortLedgerSummary>(entries.Length);
        foreach (var entry in entries)
        {
            var changes = Array.Empty<PortChange>();
            if (entry.HasCompleteIdentity && !string.IsNullOrWhiteSpace(entry.IdentityKey))
            {
                var key = NormalizeIdentity(entry.SwitchName ?? entry.SwitchChassisId, entry.SwitchPort);
                if (previousByPort.TryGetValue(key, out var previous))
                {
                    changes = Compare(previous, entry).ToArray();
                }

                previousByPort[key] = entry;
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
        var roots = new List<(string Path, bool Archive)> { (Path.Combine(settings.LocalHistoryPath, "PortLedger"), false) };
        if (settings.AllowNasMirror && !string.IsNullOrWhiteSpace(settings.ArchiveMirrorPath))
            roots.Add((Path.Combine(settings.ArchiveMirrorPath, "PortLedger"), true));
        var rows = new List<PortLedgerEntry>();
        foreach (var root in roots)
        {
            try
            {
                foreach (var path in Directory.EnumerateFiles(root.Path, "*.json"))
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
        foreach (var change in CompareText("Duplex", previous.Duplex, current.Duplex))
        {
            yield return change;
        }
        if (previous.Protocols.Order().SequenceEqual(current.Protocols.Order()))
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
            return JsonSerializer.Deserialize<PortLedgerEntry>(File.ReadAllText(path), JsonOptions);
        }
        catch
        {
            return null;
        }
    }

    private static string NormalizeIdentity(string? switchIdentity, string? port) =>
        $"{PortSnapshots.NormalizeSwitch(switchIdentity)}|{PortSnapshots.NormalizePort(port)}";

    private static string? Clean(string? value)
    {
        value = value?.Trim();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }
}

public sealed record PortLedgerSaveResult(int EntriesWritten, int MirrorFailures);


public sealed record PortHistoryEntry(string EvidenceId, DateTimeOffset ScannedAt, string? ScannedBy, string Workstation, PortSnapshot Port);
public sealed record PortHistoryResult(IReadOnlyList<PortHistoryEntry> Entries, string? Warning);
