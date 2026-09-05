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
const secureModeInput = document.querySelector("#secureModeInput");
const includeUserInput = document.querySelector("#includeUserInput");
const localHistoryInput = document.querySelector("#localHistoryInput");
const archiveMirrorInput = document.querySelector("#archiveMirrorInput");
const maxCaptureDurationInput = document.querySelector("#maxCaptureDurationInput");
const allowSettingsEditInput = document.querySelector("#allowSettingsEditInput");
const requireValidLicenseInput = document.querySelector("#requireValidLicenseInput");
const requireEvidenceEncryptionInput = document.querySelector("#requireEvidenceEncryptionInput");
const evidenceRetentionDaysInput = document.querySelector("#evidenceRetentionDaysInput");
const allowEvidenceDeletionInput = document.querySelector("#allowEvidenceDeletionInput");
const allowNasMirrorInput = document.querySelector("#allowNasMirrorInput");
const saveSettingsBtn = document.querySelector("#saveSettingsBtn");
const settingsStatus = document.querySelector("#settingsStatus");
const refreshReportsBtn = document.querySelector("#refreshReportsBtn");
const reportsEl = document.querySelector("#reports");
const sessionUser = document.querySelector("#sessionUser");
const sessionMachine = document.querySelector("#sessionMachine");
const lastEvidence = document.querySelector("#lastEvidence");
const tabButtons = document.querySelectorAll("[data-tab-target]");
const tabPanels = document.querySelectorAll(".tab-panel");
const licenseFileInput = document.querySelector("#licenseFileInput");
const licenseStatus = document.querySelector("#licenseStatus");
const licenseDetail = document.querySelector("#licenseDetail");
const licenseImportStatus = document.querySelector("#licenseImportStatus");

let adapters = [];
let countdownTimer = null;

refreshBtn.addEventListener("click", loadAdapters);
scanBtn.addEventListener("click", startScan);
adapterSelect.addEventListener("change", updateSelectedAdapter);
saveSettingsBtn.addEventListener("click", saveSettings);
refreshReportsBtn.addEventListener("click", loadReports);
licenseFileInput.addEventListener("change", importLicense);
tabButtons.forEach(button => button.addEventListener("click", () => showTab(button.dataset.tabTarget)));

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
  secureModeInput.checked = Boolean(settings.secureMode);
  includeUserInput.checked = Boolean(settings.includeWindowsUser);
  localHistoryInput.value = settings.localHistoryPath || "";
  archiveMirrorInput.value = settings.archiveMirrorPath || "";
  maxCaptureDurationInput.value = settings.maxCaptureDurationSeconds || 120;
  durationInput.max = settings.maxCaptureDurationSeconds || 120;
  if (Number(durationInput.value) > Number(durationInput.max)) durationInput.value = durationInput.max;
  allowSettingsEditInput.checked = Boolean(settings.allowSettingsEdit);
  requireValidLicenseInput.checked = Boolean(settings.requireValidLicense);
  requireEvidenceEncryptionInput.checked = Boolean(settings.requireEvidenceEncryption);
  evidenceRetentionDaysInput.value = settings.evidenceRetentionDays || 0;
  allowEvidenceDeletionInput.checked = Boolean(settings.allowEvidenceDeletion);
  allowNasMirrorInput.checked = settings.allowNasMirror !== false;
  [secureModeInput, includeUserInput, localHistoryInput, archiveMirrorInput, maxCaptureDurationInput, allowSettingsEditInput, requireValidLicenseInput, requireEvidenceEncryptionInput, evidenceRetentionDaysInput, allowEvidenceDeletionInput, allowNasMirrorInput, saveSettingsBtn]
    .forEach(control => control.disabled = !settings.allowSettingsEdit);
  settingsStatus.textContent = settings.archiveMirrorPath
    ? "Evidence is saved locally and mirrored to the configured archive."
    : "Evidence is saved locally on this workstation.";
}

async function saveSettings() {
  saveSettingsBtn.disabled = true;
  settingsStatus.textContent = "Saving evidence settings...";
  try {
    const response = await fetch("/api/evidence/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secureMode: secureModeInput.checked,
        includeWindowsUser: includeUserInput.checked,
        localHistoryPath: localHistoryInput.value,
        archiveMirrorPath: archiveMirrorInput.value,
        maxCaptureDurationSeconds: Number(maxCaptureDurationInput.value || 120),
        allowSettingsEdit: allowSettingsEditInput.checked,
        requireValidLicense: requireValidLicenseInput.checked,
        requireEvidenceEncryption: requireEvidenceEncryptionInput.checked,
        evidenceRetentionDays: Number(evidenceRetentionDaysInput.value || 0),
        allowEvidenceDeletion: allowEvidenceDeletionInput.checked,
        allowNasMirror: allowNasMirrorInput.checked,
        allowedExportFormats: ["json", "html", "package"]
      })
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Evidence settings could not be saved.");
    }
    localHistoryInput.value = result.localHistoryPath || "";
    archiveMirrorInput.value = result.archiveMirrorPath || "";
    maxCaptureDurationInput.value = result.maxCaptureDurationSeconds || 120;
    durationInput.max = result.maxCaptureDurationSeconds || 120;
    if (Number(durationInput.value) > Number(durationInput.max)) durationInput.value = durationInput.max;
    allowSettingsEditInput.checked = Boolean(result.allowSettingsEdit);
    requireValidLicenseInput.checked = Boolean(result.requireValidLicense);
    requireEvidenceEncryptionInput.checked = Boolean(result.requireEvidenceEncryption);
    evidenceRetentionDaysInput.value = result.evidenceRetentionDays || 0;
    allowEvidenceDeletionInput.checked = Boolean(result.allowEvidenceDeletion);
    allowNasMirrorInput.checked = result.allowNasMirror !== false;
    [secureModeInput, includeUserInput, localHistoryInput, archiveMirrorInput, maxCaptureDurationInput, allowSettingsEditInput, requireValidLicenseInput, requireEvidenceEncryptionInput, evidenceRetentionDaysInput, allowEvidenceDeletionInput, allowNasMirrorInput, saveSettingsBtn]
    [secureModeInput, includeUserInput, localHistoryInput, archiveMirrorInput, maxCaptureDurationInput, allowSettingsEditInput, saveSettingsBtn]
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
  const response = await fetch("/api/reports");
  const reports = await response.json();
  if (!reports.length) {
    reportsEl.innerHTML = `<div class="empty">No saved evidence reports yet.</div>`;
    return;
  }

  reportsEl.innerHTML = reports.map(report => `<article class="report-row">
    <div>
      <strong>${escapeHtml(report.deviceName || "No neighbor observed")}</strong>
      <span>${escapeHtml(report.switchPort || "Port not advertised")} - ${escapeHtml(report.machineName)} - ${escapeHtml(formatDate(report.createdAt))}</span>
      <small>${escapeHtml(report.observations)} observation${report.observations === 1 ? "" : "s"} - ${escapeHtml(report.framesCaptured)} frame${report.framesCaptured === 1 ? "" : "s"} - SHA-256 ${escapeHtml(report.sha256.slice(0, 16))}...</small>
    </div>
    <div class="report-actions">
      ${reportLinks(report)}
    </div>
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

Promise.all([loadAdapters(), loadSettings(), loadReports(), loadSession(), loadLicense()]).catch(error => {
  statusEl.textContent = error.message;
});
