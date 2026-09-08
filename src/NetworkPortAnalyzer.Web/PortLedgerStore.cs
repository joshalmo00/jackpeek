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
        var settings = _settings();
        var roots = new[] { Path.Combine(settings.LocalHistoryPath, "PortLedger") };
        var entries = roots
            .Where(Directory.Exists)
            .SelectMany(root => Directory.EnumerateFiles(root, "*.json"))
            .Select(TryRead)
            .Where(entry => entry is not null)
            .Select(entry => entry!)
            .GroupBy(entry => entry.LedgerId, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.OrderByDescending(entry => entry.ScannedAt).First())
            .OrderBy(entry => entry.ScannedAt)
            .ToArray();

        var previousByPort = new Dictionary<string, PortLedgerEntry>(StringComparer.OrdinalIgnoreCase);
        var summaries = new List<PortLedgerSummary>(entries.Length);
        foreach (var entry in entries)
        {
            var changes = Array.Empty<PortChange>();
            if (entry.HasCompleteIdentity && !string.IsNullOrWhiteSpace(entry.IdentityKey))
            {
                if (previousByPort.TryGetValue(entry.IdentityKey, out var previous))
                {
                    changes = Compare(previous, entry).ToArray();
                }

                previousByPort[entry.IdentityKey] = entry;
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
        return record.Scan.Observations
            .GroupBy(observation => IdentityGroupKey(observation.Latest), StringComparer.OrdinalIgnoreCase)
            .Select(group => BuildEntry(record, group.ToArray()))
            .OrderBy(entry => entry.SwitchName ?? entry.SwitchChassisId ?? string.Empty, StringComparer.OrdinalIgnoreCase)
            .ThenBy(entry => entry.SwitchPort ?? string.Empty, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static PortLedgerEntry BuildEntry(EvidenceRecord record, IReadOnlyList<Observation> observations)
    {
        var latest = observations.OrderByDescending(o => o.LastSeen).First().Latest;
        var switchName = Clean(latest.DeviceName);
        var chassisId = Clean(latest.ChassisId);
        var port = Clean(latest.PortId) ?? Clean(latest.PortDescription);
        var hasCompleteIdentity = !string.IsNullOrWhiteSpace(switchName ?? chassisId) && !string.IsNullOrWhiteSpace(port);
        var protocols = observations
            .Select(o => o.Protocol)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return new PortLedgerEntry(
            Guid.NewGuid().ToString("n"),
            record.CreatedAt,
            switchName,
            chassisId,
            port,
            protocols,
            latest.NativeVlan,
            latest.VoiceVlan,
            Clean(latest.ManagementAddress),
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
            null);
    }

    private static string IdentityGroupKey(ProtocolPacket packet)
    {
        var switchIdentity = Clean(packet.DeviceName) ?? Clean(packet.ChassisId) ?? "missing-switch";
        var port = Clean(packet.PortId) ?? Clean(packet.PortDescription) ?? "missing-port";
        return NormalizeIdentity(switchIdentity, port);
    }

    private static IEnumerable<PortChange> Compare(PortLedgerEntry previous, PortLedgerEntry current)
    {
        foreach (var change in CompareText("Switch", previous.SwitchName ?? previous.SwitchChassisId, current.SwitchName ?? current.SwitchChassisId))
        {
            yield return change;
        }
        foreach (var change in CompareText("Port", previous.SwitchPort, current.SwitchPort))
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
        foreach (var change in CompareText("Management IP", previous.ManagementIp, current.ManagementIp))
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
        if (!string.Equals(previous, current, StringComparison.OrdinalIgnoreCase))
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
        $"{Clean(switchIdentity)?.ToUpperInvariant()}|{Clean(port)?.ToUpperInvariant()}";

    private static string? Clean(string? value)
    {
        value = value?.Trim();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }
}

public sealed record PortLedgerSaveResult(int EntriesWritten, int MirrorFailures);
