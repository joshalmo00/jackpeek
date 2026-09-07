const adapterSelect = document.querySelector("#adapterSelect");
const durationInput = document.querySelector("#durationInput");
const scanBtn = document.querySelector("#scanBtn");
const refreshBtn = document.querySelector("#refreshBtn");
const statusEl = document.querySelector("#status");
const resultsEl = document.querySelector("#results");
const adapterName = document.querySelector("#adapterName");
const adapterDescription = document.querySelector("#adapterDescription");
const adapterLink = document.querySelector("#adapterLink");
const adapterMac = document.querySelector("#adapterMac");
const adapterIps = document.querySelector("#adapterIps");
const captureState = document.querySelector("#captureState");
const progressBar = document.querySelector("#progressBar");
const storageModeInput = document.querySelector("#storageModeInput");
const secureModeInput = document.querySelector("#secureModeInput");
const includeUserInput = document.querySelector("#includeUserInput");
const localHistoryInput = document.querySelector("#localHistoryInput");
const archiveMirrorInput = document.querySelector("#archiveMirrorInput");
const localCacheInput = document.querySelector("#localCacheInput");
const cacheExpirationHoursInput = document.querySelector("#cacheExpirationHoursInput");
const nasSyncIntervalInput = document.querySelector("#nasSyncIntervalInput");
const cacheWarningHoursInput = document.querySelector("#cacheWarningHoursInput");
const maxCaptureDurationInput = document.querySelector("#maxCaptureDurationInput");
const allowSettingsEditInput = document.querySelector("#allowSettingsEditInput");
const requireValidLicenseInput = document.querySelector("#requireValidLicenseInput");
const requireEvidenceEncryptionInput = document.querySelector("#requireEvidenceEncryptionInput");
const evidenceRetentionDaysInput = document.querySelector("#evidenceRetentionDaysInput");
const allowEvidenceDeletionInput = document.querySelector("#allowEvidenceDeletionInput");
const allowNasMirrorInput = document.querySelector("#allowNasMirrorInput");
const adminManagedCacheEncryptionInput = document.querySelector("#adminManagedCacheEncryptionInput");
const saveSettingsBtn = document.querySelector("#saveSettingsBtn");
const settingsStatus = document.querySelector("#settingsStatus");
const refreshReportsBtn = document.querySelector("#refreshReportsBtn");
const syncCacheBtn = document.querySelector("#syncCacheBtn");
const reportsEl = document.querySelector("#reports");
const cacheWarnings = document.querySelector("#cacheWarnings");
const sessionUser = document.querySelector("#sessionUser");
const sessionMachine = document.querySelector("#sessionMachine");
const lastEvidence = document.querySelector("#lastEvidence");
const tabButtons = document.querySelectorAll("[data-tab-target]");
const tabPanels = document.querySelectorAll(".tab-panel");
const licenseFileInput = document.querySelector("#licenseFileInput");
const licenseStatus = document.querySelector("#licenseStatus");
const licenseDetail = document.querySelector("#licenseDetail");
const licenseImportStatus = document.querySelector("#licenseImportStatus");
const brandLogo = document.querySelector("#brandLogo");
const adminModal = document.querySelector("#adminModal");
const closeAdminBtn = document.querySelector("#closeAdminBtn");
const unlockAdminBtn = document.querySelector("#unlockAdminBtn");
const adminPasswordInput = document.querySelector("#adminPasswordInput");
const adminStatus = document.querySelector("#adminStatus");
const adminPanel = document.querySelector("#adminPanel");
const currentAdminPasswordInput = document.querySelector("#currentAdminPasswordInput");
const newAdminPasswordInput = document.querySelector("#newAdminPasswordInput");
const saveAdminPasswordBtn = document.querySelector("#saveAdminPasswordBtn");

let adapters = [];
let countdownTimer = null;
let adminClicks = [];
let adminToken = null;

