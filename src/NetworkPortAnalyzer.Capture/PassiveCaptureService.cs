using NetworkPortAnalyzer.Core;
using NetworkPortAnalyzer.Protocols;
using SharpPcap;

namespace NetworkPortAnalyzer.Capture;

public sealed class PassiveCaptureService
{
    private const string PassiveDiscoveryFilter = "ether proto 0x88cc or ether dst 01:00:0c:cc:cc:cc";
    private readonly DiscoveryPacketParser _parser = new();

    public IReadOnlyList<AdapterInfo> GetCaptureDevices(IReadOnlyList<AdapterInfo> windowsAdapters)
    {
        try
        {
            var devices = CaptureDeviceList.Instance;
            return windowsAdapters
                .Select(adapter => adapter with
                {
                    CaptureAvailable = devices.Any(d => d.Name.Contains(adapter.Id, StringComparison.OrdinalIgnoreCase) ||
                                                        d.Description.Contains(adapter.Name, StringComparison.OrdinalIgnoreCase))
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

        try
        {
            var device = FindDevice(adapterId);
            if (device is null)
            {
                return new ScanResult(scanId, adapterId, started, DateTimeOffset.Now, 0, [],
                    "Npcap capture device was not found for this adapter.");
            }

            device.OnPacketArrival += (_, e) =>
            {
                framesSeen++;
                var packet = e.GetPacket();
                var parsed = _parser.TryParse(packet.Data);
                if (parsed is not null)
                {
                    lock (packets)
                    {
                        packets.Add(parsed);
                    }
                }
            };

            device.Open(DeviceModes.Promiscuous, 1000);
            device.Filter = PassiveDiscoveryFilter;
            device.StartCapture();
            try
            {
                await Task.Delay(duration, cancellationToken);
            }
            finally
            {
                device.StopCapture();
                device.Close();
            }

            var completed = DateTimeOffset.Now;
            return new ScanResult(scanId, adapterId, started, completed, framesSeen,
                ObservationAggregator.Aggregate(adapterId, packets, started, completed), null);
        }
        catch (Exception ex) when (ex is DllNotFoundException || ex is BadImageFormatException || ex.GetType().Name.Contains("Pcap", StringComparison.OrdinalIgnoreCase))
        {
            return new ScanResult(scanId, adapterId, started, DateTimeOffset.Now, framesSeen, [],
                "Npcap/WinPcap runtime is not available. Install Npcap separately; this app does not bundle or silently install it.");
        }
    }

    private static ICaptureDevice? FindDevice(string adapterId)
    {
        return CaptureDeviceList.Instance.FirstOrDefault(d =>
            d.Name.Contains(adapterId, StringComparison.OrdinalIgnoreCase) ||
            d.Description.Contains(adapterId, StringComparison.OrdinalIgnoreCase));
    }
}
