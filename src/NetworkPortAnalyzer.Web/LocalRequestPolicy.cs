namespace NetworkPortAnalyzer.Web;

public static class LocalRequestPolicy
{
    public static bool IsAllowedHost(string host) => string.Equals(host, "127.0.0.1", StringComparison.Ordinal);

    public static bool IsAllowedOrigin(string? origin, int port) =>
        string.IsNullOrEmpty(origin) ||
        (Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
         uri.Scheme == "http" && uri.Host == "127.0.0.1" && uri.Port == port &&
         uri.UserInfo.Length == 0 && uri.AbsolutePath == "/" && uri.Query.Length == 0 && uri.Fragment.Length == 0);
}
