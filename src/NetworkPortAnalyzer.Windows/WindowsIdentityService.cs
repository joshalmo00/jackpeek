using System.Reflection;
using System.Security.Principal;
using System.Runtime.Versioning;
using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Windows;

public sealed class WindowsIdentityService
{
    public WorkstationIdentity Capture(bool includeWindowsUser)
    {
        using var identity = includeWindowsUser && OperatingSystem.IsWindows() ? CaptureCurrentIdentity() : null;
        var accountParts = includeWindowsUser && OperatingSystem.IsWindows() ? ReadName(identity)?.Split('\\', 2) : null;
        var userName = accountParts is { Length: 2 } ? accountParts[1] : null;
        var domainName = accountParts is { Length: 2 } ? accountParts[0] : null;
        var userSid = includeWindowsUser && OperatingSystem.IsWindows() ? ReadSid(identity) : null;
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

    [SupportedOSPlatform("windows")]
    private static WindowsIdentity CaptureCurrentIdentity() => WindowsIdentity.GetCurrent();

    [SupportedOSPlatform("windows")]
    private static string? ReadName(WindowsIdentity? identity) => identity?.Name;

    [SupportedOSPlatform("windows")]
    private static string? ReadSid(WindowsIdentity? identity) => identity?.User?.Value;
}
