using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Web;

public sealed class AccessPolicyService
{
    private readonly string _path;
    private readonly object _gate = new();
    private readonly ConcurrentDictionary<string, AccessSession> _sessions = new();
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    public static readonly IReadOnlyList<string> AccessContacts = ["joshua.alvarez@rwjbh.org", "darien.valerin@rwjbh.org"];

    public AccessPolicyService() : this(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JackPeek")) { }
    public AccessPolicyService(string root) { _path = Path.Combine(root, "accounts.json"); }
    public IReadOnlyList<ApprovedAccount> List() { lock (_gate) return Read().OrderBy(a => a.Account).ToArray(); }

    public AccessStatus Evaluate(WorkstationIdentity identity)
    {
        var account = AccountName(identity);
        var profile = List().FirstOrDefault(a => a.Enabled && string.Equals(a.Account, account, StringComparison.OrdinalIgnoreCase));
        return new(profile is not null, account, profile is not null && string.IsNullOrWhiteSpace(profile.FirstName),
            profile?.DisplayName, profile is not null ? "This Windows account is approved." : "This Windows account is not approved.");
    }
    public ApprovedAccount SetApproval(string account, bool enabled)
    {
        account = (account ?? "").Trim();
        var parts = account.Split('\\');
        if (parts.Length != 2 || parts.Any(p => string.IsNullOrWhiteSpace(p) || p != p.Trim() || p.Any(c => char.IsControl(c) || "@/\"<>|:;*?[]=,+".Contains(c))) || parts[0].Any(char.IsWhiteSpace) || account.Length > 180)
            throw new InvalidOperationException("Enter a Windows account as DOMAIN\\username, not an email address.");
        lock (_gate)
        {
            var accounts = Read();
            var existing = accounts.FindIndex(a => string.Equals(a.Account, account, StringComparison.OrdinalIgnoreCase));
            var result = existing >= 0 ? accounts[existing] with { Enabled = enabled } : new ApprovedAccount(account, enabled, null, null);
            if (existing >= 0) accounts[existing] = result; else accounts.Add(result);
            Write(accounts);
            return result;
        }
    }
    public void RegisterName(WorkstationIdentity identity, string firstName, string lastName)
    {
        firstName = ValidateName(firstName);
        lastName = ValidateName(lastName);
        lock (_gate)
        {
            var accounts = Read();
            var index = accounts.FindIndex(a => a.Enabled && string.Equals(a.Account, AccountName(identity), StringComparison.OrdinalIgnoreCase));
            if (index < 0) throw new InvalidOperationException("This Windows account is not approved.");
            if (!string.IsNullOrWhiteSpace(accounts[index].FirstName)) return;
            accounts[index] = accounts[index] with { FirstName = firstName, LastName = lastName };
            Write(accounts);
        }
    }
    public string? SignIn(WorkstationIdentity identity)
    {
        var status = Evaluate(identity);
        if (!status.IsApproved || status.RequiresProfile) return null;
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        _sessions[token] = new(status.Account!, DateTimeOffset.UtcNow.AddHours(8));
        return token;
    }
    public bool ValidateSession(string? token, WorkstationIdentity identity)
    {
        if (token is null || !_sessions.TryGetValue(token, out var session)) return false;
        var status = Evaluate(identity);
        if (session.ExpiresAt <= DateTimeOffset.UtcNow || !status.IsApproved || status.RequiresProfile ||
            !string.Equals(session.Account, status.Account, StringComparison.OrdinalIgnoreCase))
        { _sessions.TryRemove(token, out _); return false; }
        return true;
    }
    public void SignOut(string? token) { if (token is not null) _sessions.TryRemove(token, out _); }
    public WorkstationIdentity Enrich(WorkstationIdentity identity) => identity with { DisplayName = Evaluate(identity).DisplayName };
    public static string? AccountName(WorkstationIdentity identity) =>
        string.IsNullOrWhiteSpace(identity.UserName) || string.IsNullOrWhiteSpace(identity.DomainName) ? null : $"{identity.DomainName}\\{identity.UserName}";
    private List<ApprovedAccount> Read() => File.Exists(_path)
        ? JsonSerializer.Deserialize<List<ApprovedAccount>>(File.ReadAllText(_path), JsonOptions) ?? throw new InvalidOperationException("Account settings could not be read.")
        : [new("SBHCS\\joalvarez", true, null, null)];
    private void Write(List<ApprovedAccount> accounts)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        var temporary = _path + "." + Guid.NewGuid().ToString("n") + ".tmp";
        try { File.WriteAllText(temporary, JsonSerializer.Serialize(accounts, JsonOptions)); File.Move(temporary, _path, true); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    private static string ValidateName(string value)
    {
        value = (value ?? "").Trim();
        if (value.Length is < 1 or > 80 || value.Any(char.IsControl)) throw new InvalidOperationException("Enter a first and last name, each up to 80 characters.");
        return value;
    }
    private sealed record AccessSession(string Account, DateTimeOffset ExpiresAt);
}

public sealed record ApprovedAccount(string Account, bool Enabled, string? FirstName, string? LastName)
{
    public string? DisplayName => string.IsNullOrWhiteSpace(FirstName) ? null : $"{FirstName} {LastName}";
}
public sealed record AccessStatus(bool IsApproved, string? Account, bool RequiresProfile, string? DisplayName, string Message);
public sealed record AccountApprovalRequest(string Account, bool Enabled);
public sealed record ProfileRequest(string FirstName, string LastName);
