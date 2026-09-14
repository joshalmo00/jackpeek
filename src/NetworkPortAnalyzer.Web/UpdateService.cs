using System.Diagnostics;
using System.Reflection;
using System.Text.Json;

namespace NetworkPortAnalyzer.Web;

public sealed class UpdateService
{
    public const string ReleaseRoot = @"\\sbcnas\field_services\new_brunswick\Tools\JackPeek";
    public const string ManifestFileName = "version.json";
    public const string UpdateScriptName = "Install-Or-Update-JackPeek.cmd";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public UpdateStatus GetStatus()
    {
        var currentVersion = CurrentVersion();
        var manifestPath = Path.Combine(ReleaseRoot, ManifestFileName);
        try
        {
            if (!File.Exists(manifestPath))
            {
                return new UpdateStatus(
                    "unavailable",
                    currentVersion,
                    null,
                    null,
                    [],
                    false,
                    null,
                    ReleaseRoot,
                    null,
                    "Update manifest was not found on the NAS release share.");
            }

            var manifest = JsonSerializer.Deserialize<UpdateManifest>(File.ReadAllText(manifestPath), JsonOptions);
            if (manifest is null || string.IsNullOrWhiteSpace(manifest.Version))
            {
                return new UpdateStatus(
                    "unavailable",
                    currentVersion,
                    null,
                    null,
                    [],
                    false,
                    null,
                    ReleaseRoot,
                    null,
                    "Update manifest is unreadable.");
            }

            var updateAvailable = CompareVersion(manifest.Version, currentVersion) > 0;
            var state = updateAvailable ? "available" : "current";
            return new UpdateStatus(
                state,
                currentVersion,
                manifest.Version,
                manifest.ReleaseDate,
                manifest.Changes ?? [],
                updateAvailable,
                manifest.Sha256,
                ReleaseRoot,
                Path.Combine(ReleaseRoot, UpdateScriptName),
                null);
        }
        catch (Exception ex)
        {
            return new UpdateStatus(
                "unavailable",
                currentVersion,
                null,
                null,
                [],
                false,
                null,
                ReleaseRoot,
                null,
                ex.GetType().Name);
        }
    }

    public UpdateLaunchResult StartUpdate()
    {
        var status = GetStatus();
        if (!status.UpdateAvailable)
        {
            return new UpdateLaunchResult(false, "No newer JackPeek version is available.", status);
        }

        var scriptPath = Path.Combine(ReleaseRoot, UpdateScriptName);
        if (!File.Exists(scriptPath))
        {
            return new UpdateLaunchResult(false, "The NAS update script was not found.", status);
        }

        try
        {
            var installPath = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            Process.Start(new ProcessStartInfo
            {
                FileName = scriptPath,
                Arguments = QuoteArgument(installPath),
                UseShellExecute = true,
                WorkingDirectory = ReleaseRoot
            });
            return new UpdateLaunchResult(true, "The JackPeek updater was opened. Close JackPeek if the updater asks before replacing the executable.", status);
        }
        catch (Exception ex)
        {
            return new UpdateLaunchResult(false, $"Could not open updater: {ex.GetType().Name}.", status);
        }
    }

    private static string CurrentVersion()
    {
        var version = Assembly.GetEntryAssembly()?.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
            ?? Assembly.GetEntryAssembly()?.GetName().Version?.ToString(3)
            ?? "1.0";
        return version.Split('+', 2)[0];
    }

    private static int CompareVersion(string? left, string? right)
    {
        var leftParts = ParseVersion(left);
        var rightParts = ParseVersion(right);
        for (var i = 0; i < Math.Max(leftParts.Length, rightParts.Length); i++)
        {
            var l = i < leftParts.Length ? leftParts[i] : 0;
            var r = i < rightParts.Length ? rightParts[i] : 0;
            if (l != r) return l.CompareTo(r);
        }

        return 0;
    }

    private static int[] ParseVersion(string? value) =>
        (value ?? "")
        .Split(['.', '-', '+'], StringSplitOptions.RemoveEmptyEntries)
        .Select(part => int.TryParse(new string(part.TakeWhile(char.IsDigit).ToArray()), out var number) ? number : 0)
        .DefaultIfEmpty(0)
        .ToArray();

    private static string QuoteArgument(string value) => $"\"{value.Replace("\"", "\\\"")}\"";
}

public sealed record UpdateManifest(
    string Version,
    string ReleaseDate,
    string Sha256,
    IReadOnlyList<string> Changes);

public sealed record UpdateStatus(
    string State,
    string CurrentVersion,
    string? LatestVersion,
    string? ReleaseDate,
    IReadOnlyList<string> Changes,
    bool UpdateAvailable,
    string? Sha256,
    string ReleaseRoot,
    string? UpdateScriptPath,
    string? LastError);

public sealed record UpdateLaunchResult(
    bool Started,
    string Message,
    UpdateStatus Status);
