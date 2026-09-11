namespace NetworkPortAnalyzer.Core;

public sealed record AdapterInfo(
    string Id,
    string Name,
    string Description,
    string? MacAddress,
    string OperationalStatus,
    IReadOnlyList<string> IpAddresses,
    bool CaptureAvailable);

public sealed record AdapterTrafficSnapshot(
    string AdapterId,
    DateTimeOffset CapturedAt,
    long BytesReceived,
    long BytesSent);

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
    DateTimeOffset CapturedAt,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] string? DisplayName = null,
    IReadOnlyList<string>? MatchedIdentityFields = null,
    IReadOnlyList<string>? ChangedIdentityFields = null,
    IReadOnlyList<string>? UnannouncedIdentityFields = null);

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
    IReadOnlyList<string> AllowedExportFormats,
    string StorageMode,
    string LocalCachePath,
    int CacheExpirationHours,
    IReadOnlyList<int> CacheWarningHours,
    int NasSyncIntervalMinutes,
    bool AdminManagedCacheEncryption);

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
    string? LocalJsonPath,
    string? MirrorJsonPath,
    string Sha256,
    string StorageState,
    DateTimeOffset? CacheExpiresAt,
    bool PriorReviewFound,
    DateTimeOffset? PriorReviewCreatedAt,
    string? PriorReviewEvidenceId,
    int PriorReviewMatchScore,
    bool AdminReviewRequired,
    string? AdminReviewReason,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] string? DisplayName = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<string>? MatchedFields = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<string>? ChangedFields = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<string>? UnannouncedFields = null);

public sealed record EvidenceRecord(
    string EvidenceId,
    DateTimeOffset CreatedAt,
    WorkstationIdentity Workstation,
    EvidenceSettings Settings,
    ScanResult Scan,
    string Sha256);

public sealed record PortLedgerEntry(
    string LedgerId,
    DateTimeOffset ScannedAt,
    string? SwitchName,
    string? SwitchChassisId,
    string? SwitchPort,
    IReadOnlyList<string> Protocols,
    int? NativeVlan,
    int? VoiceVlan,
    string? ManagementIp,
    string? Duplex,
    IReadOnlyList<string> Capabilities,
    string Workstation,
    string? UserName,
    string? DomainName,
    string? UserSid,
    string AdapterId,
    string EvidenceId,
    string ScanId,
    bool HasCompleteIdentity,
    string? IdentityKey,
    string? LocalJsonPath,
    string? MirrorJsonPath,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] string? DisplayName = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] string? PortDescription = null);

public sealed record PortChange(
    string Field,
    string? Previous,
    string? Current);

public sealed record PortLedgerSummary(
    PortLedgerEntry Entry,
    IReadOnlyList<PortChange> Changes,
    bool ChangedSincePrevious);

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

public sealed record PendingEvidenceCacheItem(
    string EvidenceId,
    DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt,
    int HoursUntilExpiration,
    bool WarningDue,
    string CachePath,
    string Sha256,
    bool UploadedToNas);

public sealed record EvidenceSyncResult(
    int PendingBefore,
    int Uploaded,
    int DeletedExpired,
    int Failed,
    string? LastError);

public sealed record NasHealthStatus(
    bool NasEnabled,
    bool ArchiveConfigured,
    bool Connected,
    string State,
    string? ArchivePath,
    int RetainedLocalLogs,
    int PendingUploadLogs,
    int ExpiringSoonLogs,
    DateTimeOffset? NextExpiration,
    string? LastError,
    IReadOnlyList<PendingEvidenceCacheItem> Pending);

public sealed record IdentityMatch(
    int Score,
    IReadOnlyList<string> MatchedFields,
    IReadOnlyList<string> ChangedFields,
    IReadOnlyList<string> UnannouncedFields,
    string Reason);
