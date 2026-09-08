using System.Text.Json;
using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Web;

public sealed class AuditLog
{
    private readonly string _path;
    private readonly object _gate = new();
    private readonly ILogger<AuditLog> _logger;

    public AuditLog(ILogger<AuditLog> logger)
    {
        _logger = logger;
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JackPeek");
        Directory.CreateDirectory(root);
        _path = Path.Combine(root, "audit.jsonl");
    }

    public void Write(string action, string outcome, string? evidenceId = null, string? detail = null)
    {
        var entry = new AuditEvent(DateTimeOffset.Now, action, outcome, evidenceId, detail);
        try
        {
            lock (_gate) File.AppendAllText(_path, JsonSerializer.Serialize(entry) + Environment.NewLine);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // An unavailable audit file must not strand a completed capture.
            _logger.LogWarning("Audit entry could not be written ({ErrorType}).", ex.GetType().Name);
        }
    }
}
