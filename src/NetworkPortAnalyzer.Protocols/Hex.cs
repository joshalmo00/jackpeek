namespace NetworkPortAnalyzer.Protocols;

internal static class Hex
{
    public static string Bytes(ReadOnlySpan<byte> bytes) => Convert.ToHexString(bytes).ToLowerInvariant();

    public static string Mac(ReadOnlySpan<byte> bytes) =>
        bytes.Length < 6 ? Bytes(bytes) : string.Join(":", bytes[..6].ToArray().Select(b => b.ToString("x2")));
}
