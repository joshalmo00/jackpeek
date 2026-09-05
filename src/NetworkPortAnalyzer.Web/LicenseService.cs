using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using NetworkPortAnalyzer.Core;

namespace NetworkPortAnalyzer.Web;

public sealed class LicenseService
{
    private const string ProductName = "JackPeek";
    private const string PublicKeyPem = """
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkpp/6Qgy0mKda+xIzzrR
9AhmRIJQE0m/h0lEMy8RZYt9TCjkCgl8LdkSRzU/WY+QOdFTrSmkSeMBgA5JgFpT
sr53vxey/navEmRs02Wlef5qNScv6U1/nfLASmaISmdDRgJkz6jX5JMgSZV7UExD
rFec9SsMUD1EM/rKiWEdsfAY2fOQOPdRd9IOAxTKX/HCkDlaBbpWxemUb2B3D13e
QB64PmoyBjqJVJyvw/i0oHGzRoDCatrpL0V2NImvrvB3MUhTmnlTKKq41hlWHwXF
13WoQo3TNiqu0nP8FPFdkNQJdqCuu718kOhgepyoz5Eu2Gryjc2k962vhfXxkgod
lQIDAQAB
-----END PUBLIC KEY-----
""";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly string _licensePath;

    public LicenseService()
    {
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), ProductName);
        Directory.CreateDirectory(root);
        _licensePath = Path.Combine(root, "license.lic");
    }

    public LicenseStatus GetStatus()
    {
        if (!File.Exists(_licensePath))
        {
            return new(false, "Not installed", null, null, null, null, [], "Import an offline license file to enable licensed features.");
        }

        try
        {
            var license = JsonSerializer.Deserialize<LicenseDocument>(File.ReadAllText(_licensePath), JsonOptions);
            return license is null ? Invalid("License file is empty.") : Validate(license);
        }
        catch (Exception ex)
        {
            return Invalid($"License file could not be read: {ex.Message}");
        }
    }

    public LicenseStatus Import(string content)
    {
        var license = JsonSerializer.Deserialize<LicenseDocument>(content, JsonOptions)
            ?? throw new InvalidOperationException("License file is empty.");
        var status = Validate(license);
        if (!status.IsValid)
        {
            throw new InvalidOperationException(status.Detail ?? "License is invalid.");
        }

        var temporaryPath = _licensePath + ".tmp";
        File.WriteAllText(temporaryPath, JsonSerializer.Serialize(license, JsonOptions), Encoding.UTF8);
        File.Move(temporaryPath, _licensePath, true);
        return status;
    }

    public static LicenseStatus ValidateContent(string content)
    {
        try
        {
            var license = JsonSerializer.Deserialize<LicenseDocument>(content, JsonOptions);
            return license is null ? Invalid("License file is empty.") : Validate(license);
        }
        catch (Exception ex)
        {
            return Invalid($"License file could not be read: {ex.Message}");
        }
    }

    private static LicenseStatus Validate(LicenseDocument license)
    {
        if (!string.Equals(license.Product, ProductName, StringComparison.OrdinalIgnoreCase))
        {
            return Invalid("License product does not match JackPeek.");
        }

        if (license.ValidUntil < DateTimeOffset.UtcNow)
        {
            return new(false, "Expired", license.LicenseId, license.Edition, license.Organization, license.ValidUntil, license.Features, "License has expired.");
        }

        if (license.ValidFrom > DateTimeOffset.UtcNow)
        {
            return new(false, "Not active", license.LicenseId, license.Edition, license.Organization, license.ValidUntil, license.Features, "License activation date is in the future.");
        }

        if (!string.IsNullOrWhiteSpace(license.MachineId) &&
            !string.Equals(license.MachineId, Environment.MachineName, StringComparison.OrdinalIgnoreCase))
        {
            return new(false, "Machine mismatch", license.LicenseId, license.Edition, license.Organization, license.ValidUntil, license.Features, "License is assigned to a different workstation.");
        }

        try
        {
            using var rsa = RSA.Create();
            rsa.ImportFromPem(PublicKeyPem);
            var unsigned = license with { Signature = string.Empty };
            var payload = JsonSerializer.SerializeToUtf8Bytes(unsigned, JsonOptions);
            var signature = Convert.FromBase64String(license.Signature);
            var valid = rsa.VerifyData(payload, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            return valid
                ? new(true, "Active", license.LicenseId, license.Edition, license.Organization, license.ValidUntil, license.Features, null)
                : Invalid("License signature is invalid.");
        }
        catch (Exception ex)
        {
            return Invalid($"License signature could not be verified: {ex.Message}");
        }
    }

    private static LicenseStatus Invalid(string detail) => new(false, "Invalid", null, null, null, null, [], detail);
}
