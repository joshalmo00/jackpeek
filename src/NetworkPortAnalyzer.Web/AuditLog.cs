using System.Text.Json;
using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Web;

public sealed class AuditLog
{
    private readonly string _path;

    public AuditLog()
    {
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JackPeek");
        Directory.CreateDirectory(root);
        _path = Path.Combine(root, "audit.jsonl");
    }

    public void Write(string action, string outcome, string? evidenceId = null, string? detail = null)
    {
        var entry = new AuditEvent(DateTimeOffset.Now, action, outcome, evidenceId, detail);
        File.AppendAllText(_path, JsonSerializer.Serialize(entry) + Environment.NewLine);
    }
}
