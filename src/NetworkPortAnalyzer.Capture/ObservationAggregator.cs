using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Capture;

internal static class ObservationAggregator
{
    public static IReadOnlyList<Observation> Aggregate(string adapterId, IReadOnlyList<ProtocolPacket> packets, DateTimeOffset first, DateTimeOffset last)
    {
        return packets
            .GroupBy(p => $"{p.Protocol}:{p.ChassisId ?? p.DeviceName ?? "unknown"}:{p.PortId ?? "unknown"}")
            .Select(g =>
            {
                var list = g.ToArray();
                var latest = list[^1];
                return new Observation(g.Key, latest.Protocol, adapterId, first, last, list.Length, latest, FindConflicts(list));
            })
            .OrderBy(o => o.Protocol)
            .ThenBy(o => o.Latest.DeviceName ?? o.Latest.ChassisId)
            .ToArray();
    }

    private static IReadOnlyList<string> FindConflicts(IReadOnlyList<ProtocolPacket> packets)
    {
        var conflicts = new List<string>();
        AddConflict(conflicts, "native VLAN", packets.Select(p => p.NativeVlan?.ToString()));
        AddConflict(conflicts, "voice VLAN", packets.Select(p => p.VoiceVlan?.ToString()));
        AddConflict(conflicts, "management address", packets.Select(p => p.ManagementAddress));
        AddConflict(conflicts, "duplex", packets.Select(p => p.Duplex));
        return conflicts;
    }

    private static void AddConflict(List<string> conflicts, string label, IEnumerable<string?> values)
    {
        var advertised = values.Where(v => !string.IsNullOrWhiteSpace(v)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (advertised.Length > 1)
        {
            conflicts.Add($"{label}: {string.Join(" vs ", advertised)}");
        }
    }
}
