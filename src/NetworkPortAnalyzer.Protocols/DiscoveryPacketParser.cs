using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Protocols;

public sealed class DiscoveryPacketParser
{
    public const int MaxFrameLength = 65535;
    private readonly LldpParser _lldp = new();
    private readonly CdpParser _cdp = new();

    public ProtocolPacket? TryParse(ReadOnlyMemory<byte> frame)
    {
        if (frame.Length > MaxFrameLength) return null;
        var ethernet = EthernetFrameReader.TryRead(frame);
        if (ethernet is null)
        {
            return null;
        }

        if (ethernet.EtherTypeOrLength == 0x88cc)
        {
            return _lldp.TryParse(ethernet.Payload);
        }

        return _cdp.TryParse(ethernet);
    }
}
