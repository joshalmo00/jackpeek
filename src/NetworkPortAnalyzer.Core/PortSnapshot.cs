using System.Text.RegularExpressions;

namespace NetworkPortAnalyzer.Core;

public sealed record PortSnapshot(
    string? SwitchName, string? ChassisId, string? SwitchMac, string? Port,
    string? PortDescription, string? SwitchIp, int? NativeVlan, int? VoiceVlan,
    string? Duplex, IReadOnlyList<string> Capabilities, IReadOnlyList<string> Conflicts,
    IReadOnlyList<string> Protocols);

// One presentation model for live captures, saved ledgers, and comparisons.
// Raw observations remain intact in the evidence record.
public static class PortSnapshots
{
    public static IReadOnlyList<PortSnapshot> FromScan(ScanResult scan)
    {
        var snapshots = scan.Observations.OrderByDescending(o => o.LastSeen).Select(o =>
        {
            var p = o.Latest;
            return new PortSnapshot(Clean(p.DeviceName), Clean(p.ChassisId), Mac(p.ChassisId), Clean(p.PortId) ?? Clean(p.PortDescription),
                Clean(p.PortDescription), Clean(p.ManagementAddress), p.NativeVlan, p.VoiceVlan, Clean(p.Duplex),
                p.Capabilities, o.Conflicts, [o.Protocol]);
        });
        return Combine(snapshots);
    }

    public static IReadOnlyList<PortSnapshot> Combine(IEnumerable<PortSnapshot> snapshots)
    {
        var groups = new List<List<PortSnapshot>>();
        foreach (var snapshot in snapshots)
        {
            // Require agreement with every member to avoid ambiguous bridge matches.
            var matches = groups.Where(g => g.All(p => SamePort(p, snapshot))).ToArray();
            if (matches.Length == 1) matches[0].Add(snapshot);
            else groups.Add([snapshot]);
        }
        return groups.Select(Merge).ToArray();
    }

    public static bool Complete(PortSnapshot p) => Clean(p.SwitchName ?? p.ChassisId) is not null && Clean(p.Port) is not null;
    public static bool SamePort(PortSnapshot a, PortSnapshot b, bool allowChassisChange = false)
    {
        if (!Complete(a) || !Complete(b)) return false;
        if (InterfacePort(a.Port) && InterfacePort(b.Port) && NormalizePort(a.Port) != NormalizePort(b.Port)) return false;
        if (!PortKeys(a).Intersect(PortKeys(b)).Any()) return false;
        // Distinct advertised chassis MACs must not be merged solely by hostname.
        if (!allowChassisChange && a.SwitchMac is not null && b.SwitchMac is not null && a.SwitchMac != b.SwitchMac) return false;
        var namesA = new[] { a.SwitchName, a.ChassisId }.Where(x => Clean(x) is not null).Select(NormalizeSwitch);
        var namesB = new[] { b.SwitchName, b.ChassisId }.Where(x => Clean(x) is not null).Select(NormalizeSwitch);
        return namesA.Intersect(namesB, StringComparer.OrdinalIgnoreCase).Any();
    }

    public static string NormalizePort(string? value)
    {
        value = (value ?? "").Trim().ToLowerInvariant();
        var match = Regex.Match(value, @"^(gigabitethernet|gi|g|tengigabitethernet|te|twentyfivegige|twe|fastethernet|fa|ethernet|eth|et)\s*(\d[\d/.:]*)$");
        if (!match.Success) return value;
        var prefix = match.Groups[1].Value switch
        {
            "gigabitethernet" or "gi" or "g" => "gi",
            "tengigabitethernet" or "te" => "te",
            "twentyfivegige" or "twe" => "twe",
            "fastethernet" or "fa" => "fa",
            _ => "eth"
        };
        return prefix + match.Groups[2].Value;
    }
    private static bool InterfacePort(string? value) => Regex.IsMatch(NormalizePort(value), @"^(gi|te|twe|fa|eth)\d[\d/.:]*$");
    private static IEnumerable<string> PortKeys(PortSnapshot p)
    {
        yield return NormalizePort(p.Port);
        if (InterfacePort(p.PortDescription)) yield return NormalizePort(p.PortDescription);
    }
    public static string NormalizeSwitch(string? value) => Mac(value) ?? (value ?? "").Trim().ToUpperInvariant();
    public static string? Mac(string? value)
    {
        var raw = (value ?? "").Trim();
        if (!Regex.IsMatch(raw, @"^(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$|^(?:[0-9a-fA-F]{4}\.){2}[0-9a-fA-F]{4}$|^[0-9a-fA-F]{12}$")) return null;
        var hex = Regex.Replace(raw, "[^0-9a-fA-F]", "").ToLowerInvariant();
        return string.Join(":", Enumerable.Range(0, 6).Select(i => hex.Substring(i * 2, 2)));
    }
    private static PortSnapshot Merge(List<PortSnapshot> group)
    {
        var conflicts = group.SelectMany(p => p.Conflicts).ToList();
        string? Text(string label, Func<PortSnapshot, string?> get, bool compare = true)
        {
            var values = group.Select(get).Where(v => Clean(v) is not null).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            if (compare && values.Length > 1) conflicts.Add($"{label}: {string.Join(" / ", values)}. Showing the most recently observed value.");
            return values.FirstOrDefault();
        }
        int? Number(string label, Func<PortSnapshot, int?> get)
        {
            var values = group.Select(get).Where(v => v is not null).Distinct().ToArray();
            if (values.Length > 1) conflicts.Add($"{label}: {string.Join(" / ", values)}. Showing the most recently observed value.");
            return values.FirstOrDefault();
        }
        var name = Text("Switch name", p => Mac(p.SwitchName) is null ? p.SwitchName : null);
        var chassis = group.Select(p => p.ChassisId).FirstOrDefault(c => Mac(c) is not null) ?? Text("Chassis", p => p.ChassisId, false);
        var ip = Text("Switch IP", p => p.SwitchIp);
        var native = Number("Native VLAN", p => p.NativeVlan);
        var voice = Number("Voice VLAN", p => p.VoiceVlan);
        var duplex = Text("Duplex", p => p.Duplex);
        var port = group.Select(p => p.Port).FirstOrDefault(InterfacePort)
            ?? group.Select(p => p.PortDescription).FirstOrDefault(InterfacePort) ?? Text("Port", p => p.Port, false);
        return new(name, chassis, Mac(chassis), port, Text("Port description", p => p.PortDescription, false), ip, native, voice, duplex,
            group.SelectMany(p => p.Capabilities).Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.OrdinalIgnoreCase).ToArray(),
            conflicts.Distinct().ToArray(), group.SelectMany(p => p.Protocols).Distinct().Order().ToArray());
    }
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
