using System.Net.NetworkInformation;
using System.Text.Json;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Reflection;
using SharpPcap;
using NetworkPortAnalyzer.Capture;
using NetworkPortAnalyzer.Protocols;
using NetworkPortAnalyzer.Core;
using NetworkPortAnalyzer.Windows;
using NetworkPortAnalyzer.Web;

var tests = new (string Name, Action Test)[]
{
    ("parses LLDP switch identity and VLANs", Tests.ParseLldp),
    ("parses CDP switch identity and VLANs", Tests.ParseCdp),
    ("ignores unrelated Ethernet frames", Tests.IgnoreOtherTraffic),
    ("filters to physical wired Ethernet adapters", Tests.FilterEthernetAdapters),
    ("approves only configured Windows accounts", Tests.AccessPolicyApprovesConfiguredAccounts),
    ("rejects a license for another product", Tests.RejectsWrongLicenseProduct),
    ("rejects an expired license", Tests.RejectsExpiredLicense),
    ("retains unknown LLDP and CDP fields as hex", Tests.UnknownTlvs),
    ("handles malformed and truncated discovery packets", Tests.MalformedPackets),
    ("leaves missing advertised fields unset", Tests.MissingFields),
    ("neutralizes formula cells and escapes CSV values", Tests.SafeCsv),
    ("package checksum matches exact JSON entry bytes", Tests.PackageChecksum),
    ("rejects remote origins and rebinding hostnames", Tests.LocalOriginPolicy),
    ("serializes captures and releases completed jobs", Tests.CaptureCoordination),
    ("detaches capture handlers on success and failure", Tests.CaptureCleanup),
    ("keeps neighbor groups distinct and reports conflicts", Tests.NeighborConflicts),
    ("creates port ledger rows and marks incomplete identities", Tests.PortLedgerRows),
    ("detects port ledger changes against the previous scan", Tests.PortLedgerChanges),
    ("keeps local port ledger rows when NAS mirror fails", Tests.PortLedgerMirrorFailure)
};

var failed = 0;
foreach (var test in tests)
{
    try
    {
        test.Test();
        Console.WriteLine($"PASS {test.Name}");
    }
    catch (Exception ex)
    {
        failed++;
        Console.Error.WriteLine($"FAIL {test.Name}: {ex.Message}");
    }
}

return failed == 0 ? 0 : 1;

internal static class Tests
{
    public static void AccessPolicyApprovesConfiguredAccounts()
    {
        var service = new AccessPolicyService();
        var now = DateTimeOffset.UtcNow;
        var approved = service.Evaluate(new WorkstationIdentity(
            "FIELD-LAPTOP-1",
            "RWJBH",
            "Joshua Alvarez",
            "S-1-5-21-fixture",
            "Windows",
            "1.0",
            now));
        var denied = service.Evaluate(new WorkstationIdentity(
            "FIELD-LAPTOP-2",
            "RWJBH",
            "Unlisted User",
            "S-1-5-21-other",
            "Windows",
            "1.0",
            now));

        Assert(approved.IsApproved, "Joshua Alvarez is pre-approved");
        Assert(approved.Account == "joshua.alvarez@rwjbh.org", "Windows display name normalized to RWJBH email");
        Assert(approved.ApprovedUsers.Contains("darien.valerin@rwjbh.org"), "Darien Valerin remains pre-approved");
        Assert(!denied.IsApproved, "unlisted users are not approved");
    }

    public static void PortLedgerRows()
    {
        var now = DateTimeOffset.UtcNow;
        var complete = Observation("LLDP", "NB-TEST-1stFloor-Stack1", "switch-chassis", "Gi1/0/13", 20, "10.10.20.2", now);
        var incomplete = Observation("LLDP", null, null, "Gi1/0/14", 30, null, now);
        var record = Evidence("scan1", now, [complete, incomplete]);
        var entries = PortLedgerStore.BuildEntries(record);
        Assert(entries.Count == 2, "one row per observed port identity");
        var port = entries.Single(e => e.SwitchPort == "Gi1/0/13");
        Assert(port.HasCompleteIdentity, "switch and port creates complete identity");
        Assert(port.SwitchName == "NB-TEST-1stFloor-Stack1", "switch recorded");
        Assert(port.NativeVlan == 20, "vlan recorded");
        Assert(port.ManagementIp == "10.10.20.2", "management IP recorded");
        Assert(port.UserName == "Darien Valerin", "scanner identity recorded");
        Assert(entries.Single(e => e.SwitchPort == "Gi1/0/14").HasCompleteIdentity == false, "missing switch is incomplete");
    }

