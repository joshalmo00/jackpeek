using System.Net;
using System.Text;
using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Protocols;

public sealed class CdpParser
{
    private static readonly byte[] CdpDestination = [0x01, 0x00, 0x0c, 0xcc, 0xcc, 0xcc];

    internal ProtocolPacket? TryParse(EthernetFrame ethernet)
    {
        if (!ethernet.Destination.Span.SequenceEqual(CdpDestination))
        {
            return null;
        }

        var p = ethernet.Payload.Span;
        if (p.Length < 12 || p[0] != 0xaa || p[1] != 0xaa || p[2] != 0x03 ||
            p[3] != 0x00 || p[4] != 0x00 || p[5] != 0x0c || p[6] != 0x20 || p[7] != 0x00)
        {
            return null;
        }

        var offset = 12;
        var ttl = (int?)p[9];
        var details = new List<TlvDetail>
        {
            new("header", "CDP version", p[8].ToString()),
            new("header", "TTL", ttl.Value.ToString())
        };
        var unknown = new List<TlvDetail>();
        var caps = new List<string>();
        string? chassis = null, port = null, platform = null, software = null, mgmt = null, duplex = null;
        int? nativeVlan = null, voiceVlan = null;

        while (offset + 4 <= p.Length)
        {
            var type = Endian.U16(p[offset..(offset + 2)]);
            var length = Endian.U16(p[(offset + 2)..(offset + 4)]);
            if (length < 4 || offset + length > p.Length)
            {
                unknown.Add(new(type.ToString("x4"), "Truncated CDP TLV", Hex.Bytes(p[offset..])));
                break;
            }

            var value = p.Slice(offset + 4, length - 4);
            offset += length;
            switch (type)
            {
                case 0x0001:
                    chassis = Text(value);
                    details.Add(new("0x0001", "Device ID", chassis));
                    break;
                case 0x0002:
                    mgmt = DecodeAddresses(value);
                    details.Add(new("0x0002", "Address", mgmt ?? "Not advertised"));
                    break;
                case 0x0003:
                    port = Text(value);
                    details.Add(new("0x0003", "Port ID", port));
                    break;
                case 0x0004 when value.Length >= 4:
                    caps.AddRange(DecodeCapabilities(Endian.U32(value[..4])));
                    details.Add(new("0x0004", "Capabilities", string.Join(", ", caps)));
                    break;
                case 0x0005:
                    software = Text(value);
                    details.Add(new("0x0005", "Software version", software));
                    break;
                case 0x0006:
                    platform = Text(value);
                    details.Add(new("0x0006", "Platform", platform));
                    break;
                case 0x000a when value.Length >= 2:
                    nativeVlan = Endian.U16(value[..2]);
                    details.Add(new("0x000a", "Native VLAN", nativeVlan.Value.ToString()));
                    break;
                case 0x000b when value.Length >= 1:
                    duplex = value[0] switch { 0 => "Half", 1 => "Full", _ => $"Unknown ({value[0]})" };
                    details.Add(new("0x000b", "Duplex", duplex));
                    break;
                case 0x000e when value.Length >= 3:
                    voiceVlan = Endian.U16(value[1..3]);
                    details.Add(new("0x000e", "Voice VLAN", voiceVlan.Value.ToString()));
                    break;
                default:
                    unknown.Add(new($"0x{type:x4}", "Unknown CDP TLV", Hex.Bytes(value)));
                    break;
            }
        }

        if (chassis is null && port is null)
        {
            return null;
        }

        return new ProtocolPacket("CDP", chassis, port, ttl, chassis, null, null, platform, software, mgmt,
            nativeVlan, voiceVlan, duplex, caps, details, unknown);
    }

    private static string? DecodeAddresses(ReadOnlySpan<byte> value)
    {
        if (value.Length < 4)
        {
            return null;
        }

        var count = Endian.U32(value[..4]);
        var offset = 4;
        for (var i = 0; i < count && offset + 4 <= value.Length; i++)
        {
            var protocolType = value[offset++];
            var protocolLength = value[offset++];
            if (offset + protocolLength + 2 > value.Length)
            {
                return null;
            }

            var protocol = value.Slice(offset, protocolLength);
            offset += protocolLength;
            var addressLength = Endian.U16(value[offset..(offset + 2)]);
            offset += 2;
            if (offset + addressLength > value.Length)
            {
                return null;
            }

            var address = value.Slice(offset, addressLength);
            offset += addressLength;
            if (protocolType == 1 && protocolLength == 1 && protocol[0] == 0xcc && addressLength == 4)
            {
                return new IPAddress(address.ToArray()).ToString();
            }
        }

        return null;
    }

    private static IEnumerable<string> DecodeCapabilities(uint bits)
    {
        (uint Bit, string Name)[] names =
        [
            (0x01, "Router"),
            (0x02, "Transparent bridge"),
            (0x04, "Source-route bridge"),
            (0x08, "Switch"),
            (0x10, "Host"),
            (0x20, "IGMP"),
            (0x40, "Repeater"),
            (0x80, "Phone")
        ];

        foreach (var item in names)
        {
            if ((bits & item.Bit) != 0)
            {
                yield return item.Name;
            }
        }
    }

    private static string Text(ReadOnlySpan<byte> bytes) => Encoding.UTF8.GetString(bytes).TrimEnd('\0', '\r', '\n');
}
