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

public sealed record WorkstationIdentity(
    string MachineName,
    string? DomainName,
    string? UserName,
    string? UserSid,
    string OperatingSystem,
    string AppVersion,
    DateTimeOffset CapturedAt);

public sealed record EvidenceSettings(
    bool SecureMode,
    bool IncludeWindowsUser,
    string LocalHistoryPath,
    string? ArchiveMirrorPath,
    int MaxCaptureDurationSeconds,
    bool AllowSettingsEdit,
    bool RequireValidLicense,
    bool RequireEvidenceEncryption,
    int EvidenceRetentionDays,
    bool AllowEvidenceDeletion,
    bool AllowNasMirror,
    IReadOnlyList<string> AllowedExportFormats);

public sealed record EvidenceSummary(
    string EvidenceId,
    DateTimeOffset CreatedAt,
    string MachineName,
    string? UserName,
    string AdapterId,
    string? DeviceName,
    string? SwitchPort,
    int FramesCaptured,
    int Observations,
    string LocalJsonPath,
    string? MirrorJsonPath,
    string Sha256);

public sealed record EvidenceRecord(
    string EvidenceId,
    DateTimeOffset CreatedAt,
    WorkstationIdentity Workstation,
    EvidenceSettings Settings,
    ScanResult Scan,
    string Sha256);

public sealed record LicenseDocument(
    string LicenseId,
    string Product,
    string Edition,
    string Organization,
    DateTimeOffset ValidFrom,
    DateTimeOffset ValidUntil,
    string? MachineId,
    IReadOnlyList<string> Features,
    string Signature);

public sealed record LicenseStatus(
    bool IsValid,
    string State,
    string? LicenseId,
    string? Edition,
    string? Organization,
    DateTimeOffset? ValidUntil,
    IReadOnlyList<string> Features,
    string? Detail);

public sealed record AuditEvent(
    DateTimeOffset CreatedAt,
    string Action,
    string Outcome,
    string? EvidenceId,
    string? Detail);