    public static void PortLedgerChanges()
    {
        var root = TempRoot();
        try
        {
            var settings = TestSettings(root, null);
            var store = new PortLedgerStore(() => settings);
            var first = DateTimeOffset.UtcNow.AddDays(-30);
            var second = DateTimeOffset.UtcNow;
            store.Save(Evidence("scan1", first, [Observation("LLDP", "NB-TEST-1stFloor-Stack1", "chassis", "Gi1/0/13", 20, "10.10.20.2", first)]));
            store.Save(Evidence("scan2", second, [Observation("LLDP", "NB-TEST-1stFloor-Stack1", "chassis", "Gi1/0/13", 30, "10.10.30.2", second)]));
            var latest = store.List().First();
            Assert(latest.ChangedSincePrevious, "latest row highlighted");
            Assert(latest.Changes.Any(c => c.Field == "Native VLAN" && c.Previous == "20" && c.Current == "30"), "vlan change");
            Assert(latest.Changes.Any(c => c.Field == "Management IP" && c.Previous == "10.10.20.2" && c.Current == "10.10.30.2"), "ip change");
        }
        finally
        {
            Directory.Delete(root, true);
        }
    }

    public static void PortLedgerMirrorFailure()
    {
        var root = TempRoot();
        try
        {
            var blocker = Path.Combine(root, "not-a-directory");
            File.WriteAllText(blocker, "fixture");
            var settings = TestSettings(Path.Combine(root, "local"), blocker);
            var store = new PortLedgerStore(() => settings);
            var result = store.Save(Evidence("scan1", DateTimeOffset.UtcNow, [Observation("LLDP", "Switch-A", "chassis", "Gi1/0/1", 10, null, DateTimeOffset.UtcNow)]));
            Assert(result.EntriesWritten == 1, "local ledger row written");
            Assert(result.MirrorFailures == 1, "mirror failure reported");
            Assert(Directory.EnumerateFiles(Path.Combine(settings.LocalHistoryPath, "PortLedger"), "*.json").Count() == 1, "local row retained");
        }
        finally
        {
            Directory.Delete(root, true);
        }
    }

    public static void NeighborConflicts()
    {
        var packet = new DiscoveryPacketParser().TryParse(Frame(0x88cc,
            Tlv(1, Bytes(7, "fixture-switch")), Tlv(2, Bytes(5, "Gi1/0/1")), Tlv(0, [])))!;
        var now = DateTimeOffset.UtcNow;
        var groups = ObservationAggregator.Aggregate("adapter", [
            packet with { NativeVlan = 10 }, packet with { NativeVlan = 20 },
            packet with { PortId = "Gi1/0/2" }, packet with { Protocol = "CDP" }
        ], now, now.AddSeconds(30));
        Assert(groups.Count == 3, "protocol and port identities remain separate");
        var changed = groups.Single(g => g.FramesSeen == 2);
        Assert(changed.Latest.NativeVlan == 20, "latest value retained");
        Assert(changed.Conflicts.Single().Contains("10 vs 20"), "conflicting advertised VLANs reported");
        Assert(groups.Where(g => g.FramesSeen == 1).All(g => g.Conflicts.Count == 0), "missing values are not conflicts");
    }

    public static void CaptureCleanup()
    {
        foreach (var failFilter in new[] { false, true })
        {
            var device = DispatchProxy.Create<ICaptureDevice, CaptureDeviceProxy>();
            var proxy = (CaptureDeviceProxy)(object)device;
            proxy.FailFilter = failFilter;
            var capture = new PassiveCaptureService(_ => device);
            for (var run = 0; run < 2; run++)
            {
                var result = capture.ScanAsync("fixture", "adapter", TimeSpan.Zero, CancellationToken.None).GetAwaiter().GetResult();
                Assert((result.Error is not null) == failFilter, "capture outcome");
                Assert(proxy.Handlers == 0, "event handler detached");
                Assert(proxy.Closes == run + 1, "opened device closed per run");
            }
        }
    }

    public static void UnknownTlvs()
    {
        var lldp = new DiscoveryPacketParser().TryParse(Frame(0x88cc, Tlv(5, Text("Fixture")), Tlv(99, [0, 0xab, 0xff]), Tlv(0, [])));
        Assert(lldp!.UnknownTlvs.Single().Value == "00abff", "LLDP hex value");
        var cdp = new DiscoveryPacketParser().TryParse(CdpFrame(CdpTlv(1, Text("Fixture")), CdpTlv(0x9999, [0xde, 0xad])));
        Assert(cdp!.UnknownTlvs.Single().Value == "dead", "CDP hex value");
    }

