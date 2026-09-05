using System.Net;
using System.Text;
using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Protocols;

public sealed class LldpParser
{
    public ProtocolPacket? TryParse(ReadOnlyMemory<byte> payload)
    {
        var data = payload.Span;
        var details = new List<TlvDetail>();
        var unknown = new List<TlvDetail>();
        var caps = new List<string>();
        string? chassis = null, port = null, device = null, portDescription = null, sysDescription = null, mgmt = null;
        int? ttl = null, nativeVlan = null, voiceVlan = null;

        for (var offset = 0; offset + 2 <= data.Length;)
        {
            var header = Endian.U16(data[offset..(offset + 2)]);
            offset += 2;
            var type = header >> 9;
            var length = header & 0x01ff;
            if (offset + length > data.Length)
            {
                unknown.Add(new("truncated", "Truncated LLDP TLV", Hex.Bytes(data[offset..])));
                break;
            }

            var value = data.Slice(offset, length);
            offset += length;
            if (type == 0)
            {
                details.Add(new("0", "End", string.Empty));
                break;
            }

            switch (type)
            {
                case 1:
                    chassis = DecodeChassisId(value);
                    details.Add(new("1", "Chassis ID", chassis));
                    break;
                case 2:
                    port = DecodePortId(value);
                    details.Add(new("2", "Port ID", port));
                    break;
                case 3 when value.Length >= 2:
                    ttl = Endian.U16(value[..2]);
                    details.Add(new("3", "TTL", ttl.Value.ToString()));
                    break;
                case 4:
                    portDescription = Text(value);
                    details.Add(new("4", "Port description", portDescription));
                    break;
                case 5:
                    device = Text(value);
                    details.Add(new("5", "System name", device));
                    break;
                case 6:
                    sysDescription = Text(value);
                    details.Add(new("6", "System description", sysDescription));
                    break;
                case 7 when value.Length >= 4:
                    caps.AddRange(DecodeCapabilities(Endian.U16(value[..2]), Endian.U16(value[2..4])));
                    details.Add(new("7", "System capabilities", string.Join(", ", caps)));
                    break;
                case 8:
                    mgmt = DecodeManagementAddress(value);
                    details.Add(new("8", "Management address", mgmt ?? "Not advertised"));
                    break;
                case 127:
                    var parsed = ParseOrganizationSpecific(value, ref nativeVlan, ref voiceVlan);
                    details.Add(parsed);
                    break;
                default:
                    unknown.Add(new(type.ToString(), "Unknown LLDP TLV", Hex.Bytes(value)));
                    break;
            }
        }

        if (chassis is null && port is null && device is null)
        {
            return null;
        }

        return new ProtocolPacket("LLDP", chassis, port, ttl, device, portDescription, sysDescription, null, null, mgmt,
            nativeVlan, voiceVlan, null, caps, details, unknown);
    }

    private static string DecodeChassisId(ReadOnlySpan<byte> value)
    {
        if (value.Length == 0)
        {
            return "Not advertised";
        }

        var subtype = value[0];
        var body = value[1..];
        return subtype switch
        {
            3 or 4 when body.Length >= 6 => Hex.Mac(body),
            5 => DecodeAddress(body),
            _ => Text(body)
        };
    }

    private static string DecodePortId(ReadOnlySpan<byte> value)
    {
        if (value.Length == 0)
        {
            return "Not advertised";
        }

        var subtype = value[0];
        var body = value[1..];
        return subtype switch
        {
            3 when body.Length >= 6 => Hex.Mac(body),
            4 => DecodeAddress(body),
            _ => Text(body)
        };
    }

    private static string? DecodeManagementAddress(ReadOnlySpan<byte> value)
    {
        if (value.Length < 2)
        {
            return null;
        }

        var addressLength = value[0];
        if (addressLength < 2 || value.Length < 1 + addressLength)
        {
            return null;
        }

        return DecodeAddress(value.Slice(1, addressLength));
    }

    private static string DecodeAddress(ReadOnlySpan<byte> addressWithSubtype)
    {
        if (addressWithSubtype.Length < 2)
        {
            return Hex.Bytes(addressWithSubtype);
        }

        var family = addressWithSubtype[0];
        var address = addressWithSubtype[1..];
        if ((family == 1 && address.Length == 4) || (family == 2 && address.Length == 16))
        {
            return new IPAddress(address.ToArray()).ToString();
        }

        return Hex.Bytes(address);
    }

    private static TlvDetail ParseOrganizationSpecific(ReadOnlySpan<byte> value, ref int? nativeVlan, ref int? voiceVlan)
    {
        if (value.Length < 4)
        {
            return new("127", "Organization specific", Hex.Bytes(value));
        }

        var oui = Hex.Bytes(value[..3]);
        var subtype = value[3];
        var body = value[4..];

        if (oui == "0080c2" && subtype == 1 && body.Length >= 2)
        {
            nativeVlan = Endian.U16(body[..2]);
            return new("127", "Port VLAN ID", nativeVlan.Value.ToString());
        }

        if (oui == "0012bb" && subtype == 2 && body.Length >= 3)
        {
            var applicationType = body[0];
            var policy = Endian.U16(body[1..3]);
            var vlan = (policy >> 5) & 0x0fff;
            if (applicationType is >= 1 and <= 5 && vlan > 0)
            {
                voiceVlan = vlan;
            }

            return new("127", "LLDP-MED network policy", $"application={applicationType}; vlan={vlan}");
        }

        return new("127", $"Organization specific {oui}/{subtype}", Hex.Bytes(body));
    }

    private static IEnumerable<string> DecodeCapabilities(ushort supported, ushort enabled)
    {
        string[] names = ["Other", "Repeater", "Bridge", "WLAN AP", "Router", "Telephone", "DOCSIS", "Station"];
        for (var i = 0; i < names.Length; i++)
        {
            var bit = 1 << i;
            if ((enabled & bit) != 0 || ((enabled == 0) && (supported & bit) != 0))
            {
                yield return names[i];
            }
        }
    }

    private static string Text(ReadOnlySpan<byte> bytes) => Encoding.UTF8.GetString(bytes).TrimEnd('\0', '\r', '\n');
}