refreshBtn.addEventListener("click", loadAdapters);
scanBtn.addEventListener("click", startScan);
adapterSelect.addEventListener("change", updateSelectedAdapter);
saveSettingsBtn.addEventListener("click", saveSettings);
refreshReportsBtn.addEventListener("click", loadReports);
syncCacheBtn.addEventListener("click", syncCache);
licenseFileInput.addEventListener("change", importLicense);
tabButtons.forEach(button => button.addEventListener("click", () => showTab(button.dataset.tabTarget)));
brandLogo.addEventListener("click", handleAdminGesture);
closeAdminBtn.addEventListener("click", closeAdminModal);
unlockAdminBtn.addEventListener("click", unlockAdmin);
saveAdminPasswordBtn.addEventListener("click", saveAdminPassword);

async function loadAdapters() {
  statusEl.textContent = "Loading Ethernet adapters...";
  adapterSelect.innerHTML = "";
  adapters = [];
  const response = await fetch("/api/adapters");
  adapters = await response.json();
  for (const adapter of adapters) {
    const option = document.createElement("option");
    option.value = adapter.id;
    option.textContent = `${adapter.name} - ${adapter.description}`;
    adapterSelect.append(option);
  }
  scanBtn.disabled = adapters.length === 0;
  updateSelectedAdapter();
  resultsEl.innerHTML = adapters.length
    ? `<div class="empty">Ready for a passive LLDP/CDP capture on wired Ethernet.</div>`
    : `<div class="empty strong">No wired Ethernet adapter detected. Connect a physical Ethernet adapter and refresh.</div>`;
  statusEl.textContent = adapters.length ? `${adapters.length} wired Ethernet adapter${adapters.length === 1 ? "" : "s"} available.` : "No wired Ethernet adapter detected.";
}

async function loadSession() {
  const response = await fetch("/api/session");
  const session = await response.json();
  const workstation = session.workstation || {};
  sessionUser.textContent = workstation.userName || "User not recorded";
  sessionMachine.textContent = `${workstation.machineName || "Unknown PC"}${workstation.domainName ? ` - ${workstation.domainName}` : ""}`;
  renderCacheWarnings(session.pendingCache || []);
}

function updateSelectedAdapter() {
  const adapter = adapters.find(a => a.id === adapterSelect.value);
  adapterName.textContent = adapter?.name || "No wired Ethernet adapter";
  adapterDescription.textContent = adapter?.description || "Connect a physical Ethernet adapter and refresh";
  adapterLink.textContent = adapter?.operationalStatus || "Unavailable";
  adapterMac.textContent = adapter?.macAddress || "Not advertised";
  adapterIps.textContent = adapter?.ipAddresses?.length ? adapter.ipAddresses.join(", ") : "Not assigned";
  captureState.textContent = adapter ? (adapter.captureAvailable ? "Npcap ready" : "Npcap needed") : "Unavailable";
}

async function startScan() {
  const adapterId = adapterSelect.value;
  if (!adapterId) return;
  scanBtn.disabled = true;
  resultsEl.innerHTML = "";
  lastEvidence.textContent = "Capture running";
  const seconds = Number(durationInput.value || 30);
  startCountdown(seconds);

  const create = await fetch("/api/scans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ adapterId, durationSeconds: seconds })
  });
  if (!create.ok) {
    scanBtn.disabled = false;
    clearInterval(countdownTimer);
    const error = await readError(create, "Capture could not be started.");
    statusEl.textContent = error;
    return;
  }
  const { scanId } = await create.json();
  await pollScan(scanId);
}

async function pollScan(scanId) {
  const response = await fetch(`/api/scans/${scanId}`);
  const scan = await response.json();
  if (scan.state !== "complete") {
    setTimeout(() => pollScan(scanId), 1000);
    return;
  }

  scanBtn.disabled = false;
  clearInterval(countdownTimer);
  progressBar.style.width = "100%";
  if (scan.error) {
    statusEl.textContent = scan.error;
  } else {
    statusEl.textContent = `Captured ${scan.result.framesCaptured} discovery frames.`;
  }
  if (scan.evidence) {
    lastEvidence.innerHTML = reportLinks(scan.evidence);
    statusEl.innerHTML = `${escapeHtml(statusEl.textContent)} Evidence saved.`;
  } else {
    lastEvidence.textContent = "Not saved";
  }
  renderResults(scan.result);
  await loadReports();
  showTab("resultsTab");
}

