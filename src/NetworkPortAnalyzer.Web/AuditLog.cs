using System.Text.Json;
using System.Text.RegularExpressions;
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
        var entry = new AuditEvent(DateTimeOffset.Now, Redact(action)!, Redact(outcome)!, Redact(evidenceId), Redact(detail));
        try
        {
            lock (_gate)
            {
                if (File.Exists(_path) && new FileInfo(_path).Length >= 5 * 1024 * 1024)
                {
                    File.Delete(_path + ".5");
                    for (var index = 4; index >= 1; index--)
                        if (File.Exists(_path + "." + index)) File.Move(_path + "." + index, _path + "." + (index + 1), true);
                    File.Move(_path, _path + ".1", true);
                }
                File.AppendAllText(_path, JsonSerializer.Serialize(entry) + Environment.NewLine);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // An unavailable audit file must not strand a completed capture.
            _logger.LogWarning("Audit entry could not be written ({ErrorType}).", ex.GetType().Name);
        }
    }

    public static string? Redact(string? value)
    {
        if (value is null) return null;
        value = value.Length > 2048 ? value[..2048] : value;
        return Regex.Replace(value, @"(?i)\b(password|secret|token|api[_-]?key|authorization|cookie)\s*[:=]\s*[^;\r\n]+", "$1=[REDACTED]",
            RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    }
}
