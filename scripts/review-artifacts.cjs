#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const check = process.argv.includes("--check");

const generated = new Set([
  "docs/REVIEW_MANIFEST.json",
  "docs/sbom.cdx.json",
]);

const excludedDirs = new Set([
  ".git",
  ".ui-test",
  "bin",
  "obj",
  "output",
  "sources",
  "node_modules",
]);

const includedExtensions = new Set([
  ".cs",
  ".csproj",
  ".sln",
  ".props",
  ".json",
  ".md",
  ".html",
  ".css",
  ".js",
  ".cjs",
  ".ps1",
  ".wxs",
  ".wixproj",
  ".config",
  ".toml",
  ".yml",
  ".yaml",
  ".ico",
  ".png",
]);

const licenseByPackage = {
  "PacketDotNet": "MPL-2.0",
  "SharpPcap": "MIT",
  "System.Memory": "MIT",
  "System.Runtime.CompilerServices.Unsafe": "MIT",
  "System.Security.Cryptography.ProtectedData": "MIT",
  "System.Text.Encoding.CodePages": "MIT",
};

function relative(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = relative(full);
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) {
        walk(full, files);
      }
      continue;
    }
    if (generated.has(rel)) continue;
    if (includedExtensions.has(path.extname(entry.name).toLowerCase()) || entry.name === "NuGet.Config") {
      files.push(rel);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function gitValue(args, fallback) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function generateManifest() {
  const files = walk(root);
  const entries = files.map((file) => {
    const buffer = fs.readFileSync(path.join(root, file));
    return {
      path: file,
      bytes: buffer.length,
      sha256: sha256Buffer(buffer),
    };
  });

  const digest = sha256Buffer(Buffer.from(entries.map((entry) => `${entry.path}:${entry.sha256}`).join("\n"), "utf8"));
  return {
    schema: "jackpeek-review-manifest/v1",
    repository: "joshalmo00/jackpeek",
    gitHead: gitValue(["rev-parse", "HEAD"], "unknown"),
    gitBranch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
    sourceFileCount: entries.length,
    sourceFingerprintSha256: digest,
    notes: [
      "This manifest covers repository source, documentation, tests, scripts, and configuration files.",
      "Generated review artifacts, build outputs, local test outputs, synced ChatGPT sources, and package caches are excluded.",
      "A matching manifest proves the review package is synchronized with this checkout; it does not prove a release binary was signed.",
    ],
    files: entries,
  };
}

function collectPackages() {
  const packages = new Map();
  for (const lock of walk(root).filter((file) => file.endsWith("packages.lock.json"))) {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, lock), "utf8"));
    for (const framework of Object.values(parsed.dependencies ?? {})) {
      for (const [name, info] of Object.entries(framework)) {
        if (info.type === "Project") continue;
        const key = `${name}@${info.resolved}`;
        const component = packages.get(key) ?? {
          type: "library",
          "bom-ref": `pkg:nuget/${encodeURIComponent(name)}@${encodeURIComponent(info.resolved)}`,
          name,
          version: info.resolved,
          purl: `pkg:nuget/${encodeURIComponent(name)}@${encodeURIComponent(info.resolved)}`,
          scope: info.type === "Direct" ? "required" : "optional",
          licenses: [{ license: { id: licenseByPackage[name] ?? "NOASSERTION" } }],
          hashes: info.contentHash
            ? [{ alg: "SHA-512", content: Buffer.from(info.contentHash, "base64").toString("hex") }]
            : [],
          properties: [],
        };
        component.properties.push({ name: "jackpeek:lockFile", value: lock });
        packages.set(key, component);
      }
    }
  }
  return [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function generateSbom() {
  const components = collectPackages();
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${crypto.createHash("sha256").update(root).digest("hex").slice(0, 32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*/, "$1-$2-$3-$4-$5")}`,
    version: 1,
    metadata: {
      component: {
        type: "application",
        "bom-ref": "jackpeek",
        name: "JackPeek",
        version: "1.0.0",
        description: "Local Windows passive LLDP/CDP discovery and evidence utility.",
      },
      tools: [{ vendor: "JackPeek", name: "scripts/review-artifacts.cjs" }],
      properties: [
        { name: "jackpeek:gitHead", value: gitValue(["rev-parse", "HEAD"], "unknown") },
        { name: "jackpeek:sourceFingerprintSha256", value: generateManifest().sourceFingerprintSha256 },
      ],
    },
    components,
    dependencies: [
      {
        ref: "jackpeek",
        dependsOn: components.map((component) => component["bom-ref"]),
      },
    ],
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeOrCheck(file, value) {
  const absolute = path.join(root, file);
  const next = stableJson(value);
  const current = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
  if (check) {
    if (current !== next) {
      console.error(`${file} is not up to date. Run node scripts/review-artifacts.cjs.`);
      process.exitCode = 1;
    }
    return;
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, next, "utf8");
}

writeOrCheck("docs/REVIEW_MANIFEST.json", generateManifest());
writeOrCheck("docs/sbom.cdx.json", generateSbom());

if (!process.exitCode) {
  console.log(check ? "Review artifacts are up to date." : "Review artifacts updated.");
}
