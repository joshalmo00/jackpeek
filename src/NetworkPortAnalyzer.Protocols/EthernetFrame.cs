namespace NetworkPortAnalyzer.Protocols;

internal sealed record EthernetFrame(ushort EtherTypeOrLength, int PayloadOffset, ReadOnlyMemory<byte> Payload, ReadOnlyMemory<byte> Destination);

internal static class EthernetFrameReader
{
    public static EthernetFrame? TryRead(ReadOnlyMemory<byte> frame)
    {
        if (frame.Length < 14)
        {
            return null;
        }

        var span = frame.Span;
        var offset = 12;
        var type = Endian.U16(span[offset..(offset + 2)]);
        offset += 2;

        while ((type == 0x8100 || type == 0x88a8 || type == 0x9100) && frame.Length >= offset + 4)
        {
            offset += 2;
            type = Endian.U16(span[offset..(offset + 2)]);
            offset += 2;
        }

        if (offset > frame.Length)
        {
            return null;
        }

        return new EthernetFrame(type, offset, frame[offset..], frame[..6]);
    }
}
