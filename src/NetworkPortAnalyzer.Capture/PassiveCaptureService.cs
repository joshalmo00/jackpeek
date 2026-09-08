using NetworkPortAnalyzer.Core;
using NetworkPortAnalyzer.Protocols;
using SharpPcap;

namespace NetworkPortAnalyzer.Capture;

public sealed class PassiveCaptureService
{
    private const string PassiveDiscoveryFilter = "ether proto 0x88cc or ether dst 01:00:0c:cc:cc:cc";
    private readonly DiscoveryPacketParser _parser = new();
    private readonly Func<string, ICaptureDevice?> _deviceResolver;

    public PassiveCaptureService() : this(FindDevice) { }
    public PassiveCaptureService(Func<string, ICaptureDevice?> deviceResolver) => _deviceResolver = deviceResolver;

    public IReadOnlyList<AdapterInfo> GetCaptureDevices(IReadOnlyList<AdapterInfo> windowsAdapters)
    {
        try
        {
            var devices = CaptureDeviceList.Instance;
            return windowsAdapters
                .Select(adapter => adapter with
                {
                    CaptureAvailable = devices.Any(d => d.Name.Contains(adapter.Id, StringComparison.OrdinalIgnoreCase))
                })
                .ToArray();
        }
        catch
        {
            return windowsAdapters;
        }
    }

    public async Task<ScanResult> ScanAsync(string scanId, string adapterId, TimeSpan duration, CancellationToken cancellationToken)
    {
        var started = DateTimeOffset.Now;
        var packets = new List<ProtocolPacket>();
        var framesSeen = 0;
        ICaptureDevice? device = null;
        var opened = false;
        var capturing = false;
        var limitReached = false;
        void OnPacketArrival(object sender, PacketCapture e)
        {
            var packet = e.GetPacket();
            var parsed = _parser.TryParse(packet.Data);
            if (parsed is null) return;
            Interlocked.Increment(ref framesSeen);
            lock (packets)
            {
                if (packets.Count < 10000) packets.Add(parsed);
                else limitReached = true;
            }
        }

        try
        {
            device = _deviceResolver(adapterId);
            if (device is null)
            {
                return new ScanResult(scanId, adapterId, started, DateTimeOffset.Now, 0, [],
                    "Npcap capture device was not found for this adapter.");
            }

            device.OnPacketArrival += OnPacketArrival;

            device.Open(DeviceModes.Promiscuous, 1000);
            opened = true;
            device.Filter = PassiveDiscoveryFilter;
            device.StartCapture();
            capturing = true;
            try
            {
                await Task.Delay(duration, cancellationToken);
            }
            finally
            {
                try { device.StopCapture(); }
                finally { capturing = false; }
            }

            var completed = DateTimeOffset.Now;
            lock (packets)
            {
                return new ScanResult(scanId, adapterId, started, completed, framesSeen,
                    ObservationAggregator.Aggregate(adapterId, packets, started, completed),
                    limitReached ? "The 10,000-advertisement limit was reached. Results include only the retained advertisements; use a shorter capture window." : null);
            }
        }
        catch (Exception ex) when (ex is DllNotFoundException or BadImageFormatException || ex.InnerException is DllNotFoundException)
        {
            return new ScanResult(scanId, adapterId, started, DateTimeOffset.Now, framesSeen, [],
                "Npcap runtime is not available. Install Npcap separately, then restart JackPeek. The app does not bundle or silently install it.");
        }
        catch (OperationCanceledException)
        {
            return new ScanResult(scanId, adapterId, started, DateTimeOffset.Now, framesSeen, [], "Capture stopped because JackPeek is shutting down.");
        }
        catch (Exception)
        {
            return new ScanResult(scanId, adapterId, started, DateTimeOffset.Now, framesSeen, [],
                "Capture could not open or read this adapter. Refresh adapters and check Npcap access permissions.");
        }
        finally
        {
            if (device is not null)
            {
                device.OnPacketArrival -= OnPacketArrival;
                try { if (capturing) device.StopCapture(); }
                finally { if (opened) device.Close(); }
            }
        }
    }

    private static ICaptureDevice? FindDevice(string adapterId)
    {
        return CaptureDeviceList.Instance.FirstOrDefault(d =>
            !string.IsNullOrWhiteSpace(adapterId) && d.Name.Contains(adapterId, StringComparison.OrdinalIgnoreCase));
    }
}