function renderResults(result) {
  if (!result || !result.observations.length) {
    resultsEl.innerHTML = `<div class="empty strong">No LLDP or CDP advertisements were observed during this capture window.</div>`;
    return;
  }

  resultsEl.innerHTML = result.observations.map(o => {
    const p = o.latest;
    return `<article class="observation">
      <header class="neighbor-head">
        <div>
          <h2>${escapeHtml(p.deviceName || p.chassisId || "Advertised neighbor")}</h2>
          <p>${escapeHtml(p.portId || "Port not advertised")}</p>
        </div>
        <span class="protocol">${escapeHtml(o.protocol)}</span>
      </header>
      <div class="neighbor-grid">
        ${field("Chassis", p.chassisId, "wide")}
        ${field("Switch port", p.portDescription || p.portId, "wide")}
        ${field("Management IP", p.managementAddress)}
        ${field("Native VLAN", p.nativeVlan, "badge")}
        ${field("Voice VLAN", p.voiceVlan, "badge")}
        ${field("Duplex", p.duplex)}
        ${field("Capabilities", (p.capabilities || []).join(", "), "wide")}
        ${field("Frames", o.framesSeen)}
      </div>
      ${o.conflicts.length ? `<div class="conflict">${escapeHtml(o.conflicts.join("; "))}</div>` : ""}
      <details>
        <summary>Verbose TLVs</summary>
        <pre>${escapeHtml(JSON.stringify({ details: p.details, unknownTlvs: p.unknownTlvs }, null, 2))}</pre>
      </details>
    </article>`;
  }).join("");
}

async function loadSettings() {
  const response = await fetch("/api/evidence/settings");
  const settings = await response.json();
  storageModeInput.value = settings.storageMode || "local-nas-mirror";
  secureModeInput.checked = Boolean(settings.secureMode);
  includeUserInput.checked = Boolean(settings.includeWindowsUser);
  localHistoryInput.value = settings.localHistoryPath || "";
  archiveMirrorInput.value = settings.archiveMirrorPath || "";
  localCacheInput.value = settings.localCachePath || "";
  cacheExpirationHoursInput.value = settings.cacheExpirationHours || 24;
  nasSyncIntervalInput.value = settings.nasSyncIntervalMinutes || 60;
  cacheWarningHoursInput.value = (settings.cacheWarningHours || [3, 2]).join(",");
  maxCaptureDurationInput.value = settings.maxCaptureDurationSeconds || 120;
  durationInput.max = settings.maxCaptureDurationSeconds || 120;
  if (Number(durationInput.value) > Number(durationInput.max)) durationInput.value = durationInput.max;
  allowSettingsEditInput.checked = Boolean(settings.allowSettingsEdit);
  requireValidLicenseInput.checked = Boolean(settings.requireValidLicense);
  requireEvidenceEncryptionInput.checked = Boolean(settings.requireEvidenceEncryption);
  evidenceRetentionDaysInput.value = settings.evidenceRetentionDays || 0;
  allowEvidenceDeletionInput.checked = Boolean(settings.allowEvidenceDeletion);
  allowNasMirrorInput.checked = settings.allowNasMirror !== false;
  adminManagedCacheEncryptionInput.checked = settings.adminManagedCacheEncryption !== false;
  [storageModeInput, secureModeInput, includeUserInput, localHistoryInput, archiveMirrorInput, localCacheInput, cacheExpirationHoursInput, nasSyncIntervalInput, cacheWarningHoursInput, maxCaptureDurationInput, allowSettingsEditInput, requireValidLicenseInput, requireEvidenceEncryptionInput, evidenceRetentionDaysInput, allowEvidenceDeletionInput, allowNasMirrorInput, adminManagedCacheEncryptionInput, saveSettingsBtn]
    .forEach(control => control.disabled = !settings.allowSettingsEdit);
  settingsStatus.textContent = storageModeLabel(settings.storageMode);
}

