using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace NetworkPortAnalyzer.Web;

public sealed class AdminService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly ConcurrentDictionary<string, DateTimeOffset> _sessions = new();
    private readonly string _adminPath;
    private readonly object _passwordGate = new();

    public AdminService() : this(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JackPeek")) { }

    public AdminService(string root)
    {
        Directory.CreateDirectory(root);
        _adminPath = Path.Combine(root, "admin.json");
    }

    public AdminStatus GetStatus() => new(IsConfigured(), false);

    public AdminUnlockResult Unlock(string password)
    {
        if (password is null || password.Length > 1024)
            return new AdminUnlockResult(false, null, "Invalid admin password.");
        if (string.IsNullOrWhiteSpace(password) || !ValidatePassword(password))
        {
            return new AdminUnlockResult(false, null, "Invalid admin password.");
        }

        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        _sessions[token] = DateTimeOffset.Now.AddMinutes(30);
        return new AdminUnlockResult(true, token, "Admin panel unlocked.");
    }

    public bool ValidateToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return false;
        }

        if (!_sessions.TryGetValue(token, out var expiresAt))
        {
            return false;
        }

        if (expiresAt <= DateTimeOffset.Now)
        {
            _sessions.TryRemove(token, out _);
            return false;
        }

        _sessions[token] = DateTimeOffset.Now.AddMinutes(30);
        return true;
    }

    public void SetPassword(string currentPassword, string newPassword)
    {
        lock (_passwordGate)
        {
        if (string.IsNullOrWhiteSpace(newPassword) || newPassword.Length < 10 || newPassword.Length > 1024 || currentPassword?.Length > 1024)
        {
            throw new InvalidOperationException("Admin password must be at least 10 characters.");
        }

        if (IsConfigured() && !ValidatePassword(currentPassword ?? string.Empty))
        {
            throw new InvalidOperationException("Current admin password is invalid.");
        }

        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = HashPassword(newPassword, salt);
        var state = new AdminPasswordState(Convert.ToBase64String(salt), Convert.ToBase64String(hash));
        var temporary = _adminPath + "." + Guid.NewGuid().ToString("n") + ".tmp";
        try
        {
            File.WriteAllText(temporary, JsonSerializer.Serialize(state, JsonOptions));
            File.Move(temporary, _adminPath, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
        _sessions.Clear();
        }
    }

    public void Lock(string? token) { if (token is not null) _sessions.TryRemove(token, out _); }

    private bool IsConfigured() => File.Exists(_adminPath);

    private bool ValidatePassword(string password)
    {
        if (password is null || password.Length > 1024) return false;
        if (!File.Exists(_adminPath))
        {
            return false;
        }

        var state = JsonSerializer.Deserialize<AdminPasswordState>(File.ReadAllText(_adminPath), JsonOptions);
        if (state is null)
        {
            return false;
        }

        var salt = Convert.FromBase64String(state.Salt);
        var expected = Convert.FromBase64String(state.Hash);
        var actual = HashPassword(password, salt);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    private static byte[] HashPassword(string password, byte[] salt) =>
        Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(password), salt, 210_000, HashAlgorithmName.SHA256, 32);
}

public sealed record AdminStatus(bool IsConfigured, bool IsUnlocked);

public sealed record AdminUnlockRequest(string Password);

public sealed record AdminUnlockResult(bool Unlocked, string? Token, string Message);

public sealed record AdminPasswordRequest(string CurrentPassword, string NewPassword);

file sealed record AdminPasswordState(string Salt, string Hash);