    public static void MalformedPackets()
    {
        var parser = new DiscoveryPacketParser();
        var fixtures = new[] {
            Frame(0x88cc, Tlv(5, Text("Fixture")), [0xfe, 0xff, 1]),
            CdpFrame(CdpTlv(1, Text("Fixture")), [0, 2, 0xff, 0xff, 1]),
            CdpFrame(CdpTlv(1, Text("Fixture")), [0, 2, 0, 0]),
            Frame(0x88cc, Tlv(8, [255, 1]))
        };
        foreach (var fixture in fixtures)
            for (var length = 0; length <= fixture.Length; length++)
                _ = parser.TryParse(fixture.AsMemory(0, length));
        var random = new Random(20260906);
        for (var i = 0; i < 1000; i++)
        {
            var bytes = new byte[random.Next(0, 256)]; random.NextBytes(bytes);
            _ = parser.TryParse(Frame(0x88cc, bytes));
            _ = parser.TryParse(CdpFrame(bytes));
        }
        Assert(parser.TryParse(fixtures[0])!.UnknownTlvs.Any(t => t.Name.Contains("Truncated")), "truncated LLDP is labeled");
        Assert(parser.TryParse(fixtures[1])!.UnknownTlvs.Any(t => t.Name.Contains("Truncated")), "truncated CDP is labeled");
    }

    public static void MissingFields()
    {
        var packet = new DiscoveryPacketParser().TryParse(Frame(0x88cc, Tlv(5, Text("Fixture")), Tlv(0, [])))!;
        Assert(packet.ManagementAddress is null && packet.NativeVlan is null && packet.VoiceVlan is null, "missing values are not invented");
    }

    public static void SafeCsv()
    {
        foreach (var value in new[] { "=1+1", "+SUM(1)", "-1+1", "@SUM(1)", "  =1", "\t=1", "\r=1", "\n=1", "＝1" })
            Assert(EvidenceExport.CsvCell(value).StartsWith("\"'"), "formula/control cell must be text");
        Assert(EvidenceExport.CsvCell("switch,\"east\"") == "\"switch,\"\"east\"\"\"", "CSV quote escaping");
        Assert(EvidenceExport.CsvCell(null) == "\"\"", "null CSV cell");
    }

    public static void PackageChecksum()
    {
        var now = DateTimeOffset.UtcNow;
        var record = new EvidenceRecord("fixture", now,
            new WorkstationIdentity("TEST", null, null, null, "Windows", "1.0.0", now),
            new EvidenceSettings(true, false, "C:\\Test", null, 30, true, false, false, 0, false, false, ["json"],
                EvidenceStore.StorageLocalOnly, "C:\\Test\\Cache", 24, [3, 2], 60, true),
            new ScanResult("fixture", "adapter", now, now, 0, [], null), "record-checksum-is-not-a-file-checksum");
        using var zip = new ZipArchive(new MemoryStream(EvidenceExport.Package(record, "<h1>Fixture</h1>")), ZipArchiveMode.Read);
        using var stream = zip.GetEntry("jackpeek-evidence-fixture.json")!.Open();
        using var bytes = new MemoryStream(); stream.CopyTo(bytes);
        Assert(bytes.ToArray().SequenceEqual(EvidenceExport.Json(record)), "download and ZIP JSON must match");
        var hash = Convert.ToHexString(SHA256.HashData(bytes.ToArray())).ToLowerInvariant();
        using var checksum = new StreamReader(zip.GetEntry("jackpeek-evidence-fixture.sha256")!.Open());
        Assert(checksum.ReadToEnd() == $"{hash}  jackpeek-evidence-fixture.json\n", "checksum covers exact file bytes");
        using var manifest = JsonDocument.Parse(zip.GetEntry("manifest.json")!.Open());
        Assert(manifest.RootElement.GetProperty("sha256").GetString() == hash, "manifest file checksum");
        Assert(manifest.RootElement.GetProperty("recordSha256").GetString() == record.Sha256, "record checksum kept separately");
    }

    public static void LocalOriginPolicy()
    {
        Assert(LocalRequestPolicy.IsAllowedHost("127.0.0.1"), "literal loopback");
        Assert(!LocalRequestPolicy.IsAllowedHost("attacker.example"), "rebinding hostname");
        Assert(LocalRequestPolicy.IsAllowedOrigin("http://127.0.0.1:52521", 52521), "same origin");
        Assert(LocalRequestPolicy.IsAllowedOrigin(null, 52521), "native local client");
        foreach (var origin in new[] { "null", "https://example.com", "http://127.0.0.1:52522", "http://127.0.0.1.evil.test:52521", "http://user@127.0.0.1:52521" })
            Assert(!LocalRequestPolicy.IsAllowedOrigin(origin, 52521), "foreign origin blocked");
    }

