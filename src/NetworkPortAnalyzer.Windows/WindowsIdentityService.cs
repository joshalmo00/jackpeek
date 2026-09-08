using System.Reflection;
using System.Security.Principal;
using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Windows;

public sealed class WindowsIdentityService
{
    public WorkstationIdentity Capture(bool includeWindowsUser)
    {
        using var identity = includeWindowsUser ? WindowsIdentity.GetCurrent() : null;
        var accountParts = identity?.Name.Split('\\', 2);
        var userName = accountParts is { Length: 2 } ? accountParts[1] : null;
        var domainName = accountParts is { Length: 2 } ? accountParts[0] : null;
        var userSid = includeWindowsUser ? identity?.User?.Value : null;
        var version = Assembly.GetEntryAssembly()?.GetName().Version?.ToString() ?? "unknown";

        return new WorkstationIdentity(
            Environment.MachineName,
            NullIfBlank(domainName),
            NullIfBlank(userName),
            NullIfBlank(userSid),
            Environment.OSVersion.VersionString,
            version,
            DateTimeOffset.Now);
    }

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value;
}
