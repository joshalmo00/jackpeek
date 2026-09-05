using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Protocols;

public sealed class DiscoveryPacketParser
{
    private readonly LldpParser _lldp = new();
    private readonly CdpParser _cdp = new();

    public ProtocolPacket? TryParse(ReadOnlyMemory<byte> frame)
    {
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