    public static void CaptureCoordination()
    {
        var scans = new ScanRegistry();
        var accepted = 0;
        Parallel.For(0, 100, i => { if (scans.TryStart(i.ToString())) Interlocked.Increment(ref accepted); });
        Assert(accepted == 1, "exactly one concurrent capture accepted");
        var sequential = new ScanRegistry();
        Assert(sequential.TryStart("one"), "first capture");
        Assert(!sequential.TryStart("two"), "overlap rejected");
        sequential.Set("one", new ScanStatus("one", "complete", null, null, "capture failed"));
        Assert(sequential.TryStart("two"), "next capture after failure");
    }

    public static void ParseLldp()
    {
        var parser = new DiscoveryPacketParser();
        var packet = parser.TryParse(Frame(0x88cc,
            Tlv(1, [4, 0, 17, 34, 51, 68, 85]),
            Tlv(2, Bytes(5, "Gi1/0/24")),
            Tlv(3, [0, 120]),
            Tlv(5, Text("Switch-A")),
            Tlv(127, [0x00, 0x80, 0xc2, 0x01, 0x00, 0x14]),
            Tlv(127, [0x00, 0x12, 0xbb, 0x02, 0x01, 0x00, 0xa0]),
            Tlv(0, [])));

        Assert(packet is not null, "packet should parse");
        Assert(packet!.Protocol == "LLDP", "protocol");
        Assert(packet.DeviceName == "Switch-A", "device");
        Assert(packet.PortId == "Gi1/0/24", "port");
        Assert(packet.NativeVlan == 20, "native vlan");
        Assert(packet.VoiceVlan == 5, "voice vlan");
    }

    public static void ParseCdp()
    {
        var parser = new DiscoveryPacketParser();
        var packet = parser.TryParse(CdpFrame(
            CdpTlv(0x0001, Text("Switch-B")),
            CdpTlv(0x0003, Text("GigabitEthernet1/0/1")),
            CdpTlv(0x0004, [0, 0, 0, 9]),
            CdpTlv(0x000a, [0, 30]),
            CdpTlv(0x000b, [1]),
            CdpTlv(0x000e, [0, 0, 40])));

        Assert(packet is not null, "packet should parse");
        Assert(packet!.Protocol == "CDP", "protocol");
        Assert(packet.DeviceName == "Switch-B", "device");
        Assert(packet.NativeVlan == 30, "native vlan");
        Assert(packet.VoiceVlan == 40, "voice vlan");
        Assert(packet.Duplex == "Full", "duplex");
    }

    public static void IgnoreOtherTraffic()
    {
        var parser = new DiscoveryPacketParser();
        Assert(parser.TryParse(Frame(0x0800, Text("ordinary payload"))) is null, "IPv4 should be ignored");
    }

    public static void FilterEthernetAdapters()
    {
        Assert(WindowsAdapterService.IsSupportedEthernetAdapter(NetworkInterfaceType.Ethernet, "Ethernet", "Intel Ethernet Controller I219-LM", OperationalStatus.Up), "physical ethernet");
        Assert(WindowsAdapterService.IsSupportedEthernetAdapter(NetworkInterfaceType.Ethernet, "USB Ethernet", "Realtek USB GbE Family Controller", OperationalStatus.Up), "usb dock ethernet");
        Assert(!WindowsAdapterService.IsSupportedEthernetAdapter(NetworkInterfaceType.Wireless80211, "Wi-Fi", "Realtek 8821CE Wireless LAN", OperationalStatus.Up), "wifi blocked");
        Assert(!WindowsAdapterService.IsSupportedEthernetAdapter(NetworkInterfaceType.Tunnel, "Tunnel", "Microsoft Teredo Tunneling Adapter", OperationalStatus.Up), "tunnel blocked");
        Assert(!WindowsAdapterService.IsSupportedEthernetAdapter(NetworkInterfaceType.Loopback, "Loopback", "Software Loopback Interface", OperationalStatus.Up), "loopback blocked");
        Assert(!WindowsAdapterService.IsSupportedEthernetAdapter(NetworkInterfaceType.Ethernet, "vEthernet (Default Switch)", "Hyper-V Virtual Ethernet Adapter", OperationalStatus.Up), "hyper-v blocked");
        Assert(!WindowsAdapterService.IsSupportedEthernetAdapter(NetworkInterfaceType.Ethernet, "VPN Adapter", "TAP-Windows Adapter V9", OperationalStatus.Up), "vpn blocked");
    }

