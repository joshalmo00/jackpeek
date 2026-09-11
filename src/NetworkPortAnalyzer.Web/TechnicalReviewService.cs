using System.IO.Compression;
using System.Reflection;
using System.Text.Json;
using NetworkPortAnalyzer.Capture;

namespace NetworkPortAnalyzer.Web;

public sealed class TechnicalReviewService
{
    private static readonly Assembly Assembly = typeof(TechnicalReviewService).Assembly;
    private const string Prefix = "technical-review/";

    public object Read()
    {
        using var document = JsonDocument.Parse(ReadResource("technical-review.json"));
        using var manifest = JsonDocument.Parse(ReadResource("REVIEW_MANIFEST.json"));
        return new
        {
            review = document.RootElement.Clone(),
            manifest = manifest.RootElement.Clone(),
            buildVersion = Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
                ?? Assembly.GetName().Version?.ToString(),
            captureFilter = PassiveCaptureService.PassiveDiscoveryFilter,
            capabilities = new[] { "Passive port discovery", "Active HTTPS speed test", "Local evidence processing", "No switch credentials", "No SNMP", "No SSH", "No port scanning" }
        };
    }

    public byte[] Export()
    {
        using var output = new MemoryStream();
        using (var zip = new ZipArchive(output, ZipArchiveMode.Create, true))
        {
            foreach (var resource in Assembly.GetManifestResourceNames().Where(name => name.StartsWith(Prefix, StringComparison.Ordinal)))
            {
                using var source = Assembly.GetManifestResourceStream(resource)!;
                using var destination = zip.CreateEntry(resource[Prefix.Length..]).Open();
                source.CopyTo(destination);
            }
            using var build = zip.CreateEntry("CURRENT_BUILD.json").Open();
            JsonSerializer.Serialize(build, Read(), new JsonSerializerOptions { WriteIndented = true });
        }
        return output.ToArray();
    }

    private static string ReadResource(string name)
    {
        using var stream = Assembly.GetManifestResourceStream(Prefix + name)
            ?? throw new InvalidOperationException("The technical review was not included in this build.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
