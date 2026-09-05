using System.Net.NetworkInformation;
using System.Text.Json;
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
    ("rejects a license for another product", Tests.RejectsWrongLicenseProduct),
    ("rejects an expired license", Tests.RejectsExpiredLicense)
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

    private static void Assert(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException(message);
        }
    }
}
