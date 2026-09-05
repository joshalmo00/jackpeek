using System.Buffers.Binary;

namespace NetworkPortAnalyzer.Protocols;

internal static class Endian
{
    public static ushort U16(ReadOnlySpan<byte> bytes) => BinaryPrimitives.ReadUInt16BigEndian(bytes);
    public static uint U32(ReadOnlySpan<byte> bytes) => BinaryPrimitives.ReadUInt32BigEndian(bytes);
}
