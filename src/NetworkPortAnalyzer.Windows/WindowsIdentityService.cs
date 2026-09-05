using System.Reflection;
using System.Security.Principal;
using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Windows;

public sealed class WindowsIdentityService
{
    public WorkstationIdentity Capture(bool includeWindowsUser)
    {
        var identity = includeWindowsUser ? WindowsIdentity.GetCurrent() : null;
        var userName = includeWindowsUser ? Environment.UserName : null;
        var domainName = includeWindowsUser ? Environment.UserDomainName : null;
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