async function saveSettings() {
  saveSettingsBtn.disabled = true;
  settingsStatus.textContent = "Saving evidence settings...";
  try {
    const response = await fetch("/api/evidence/settings", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jackpeek-admin": adminToken || "" },
      body: JSON.stringify({
        storageMode: storageModeInput.value,
        secureMode: secureModeInput.checked,
        includeWindowsUser: includeUserInput.checked,
        localHistoryPath: localHistoryInput.value,
        archiveMirrorPath: archiveMirrorInput.value,
        localCachePath: localCacheInput.value,
        cacheExpirationHours: Number(cacheExpirationHoursInput.value || 24),
        nasSyncIntervalMinutes: Number(nasSyncIntervalInput.value || 60),
        cacheWarningHours: parseWarningHours(cacheWarningHoursInput.value),
        maxCaptureDurationSeconds: Number(maxCaptureDurationInput.value || 120),
        allowSettingsEdit: allowSettingsEditInput.checked,
        requireValidLicense: requireValidLicenseInput.checked,
        requireEvidenceEncryption: requireEvidenceEncryptionInput.checked,
        evidenceRetentionDays: Number(evidenceRetentionDaysInput.value || 0),
        allowEvidenceDeletion: allowEvidenceDeletionInput.checked,
        allowNasMirror: allowNasMirrorInput.checked,
        adminManagedCacheEncryption: adminManagedCacheEncryptionInput.checked,
        allowedExportFormats: ["json", "html", "package"]
      })
    });
    const result = response.status === 403 ? {} : await response.json();
    if (!response.ok) {
      throw new Error(response.status === 403 ? "Unlock the hidden admin panel before changing enterprise settings." : result.error || "Evidence settings could not be saved.");
    }
    storageModeInput.value = result.storageMode || "local-nas-mirror";
    localHistoryInput.value = result.localHistoryPath || "";
    archiveMirrorInput.value = result.archiveMirrorPath || "";
    localCacheInput.value = result.localCachePath || "";
    cacheExpirationHoursInput.value = result.cacheExpirationHours || 24;
    nasSyncIntervalInput.value = result.nasSyncIntervalMinutes || 60;
    cacheWarningHoursInput.value = (result.cacheWarningHours || [3, 2]).join(",");
    maxCaptureDurationInput.value = result.maxCaptureDurationSeconds || 120;
    durationInput.max = result.maxCaptureDurationSeconds || 120;
    if (Number(durationInput.value) > Number(durationInput.max)) durationInput.value = durationInput.max;
    allowSettingsEditInput.checked = Boolean(result.allowSettingsEdit);
    requireValidLicenseInput.checked = Boolean(result.requireValidLicense);
    requireEvidenceEncryptionInput.checked = Boolean(result.requireEvidenceEncryption);
    evidenceRetentionDaysInput.value = result.evidenceRetentionDays || 0;
    allowEvidenceDeletionInput.checked = Boolean(result.allowEvidenceDeletion);
    allowNasMirrorInput.checked = result.allowNasMirror !== false;
    adminManagedCacheEncryptionInput.checked = result.adminManagedCacheEncryption !== false;
    [storageModeInput, secureModeInput, includeUserInput, localHistoryInput, archiveMirrorInput, localCacheInput, cacheExpirationHoursInput, nasSyncIntervalInput, cacheWarningHoursInput, maxCaptureDurationInput, allowSettingsEditInput, requireValidLicenseInput, requireEvidenceEncryptionInput, evidenceRetentionDaysInput, allowEvidenceDeletionInput, allowNasMirrorInput, adminManagedCacheEncryptionInput, saveSettingsBtn]
      .forEach(control => control.disabled = !result.allowSettingsEdit);
    settingsStatus.textContent = "Evidence settings saved.";
    await loadSession();
  } catch (error) {
    settingsStatus.textContent = error.message;
  } finally {
    saveSettingsBtn.disabled = false;
  }
}

