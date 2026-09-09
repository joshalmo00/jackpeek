using System.Text.Json;
using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Web;

public sealed class AdminReviewStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly EvidenceStore _evidence;
    private readonly object _gate = new();

    public AdminReviewStore(EvidenceStore evidence) => _evidence = evidence;

    public IReadOnlyList<AdminReviewItem> List()
    {
        var settings = _evidence.GetSettings();
        var decisions = ReadDecisions(settings);
        return _evidence.ListReports()
            .Where(s => s.AdminReviewRequired || s.StorageState == "pending-nas-sync")
            .Select(s => CreateItem(s, decisions.TryGetValue(s.EvidenceId, out var d) ? d : null))
            .OrderBy(i => i.Status is "Confirmed" or "Rejected" ? 1 : 0)
            .ThenByDescending(i => i.CreatedAt).ToArray();
    }

    public AdminReviewItem? Find(string evidenceId) => List().FirstOrDefault(i => i.EvidenceId == evidenceId);

    public AdminReviewDecision SaveDecision(string evidenceId, string status, string? comment, string administrator)
    {
        var allowed = new[] { "Confirmed", "Rejected", "Review later" };
        if (!allowed.Contains(status, StringComparer.OrdinalIgnoreCase)) throw new InvalidOperationException("Unsupported review decision.");
        if (_evidence.TryReadRecord(evidenceId) is null) throw new InvalidOperationException("Evidence not found.");
        var settings = _evidence.GetSettings();
        lock (_gate)
        {
            var decisions = ReadDecisions(settings);
            var decision = new AdminReviewDecision(evidenceId, NormalizeStatus(status), comment?.Trim(), administrator, DateTimeOffset.Now);
            decisions[evidenceId] = decision;
            var path = DecisionPath(settings);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var temporary = path + ".tmp";
            File.WriteAllText(temporary, JsonSerializer.Serialize(decisions.Values.OrderBy(d => d.DecidedAt), JsonOptions));
            File.Move(temporary, path, true);
            return decision;
        }
    }

    private AdminReviewItem CreateItem(EvidenceSummary summary, AdminReviewDecision? decision)
    {
        var current = _evidence.TryReadRecord(summary.EvidenceId);
        var prior = summary.PriorReviewEvidenceId is null ? null : _evidence.TryReadRecord(summary.PriorReviewEvidenceId);
        var currentIdentity = Identity(current);
        var priorIdentity = Identity(prior);
        var matched = Fields(currentIdentity, priorIdentity, out var changed, out var unannounced);
        var score = summary.PriorReviewFound ? summary.PriorReviewMatchScore : 0;
        var reason = summary.StorageState == "pending-nas-sync" ? "Evidence is waiting for NAS synchronization." : summary.AdminReviewReason;
        if (string.IsNullOrWhiteSpace(reason)) reason = score == 0 ? "New switch identity requires an administrative baseline review." : "Identity requires administrative review.";
        return new AdminReviewItem(summary.EvidenceId, summary.CreatedAt, currentIdentity.Name, currentIdentity.Ip, currentIdentity.Mac, currentIdentity.Port,
            score, matched, changed, unannounced, current?.Workstation.MachineName, current?.Workstation.UserName, summary.StorageState,
            summary.CacheExpiresAt, summary.Sha256, decision?.Status ?? (score == 0 ? "New identity" : "Pending review"), reason,
            summary.PriorReviewEvidenceId, prior?.CreatedAt, decision);
    }

    private static IdentityParts Identity(EvidenceRecord? record)
    {
        var packet = record?.Scan.Observations.FirstOrDefault()?.Latest;
        return new(packet?.DeviceName, packet?.ManagementAddress, packet?.ChassisId, packet?.PortDescription ?? packet?.PortId);
    }

    private static IReadOnlyList<string> Fields(IdentityParts current, IdentityParts prior, out IReadOnlyList<string> changed, out IReadOnlyList<string> unannounced)
    {
        var matches = new List<string>(); var changes = new List<string>(); var missing = new List<string>();
        Compare("name", current.Name, prior.Name, matches, changes, missing); Compare("ip", current.Ip, prior.Ip, matches, changes, missing); Compare("mac", current.Mac, prior.Mac, matches, changes, missing);
        changed = changes; unannounced = missing; return matches;
    }

    private static void Compare(string label, string? current, string? prior, List<string> matches, List<string> changes, List<string> missing)
    {
        if (string.IsNullOrWhiteSpace(current) || string.IsNullOrWhiteSpace(prior)) { missing.Add(label); return; }
        if (string.Equals(current.Trim(), prior.Trim(), StringComparison.OrdinalIgnoreCase)) matches.Add(label); else changes.Add(label);
    }

    private static Dictionary<string, AdminReviewDecision> ReadDecisions(EvidenceSettings settings)
    {
        try
        {
            var path = DecisionPath(settings); if (!File.Exists(path)) return new(StringComparer.OrdinalIgnoreCase);
            return (JsonSerializer.Deserialize<List<AdminReviewDecision>>(File.ReadAllText(path), JsonOptions) ?? [])
                .GroupBy(d => d.EvidenceId, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.OrderByDescending(d => d.DecidedAt).First(), StringComparer.OrdinalIgnoreCase);
        }
        catch { return new(StringComparer.OrdinalIgnoreCase); }
    }

    private static string DecisionPath(EvidenceSettings settings) => Path.Combine(settings.LocalHistoryPath, "AdminReviewDecisions.json");
    private static string NormalizeStatus(string status) => status.Trim().Equals("review later", StringComparison.OrdinalIgnoreCase) ? "Review later" : char.ToUpperInvariant(status.Trim()[0]) + status.Trim()[1..].ToLowerInvariant();
    private sealed record IdentityParts(string? Name, string? Ip, string? Mac, string? Port);
}

public sealed record AdminReviewDecision(string EvidenceId, string Status, string? Comment, string Administrator, DateTimeOffset DecidedAt);
public sealed record AdminReviewItem(string EvidenceId, DateTimeOffset CreatedAt, string? SwitchName, string? ManagementIp, string? ChassisId, string? SwitchPort, int MatchScore, IReadOnlyList<string> MatchedFields, IReadOnlyList<string> ChangedFields, IReadOnlyList<string> UnannouncedFields, string? Workstation, string? User, string StorageState, DateTimeOffset? CacheExpiresAt, string Sha256, string Status, string Reason, string? PriorEvidenceId, DateTimeOffset? PriorCreatedAt, AdminReviewDecision? Decision);