    public static void RejectsWrongLicenseProduct()
    {
        var license = new LicenseDocument("test", "OtherProduct", "Trial", "Test", DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddDays(1), null, [], "");
        var status = LicenseService.ValidateContent(JsonSerializer.Serialize(license));
        Assert(!status.IsValid && status.State == "Invalid", "wrong product should be rejected");
    }

    public static void RejectsExpiredLicense()
    {
        var license = new LicenseDocument("test", "JackPeek", "Trial", "Test", DateTimeOffset.UtcNow.AddDays(-2), DateTimeOffset.UtcNow.AddDays(-1), null, [], "");
        var status = LicenseService.ValidateContent(JsonSerializer.Serialize(license));
        Assert(!status.IsValid && status.State == "Expired", "expired license should be rejected");
    }

    private static byte[] Frame(ushort etherType, params byte[][] payloads)
    {
        var payload = payloads.SelectMany(x => x).ToArray();
        return [0x01, 0x80, 0xc2, 0, 0, 0x0e, 0, 1, 2, 3, 4, 5, (byte)(etherType >> 8), (byte)etherType, .. payload];
    }

    private static byte[] CdpFrame(params byte[][] tlvs)
    {
        var payload = tlvs.SelectMany(x => x).ToArray();
        return [0x01, 0x00, 0x0c, 0xcc, 0xcc, 0xcc, 0, 1, 2, 3, 4, 5, 0, 60,
            0xaa, 0xaa, 0x03, 0, 0, 0x0c, 0x20, 0, 2, 180, 0, 0, .. payload];
    }

    private static byte[] Tlv(int type, byte[] value)
    {
        var header = (type << 9) | value.Length;
        return [(byte)(header >> 8), (byte)header, .. value];
    }

    private static byte[] CdpTlv(int type, byte[] value)
    {
        var length = value.Length + 4;
        return [(byte)(type >> 8), (byte)type, (byte)(length >> 8), (byte)length, .. value];
    }

    private static byte[] Bytes(byte prefix, string text) => [prefix, .. Text(text)];
    private static byte[] Text(string text) => System.Text.Encoding.UTF8.GetBytes(text);

    private static string TempRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "JackPeekTests", Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(root);
        return root;
    }

    private static EvidenceSettings TestSettings(string localPath, string? archivePath) =>
        new(true, true, localPath, archivePath, 30, true, false, false, 0, false, true, ["json"],
            EvidenceStore.StorageLocalAndNasMirror, Path.Combine(localPath, "Cache"), 24, [3, 2], 60, true);

    private static EvidenceRecord Evidence(string scanId, DateTimeOffset createdAt, IReadOnlyList<Observation> observations)
    {
        var workstation = new WorkstationIdentity("TECH-LAPTOP", "CORP", "Darien Valerin", "S-1-5-21-fixture", "Windows", "1.0.0", createdAt);
        var settings = TestSettings("C:\\JackPeekTest\\Evidence", null);
        var scan = new ScanResult(scanId, "adapter", createdAt, createdAt.AddSeconds(5), observations.Sum(o => o.FramesSeen), observations, null);
        return new EvidenceRecord(scanId, createdAt, workstation, settings, scan, "fixture");
    }

    private static Observation Observation(string protocol, string? device, string? chassis, string? port, int? vlan, string? managementIp, DateTimeOffset seen)
    {
        var packet = new ProtocolPacket(protocol, chassis, port, 120, device, port, null, null, null, managementIp, vlan, null, "Full", ["Bridge"], [], []);
        return new Observation($"{protocol}:{device}:{port}", protocol, "adapter", seen, seen, 1, packet, []);
    }

    private static void Assert(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException(message);
        }
    }
}

public class CaptureDeviceProxy : DispatchProxy
{
    public bool FailFilter { get; set; }
    public int Handlers { get; private set; }
    public int Closes { get; private set; }
    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
    {
        switch (targetMethod!.Name)
        {
            case "add_OnPacketArrival": Handlers++; break;
            case "remove_OnPacketArrival": Handlers--; break;
            case "Close": Closes++; break;
            case "set_Filter" when FailFilter: throw new InvalidOperationException("Synthetic filter failure");
        }
        return targetMethod.ReturnType == typeof(void) ? null : targetMethod.ReturnType.IsValueType ? Activator.CreateInstance(targetMethod.ReturnType) : null;
    }
}