async function loadReports() {
  reportsEl.innerHTML = `<div class="empty">Loading evidence history...</div>`;
  const [reportsResponse, cacheResponse] = await Promise.all([fetch("/api/reports"), fetch("/api/evidence/cache")]);
  const reports = await reportsResponse.json();
  const pendingCache = await cacheResponse.json();
  renderCacheWarnings(pendingCache);
  if (!reports.length) {
    reportsEl.innerHTML = `<div class="empty">No saved evidence reports yet.</div>`;
    return;
  }

  reportsEl.innerHTML = reports.map(report => `<article class="report-row">
    <div>
      <strong>${escapeHtml(report.deviceName || "No neighbor observed")}</strong>
      <span>${escapeHtml(report.switchPort || "Port not advertised")} - ${escapeHtml(report.machineName)} - ${escapeHtml(formatDate(report.createdAt))}</span>
      <small>${escapeHtml(report.observations)} observation${report.observations === 1 ? "" : "s"} - ${escapeHtml(report.framesCaptured)} frame${report.framesCaptured === 1 ? "" : "s"} - ${escapeHtml(storageStateLabel(report))} - SHA-256 ${escapeHtml(report.sha256.slice(0, 16))}...</small>
    </div>
    <div class="report-actions">
      ${reportLinks(report)}
    </div>
  </article>`).join("");
}

async function syncCache() {
  syncCacheBtn.disabled = true;
  cacheWarnings.innerHTML = `<div class="empty">Checking pending encrypted cache...</div>`;
  try {
    const response = await fetch("/api/evidence/sync", { method: "POST" });
    const result = await response.json();
    cacheWarnings.innerHTML = `<div class="empty strong">NAS sync: ${result.uploaded} uploaded, ${result.deletedExpired} expired deleted, ${result.failed} failed.</div>`;
    await loadReports();
  } catch (error) {
    cacheWarnings.innerHTML = `<div class="empty strong">${escapeHtml(error.message)}</div>`;
  } finally {
    syncCacheBtn.disabled = false;
  }
}

function renderCacheWarnings(items) {
  if (!items.length) {
    cacheWarnings.innerHTML = "";
    return;
  }

  cacheWarnings.innerHTML = items.map(item => `<article class="cache-warning ${item.warningDue ? "urgent" : ""}">
    <strong>${item.warningDue ? "Pending cache expiration warning" : "Pending NAS sync"}</strong>
    <span>${escapeHtml(item.evidenceId)} expires ${escapeHtml(formatDate(item.expiresAt))}</span>
  </article>`).join("");
}

function showTab(targetId) {
  tabPanels.forEach(panel => panel.classList.toggle("active", panel.id === targetId));
  document.querySelectorAll(".tab").forEach(button => {
    button.classList.toggle("active", button.dataset.tabTarget === targetId);
  });
}

function reportLinks(report) {
  return `<a href="/reports/${encodeURIComponent(report.evidenceId)}.html" target="_blank" rel="noreferrer">View report</a>
    <a href="/api/reports/${encodeURIComponent(report.evidenceId)}/download">JSON</a>
    <a href="/api/reports/${encodeURIComponent(report.evidenceId)}/csv">CSV</a>
    <a href="/api/reports/${encodeURIComponent(report.evidenceId)}/package">Package</a>
    <a href="/api/reports/${encodeURIComponent(report.evidenceId)}/verify" target="_blank" rel="noreferrer">Verify</a>`;
}

function handleAdminGesture() {
  const now = Date.now();
  adminClicks = [...adminClicks.filter(click => now - click < 5000), now];
  if (adminClicks.length >= 7) {
    adminClicks = [];
    openAdminModal();
  }
}

async function openAdminModal() {
  adminModal.hidden = false;
  adminPanel.hidden = true;
  adminStatus.textContent = "Admin password is required for restricted controls.";
  try {
    const response = await fetch("/api/admin/status");
    const status = await response.json();
    if (!status.isConfigured) {
      adminPanel.hidden = false;
      adminStatus.textContent = "No admin password is configured. Create the first admin password now.";
    }
  } catch {
    adminStatus.textContent = "Admin status could not be checked.";
  }
  adminPasswordInput.focus();
}

function closeAdminModal() {
  adminModal.hidden = true;
  adminPasswordInput.value = "";
}

async function unlockAdmin() {
  adminStatus.textContent = "Checking admin password...";
  try {
    const response = await fetch("/api/admin/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: adminPasswordInput.value })
    });
    if (!response.ok) throw new Error("Admin password is invalid or not configured.");
    const result = await response.json();
    adminToken = result.token;
    adminPanel.hidden = false;
    adminStatus.textContent = result.message;
    enableEnterpriseSettings();
  } catch (error) {
    adminStatus.textContent = error.message;
  }
}

