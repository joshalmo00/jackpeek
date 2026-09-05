using System.Net.NetworkInformation;
using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Windows;

public sealed class WindowsAdapterService
{
    public IReadOnlyList<AdapterInfo> GetAdapters()
    {
        return NetworkInterface.GetAllNetworkInterfaces()
            .Where(IsSupportedEthernetAdapter)
            .Select(nic => new AdapterInfo(
                nic.Id,
                nic.Name,
                nic.Description,
                FormatMac(nic.GetPhysicalAddress()),
                nic.OperationalStatus.ToString(),
                SafeIps(nic),
                false))
            .OrderByDescending(a => a.OperationalStatus == "Up")
            .ThenBy(a => a.Name)
            .ToArray();
    }

    public static bool IsSupportedEthernetAdapter(NetworkInterfaceType type, string name, string description, OperationalStatus status)
    {
        if (type != NetworkInterfaceType.Ethernet)
        {
            return false;
        }

        var text = $"{name} {description}".ToLowerInvariant();
        string[] blocked =
        [
            "wi-fi",
            "wifi",
            "wireless",
            "bluetooth",
            "loopback",
            "tunnel",
            "vpn",
            "tap",
            "tun",
            "virtual",
            "hyper-v",
            "vmware",
            "virtualbox",
            "wsl",
            "pseudo",
            "npcap",
            "docker",
            "zerotier",
            "tailscale"
        ];

        return !blocked.Any(text.Contains);
    }

    private static bool IsSupportedEthernetAdapter(NetworkInterface nic) =>
        IsSupportedEthernetAdapter(nic.NetworkInterfaceType, nic.Name, nic.Description, nic.OperationalStatus);

    private static IReadOnlyList<string> SafeIps(NetworkInterface nic)
    {
        try
        {
            return nic.GetIPProperties().UnicastAddresses.Select(a => a.Address.ToString()).ToArray();
        }
        catch
        {
            return [];
        }
    }

    private static string? FormatMac(PhysicalAddress address)
    {
        var bytes = address.GetAddressBytes();
        return bytes.Length == 0 ? null : string.Join(":", bytes.Select(b => b.ToString("x2")));
    }
}
