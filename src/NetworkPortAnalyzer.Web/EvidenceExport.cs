using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Web;

public static class EvidenceExport
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public static byte[] Json(EvidenceRecord record) => JsonSerializer.SerializeToUtf8Bytes(record, JsonOptions);

    public static string CsvCell(string? value)
    {
        value ??= string.Empty;
        // Discovery fields are untrusted. Preserve the original in JSON, but make
        // spreadsheet-facing cells text, including leading whitespace/control chars.
        var start = value.TrimStart();
        if ((start.Length > 0 && "=+-@＝＋－＠".Contains(start[0])) ||
            value.Any(c => c is '\t' or '\r' or '\n'))
        {
            value = "'" + value;
        }
        return "\"" + value.Replace("\"", "\"\"") + "\"";
    }

    public static byte[] Csv(EvidenceRecord record)
    {
        var rows = new List<string> { "evidenceId,createdAt,protocol,device,port,managementAddress,nativeVlan,voiceVlan,frames,scannedBy,domain,username" };
        rows.AddRange(record.Scan.Observations.Select(o => string.Join(',', new[]
        {
            record.EvidenceId, record.CreatedAt.ToString("O"), o.Protocol,
            o.Latest.DeviceName ?? o.Latest.ChassisId, o.Latest.PortId ?? o.Latest.PortDescription,
            o.Latest.ManagementAddress, o.Latest.NativeVlan?.ToString(CultureInfo.InvariantCulture),
            o.Latest.VoiceVlan?.ToString(CultureInfo.InvariantCulture), o.FramesSeen.ToString(CultureInfo.InvariantCulture),
            record.Workstation.DisplayName, record.Workstation.DomainName, record.Workstation.UserName
        }.Select(CsvCell))));
        return Encoding.UTF8.GetBytes(string.Join("\r\n", rows) + "\r\n");
    }

    public static byte[] Package(EvidenceRecord record, string html)
    {
        var json = Json(record);
        var jsonFile = $"jackpeek-evidence-{record.EvidenceId}.json";
        var fileHash = Convert.ToHexString(SHA256.HashData(json)).ToLowerInvariant();
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, true))
        {
            Add(archive, jsonFile, json);
            Add(archive, $"jackpeek-evidence-{record.EvidenceId}.html", Encoding.UTF8.GetBytes(html));
            Add(archive, $"jackpeek-evidence-{record.EvidenceId}.sha256", Encoding.ASCII.GetBytes($"{fileHash}  {jsonFile}\n"));
            Add(archive, "manifest.json", JsonSerializer.SerializeToUtf8Bytes(new
            {
                product = "JackPeek", evidenceId = record.EvidenceId, createdAt = record.CreatedAt,
                sha256 = fileHash, recordSha256 = record.Sha256,
                checksumScope = "Exact bytes of the exported JSON file; not an authenticity signature",
                passiveOnly = true, contents = new[] { "JSON", "HTML", "SHA-256" }
            }, JsonOptions));
        }
        return output.ToArray();
    }

    private static void Add(ZipArchive archive, string name, byte[] bytes)
    {
        using var stream = archive.CreateEntry(name).Open();
        stream.Write(bytes);
    }
}
