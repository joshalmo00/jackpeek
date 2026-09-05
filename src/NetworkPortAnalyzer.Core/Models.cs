namespace NetworkPortAnalyzer.Core;

public sealed record AdapterInfo(
    string Id,
    string Name,
    string Description,
    string? MacAddress,
    string OperationalStatus,
    IReadOnlyList<string> IpAddresses,
    bool CaptureAvailable);

public sealed record RawFrame(byte[] Data, DateTimeOffset Timestamp, string AdapterId);

public sealed record ProtocolPacket(
    string Protocol,
    string? ChassisId,
    string? PortId,
    int? TtlSeconds,
    string? DeviceName,
    string? PortDescription,
    string? SystemDescription,
    string? Platform,
    string? SoftwareVersion,
    string? ManagementAddress,
    int? NativeVlan,
    int? VoiceVlan,
    string? Duplex,
    IReadOnlyList<string> Capabilities,
    IReadOnlyList<TlvDetail> Details,
    IReadOnlyList<TlvDetail> UnknownTlvs);

public sealed record TlvDetail(string Type, string Name, string Value);

public sealed record Observation(
    string Key,
    string Protocol,
    string AdapterId,
    DateTimeOffset FirstSeen,
    DateTimeOffset LastSeen,
    int FramesSeen,
    ProtocolPacket Latest,
    IReadOnlyList<string> Conflicts);

public sealed record ScanResult(
    string ScanId,
    string AdapterId,
    DateTimeOffset StartedAt,
    DateTimeOffset CompletedAt,
    int FramesCaptured,
    IReadOnlyList<Observation> Observations,
    string? Error);
