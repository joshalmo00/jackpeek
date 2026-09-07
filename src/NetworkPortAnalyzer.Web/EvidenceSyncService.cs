using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Web;

public sealed class EvidenceSyncService : BackgroundService
{
    private readonly EvidenceStore _evidence;
    private readonly AuditLog _audit;

    public EvidenceSyncService(EvidenceStore evidence, AuditLog audit)
    {
        _evidence = evidence;
        _audit = audit;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var settings = _evidence.GetSettings();
            var delay = TimeSpan.FromMinutes(Math.Clamp(settings.NasSyncIntervalMinutes, 5, 1440));
            try
            {
                var result = _evidence.SyncPendingCache();
                if (result.PendingBefore > 0 || result.DeletedExpired > 0)
                {
                    _audit.Write("evidence.cache.sync", result.Failed == 0 ? "success" : "partial", detail: Summary(result));
                }

                foreach (var item in _evidence.ListPendingCache().Where(item => item.WarningDue))
                {
                    _audit.Write("evidence.cache.warning", "pending-expiration", item.EvidenceId, $"Expires at {item.ExpiresAt:u}");
                }
            }
            catch (Exception ex)
            {
                _audit.Write("evidence.cache.sync", "failed", detail: ex.Message);
            }

            await Task.Delay(delay, stoppingToken);
        }
    }

    private static string Summary(EvidenceSyncResult result) =>
        $"pending={result.PendingBefore}; uploaded={result.Uploaded}; deletedExpired={result.DeletedExpired}; failed={result.Failed}; lastError={result.LastError}";
}
