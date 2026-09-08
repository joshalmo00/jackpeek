using System.Text.RegularExpressions;
using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Web;

public sealed class AccessPolicyService
{
    public static readonly IReadOnlyList<string> ApprovedUsers =
    [
        "joshua.alvarez@rwjbh.org",
        "darien.valerin@rwjbh.org"
    ];

    public static readonly IReadOnlyList<string> AccessContacts = ApprovedUsers;

    public AccessStatus Evaluate(WorkstationIdentity workstation)
    {
        var account = NormalizeAccount(workstation);
        var approved = !string.IsNullOrWhiteSpace(account) &&
            ApprovedUsers.Contains(account, StringComparer.OrdinalIgnoreCase);

        return new AccessStatus(
            approved,
            account,
            workstation.UserName,
            workstation.DomainName,
            ApprovedUsers,
            AccessContacts,
            approved
                ? "This Windows account is approved for JackPeek."
                : "This Windows account is not approved.");
    }

    private static string? NormalizeAccount(WorkstationIdentity workstation)
    {
        var user = workstation.UserName;
        if (string.IsNullOrWhiteSpace(user))
        {
            return null;
        }

        user = user.Trim();
        if (user.Contains('@'))
        {
            return user.ToLowerInvariant();
        }

        var normalized = Regex.Replace(user, @"[^A-Za-z0-9]+", ".").Trim('.');
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        return $"{normalized.ToLowerInvariant()}@rwjbh.org";
    }
}

public sealed record AccessStatus(
    bool IsApproved,
    string? Account,
    string? WindowsUser,
    string? DomainName,
    IReadOnlyList<string> ApprovedUsers,
    IReadOnlyList<string> AccessContacts,
    string Message);