async function saveAdminPassword() {
  adminStatus.textContent = "Saving admin password...";
  try {
    const response = await fetch("/api/admin/password", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jackpeek-admin": adminToken || "" },
      body: JSON.stringify({
        currentPassword: currentAdminPasswordInput.value,
        newPassword: newAdminPasswordInput.value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Admin password could not be saved.");
    adminStatus.textContent = result.message;
    currentAdminPasswordInput.value = "";
    newAdminPasswordInput.value = "";
  } catch (error) {
    adminStatus.textContent = error.message;
  }
}

async function loadLicense() {
  const response = await fetch("/api/license");
  const status = await response.json();
  licenseStatus.textContent = `${status.state}${status.edition ? ` - ${status.edition}` : ""}`;
  licenseDetail.textContent = status.detail || status.organization || status.licenseId || "Not installed";
  licenseStatus.className = status.isValid ? "status success" : "status warning";
}

async function importLicense() {
  const file = licenseFileInput.files[0];
  if (!file) return;
  licenseImportStatus.textContent = "Validating offline license...";
  try {
    const response = await fetch("/api/license/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await file.text()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "License is invalid.");
    licenseImportStatus.textContent = "License imported and verified.";
    await loadLicense();
  } catch (error) {
    licenseImportStatus.textContent = error.message;
  }
}

function field(label, value, mode = "") {
  return `<div class="field ${mode}"><span>${label}</span><strong>${escapeHtml(value || value === 0 ? value : "Not advertised")}</strong></div>`;
}

function startCountdown(seconds) {
  clearInterval(countdownTimer);
  const started = Date.now();
  const total = seconds * 1000;
  progressBar.style.width = "0%";
  statusEl.textContent = `Listening passively for ${seconds} seconds...`;
  countdownTimer = setInterval(() => {
    const elapsed = Date.now() - started;
    const remaining = Math.max(0, Math.ceil((total - elapsed) / 1000));
    progressBar.style.width = `${Math.min(100, (elapsed / total) * 100)}%`;
    statusEl.textContent = `Listening passively. ${remaining} seconds remaining.`;
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      statusEl.textContent = "Processing captured discovery frames...";
    }
  }, 250);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function storageModeLabel(mode) {
  if (mode === "nas-only-encrypted-cache") return "Evidence is written to NAS. Local cache is encrypted, temporary, and deleted after sync.";
  if (mode === "local-only") return "Evidence is saved only on this workstation.";
  return "Evidence is saved locally and mirrored to the configured NAS archive when available.";
}

function storageStateLabel(report) {
  if (report.storageState === "pending-nas-sync") return `pending NAS sync, expires ${formatDate(report.cacheExpiresAt)}`;
  if (report.storageState === "nas-synced") return "NAS synced";
  if (report.storageState === "local-and-nas-synced") return "local + NAS synced";
  return "local saved";
}

function parseWarningHours(value) {
  const hours = String(value || "")
    .split(",")
    .map(part => Number(part.trim()))
    .filter(hour => Number.isFinite(hour) && hour > 0);
  return hours.length ? hours : [3, 2];
}

function enableEnterpriseSettings() {
  [storageModeInput, secureModeInput, includeUserInput, localHistoryInput, archiveMirrorInput, localCacheInput, cacheExpirationHoursInput, nasSyncIntervalInput, cacheWarningHoursInput, maxCaptureDurationInput, allowSettingsEditInput, requireValidLicenseInput, requireEvidenceEncryptionInput, evidenceRetentionDaysInput, allowEvidenceDeletionInput, allowNasMirrorInput, adminManagedCacheEncryptionInput, saveSettingsBtn]
    .forEach(control => control.disabled = false);
}

async function readError(response, fallback) {
  try {
    const result = await response.json();
    return result.error || fallback;
  } catch {
    return fallback;
  }
}

Promise.all([loadAdapters(), loadSettings(), loadReports(), loadSession(), loadLicense()]).catch(error => {
  statusEl.textContent = error.message;
});
