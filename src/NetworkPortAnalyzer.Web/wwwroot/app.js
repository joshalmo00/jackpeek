"use strict";

const $ = (id) => document.getElementById(id);
const state = {
  adapters: [],
  settings: null,
  license: null,
  reports: [],
  portLog: [],
  result: null,
  selectedReport: null,
  activeScan: null,
  busy: false,
  adapterLoading: false,
  settingsBusy: false,
  polling: false,
  npcapPromptShown: false,
  timer: null,
  reportRequest: 0,
  workstation: null,
  admin: { isConfigured: false, isUnlocked: false },
  adminToken: "",
  pendingCache: [],
  activeAdminTab: "staff",
  logoClicks: 0,
  logoClickTimer: null,
  access: { isApproved: true, approvedUsers: [], accessContacts: [] },
};
const tabs = [...document.querySelectorAll(".tabs [role='tab']")];
const emptySymbol =
  '<div class="empty-symbol" aria-hidden="true"><svg viewBox="0 0 48 48"><rect x="7" y="12" width="34" height="24" rx="3"/><path d="M13 22h4v6h-4zm9 0h4v6h-4zm9 0h4v6h-4M14 17h20"/></svg></div>';
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const formatDate = (value) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleString()
    : "Not recorded";
const plural = (value, noun) => `${value} ${noun}${value === 1 ? "" : "s"}`;
const empty = (title, detail) =>
  `<div class="empty-state">${emptySymbol}<h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p></div>`;
const selectedAdapter = () =>
  state.adapters.find((a) => a.id === $("adapterSelect").value);

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(
      "The local service could not be reached. Keep JackPeek running and try again.",
    );
  }
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* Report invalid responses below. */
  }
  if (!response.ok)
    throw new Error(
      body?.error ||
        (response.status === 402
          ? "Capture is blocked by the offline license policy. Import a valid license in Settings."
          : `The request failed (HTTP ${response.status}). Try again.`),
    );
  if (text && body === null)
    throw new Error("The local service returned an unreadable response.");
  return body;
}
const adminHeaders = () =>
  state.adminToken ? { "x-jackpeek-admin": state.adminToken } : {};
const post = (path, value, headers = {}) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
function badge(id, label, tone = "") {
  $(id).textContent = label;
  $(id).className = `badge ${tone}`;
}
function notice(message = "", tone = "warning") {
  $("captureNotice").textContent = message;
  $("captureNotice").className = `notice ${tone}`;
  $("captureNotice").hidden = !message;
}

function shouldShowNpcapDialog() {
  return (
    !state.npcapPromptShown &&
    state.adapters.length > 0 &&
    state.adapters.every((adapter) => !adapter.captureAvailable)
  );
}

function showNpcapDialog() {
  if (!shouldShowNpcapDialog()) return;
  state.npcapPromptShown = true;
  $("npcapDialog").hidden = false;
  $("npcapDownloadLink").focus();
}

function hideNpcapDialog() {
  $("npcapDialog").hidden = true;
}

function showAdminLoginPage() {
  showTab("settings");
  if (!state.admin?.isConfigured) {
    showAdminTab("access");
    $("newAdminPasswordInput").focus();
    $("adminPasswordStatus").textContent =
      "Create the administrator password before using the hidden login shortcut.";
    return;
  }
  $("adminLoginDialog").hidden = false;
  document.body.classList.add("admin-login-open");
  $("adminPortalPasswordInput").value = "";
  $("adminPortalStatus").textContent =
    "Enter the administrator password to continue.";
  $("adminPortalPasswordInput").focus();
}

function hideAdminLoginPage() {
  $("adminLoginDialog").hidden = true;
  document.body.classList.remove("admin-login-open");
}

function renderAccessGate() {
  const access = state.access || { isApproved: true };
  const denied = access.isApproved === false;
  $("accessDeniedScreen").hidden = !denied;
  document.body.classList.toggle("access-denied", denied);
  if (!denied) return;
  document.title = "Access denied | JackPeek";
  $("accessDeniedReason").textContent =
    access.message ||
    "This Windows account is not approved to use JackPeek on this workstation.";
  $("accessDeniedAccount").textContent = access.account
    ? `Detected account: ${access.account}`
    : "Detected account could not be normalized.";
}

function showTab(name, updateUrl = true) {
  if (!tabs.some((tab) => tab.dataset.tab === name)) name = "capture";
  tabs.forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    $(tab.dataset.tab).hidden = !active;
  });
  const titles = {
    capture: "Capture",
    history: "Evidence history",
    ports: "Port log",
    settings: "Settings",
  };
  document.title = `${titles[name] || "Capture"} | JackPeek`;
  if (updateUrl && location.hash !== `#${name}`)
    history.pushState(null, "", `#${name}`);
}
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => showTab(tab.dataset.tab));
  tab.addEventListener("keydown", (event) => {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index + tabs.length - 1) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : null;
    if (next !== null) {
      event.preventDefault();
      tabs[next].focus();
      showTab(tabs[next].dataset.tab);
    }
  });
});
window.addEventListener("popstate", () =>
  showTab(location.hash.slice(1), false),
);
window.addEventListener("hashchange", () =>
  showTab(location.hash.slice(1), false),
);

function updateControls() {
  const adapter = selectedAdapter();
  const blocked =
    state.settings?.requireValidLicense && !state.license?.isValid;
  $("scanBtn").disabled =
    state.busy ||
    state.adapterLoading ||
    state.settingsBusy ||
    !state.settings ||
    !adapter?.captureAvailable ||
    adapter.operationalStatus !== "Up" ||
    Boolean(blocked);
  $("scanBtn").querySelector("span").textContent = state.busy
    ? "Capture in progress"
    : "Start capture";
  $("adapterSelect").disabled =
    state.busy || state.adapterLoading || !state.adapters.length;
  $("durationInput").disabled = state.busy;
  $("refreshBtn").disabled = state.busy || state.adapterLoading;
}

function updateAdapter() {
  const adapter = selectedAdapter();
  $("adapterName").textContent = adapter?.name || "No wired Ethernet adapter";
  $("adapterDescription").textContent =
    adapter?.description ||
    "Connect a physical Ethernet adapter, then refresh.";
  $("adapterMac").textContent = adapter?.macAddress || "Not available";
  $("adapterIps").textContent = adapter?.ipAddresses?.length
    ? adapter.ipAddresses.join(" · ")
    : "Not assigned";
  const up = adapter?.operationalStatus === "Up";
  badge(
    "adapterLink",
    adapter
      ? up
        ? "Connected"
        : adapter.operationalStatus === "Down"
          ? "Disconnected"
          : adapter.operationalStatus
      : "Unavailable",
    adapter ? (up ? "success" : "warning") : "",
  );
  badge(
    "captureState",
    adapter
      ? adapter.captureAvailable
        ? "Npcap ready"
        : "Npcap not ready"
      : "No adapter",
    adapter ? (adapter.captureAvailable ? "success" : "warning") : "",
  );
  if (!state.busy) {
    if (!adapter) {
      $("status").textContent = "No wired Ethernet adapter detected.";
      notice();
    } else if (!up) {
      $("status").textContent =
        "Connect an Ethernet cable, then refresh adapters.";
      notice(
        "The selected adapter has no active link. Connect it to a switch before capturing.",
      );
    } else if (!adapter.captureAvailable) {
      $("status").textContent =
        "No capture device is available for this adapter.";
      notice(
        "Check that Npcap is installed and accessible, then refresh adapters. JackPeek does not install capture drivers.",
      );
      const link = document.createElement("a");
      link.href = "https://npcap.com/#download";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent =
        " Npcap download and documentation (opens in a new tab)";
      $("captureNotice").append(link);
    } else if (state.settings?.requireValidLicense && !state.license?.isValid) {
      $("status").textContent = "Capture is blocked by license policy.";
      notice(
        "Import a valid offline license in Settings before starting a capture.",
      );
    } else {
      $("status").textContent =
        "Ready to listen for LLDP and CDP advertisements.";
      notice();
    }
  }
  if (!state.result && !state.busy) {
    $("results").innerHTML = !adapter
      ? empty(
          "No wired Ethernet adapter detected",
          "Connect a physical Ethernet adapter and refresh the adapter list to begin.",
        )
      : !up
        ? empty(
            "Connect Ethernet to begin",
            "The selected adapter has no active link. Connect a cable to the switch, then refresh adapters.",
          )
        : !adapter.captureAvailable
          ? empty(
              "Capture support is unavailable",
              "Check the Npcap installation and access permissions, then refresh adapters.",
            )
          : state.settings?.requireValidLicense && !state.license?.isValid
            ? empty(
                "A valid license is required",
                "Import an offline license in Settings to enable capture on this workstation.",
              )
            : empty(
                "Ready to capture",
                "Select a duration and start listening. Only information advertised by the connected switch will appear here.",
              );
  }
  updateControls();
}

async function loadAdapters() {
  if (state.busy || state.adapterLoading) return;
  const previous = $("adapterSelect").value;
  state.adapterLoading = true;
  updateControls();
  $("status").textContent = "Refreshing Ethernet adapters...";
  try {
    const adapters = await request("/api/adapters");
    if (!Array.isArray(adapters))
      throw new Error("The adapter list could not be read.");
    state.adapters = adapters;
    $("adapterSelect").replaceChildren(
      ...adapters.map(
        (adapter) =>
          new Option(`${adapter.name} · ${adapter.description}`, adapter.id),
      ),
    );
    if (!adapters.length)
      $("adapterSelect").append(new Option("No wired adapter detected", ""));
    else
      $("adapterSelect").value = adapters.some((a) => a.id === previous)
        ? previous
        : (adapters.find((a) => a.operationalStatus === "Up") || adapters[0])
            .id;
    updateAdapter();
    if (adapters.some((adapter) => adapter.captureAvailable)) {
      hideNpcapDialog();
    } else {
      showNpcapDialog();
    }
  } catch (error) {
    state.adapters = [];
    $("adapterSelect").replaceChildren(new Option("Adapters unavailable", ""));
    updateAdapter();
    $("status").textContent = error.message;
    notice("Adapter discovery failed. Refresh adapters to retry.", "error");
  } finally {
    state.adapterLoading = false;
    updateControls();
  }
}

function startCountdown(seconds) {
  clearInterval(state.timer);
  const started = Date.now();
  $("captureProgress").hidden = false;
  $("progressBar").value = 0;
  const tick = () => {
    const elapsed = (Date.now() - started) / 1000;
    const remaining = Math.max(0, Math.ceil(seconds - elapsed));
    $("progressBar").value = Math.min(100, (elapsed / seconds) * 100);
    $("countdown").textContent = remaining ? `${remaining}s` : "Processing";
    $("progressText").textContent = remaining
      ? "Listening for advertisements"
      : "Waiting for results and evidence storage";
    if (!remaining) clearInterval(state.timer);
  };
  tick();
  state.timer = setInterval(tick, 250);
}

async function startScan(event) {
  event.preventDefault();
  if (state.busy || $("scanBtn").disabled || !$("captureForm").reportValidity())
    return;
  const adapter = selectedAdapter();
  const seconds = Number($("durationInput").value);
  if (
    !Number.isInteger(seconds) ||
    seconds < 5 ||
    seconds > Number($("durationInput").max)
  )
    return;
  state.busy = true;
  updateControls();
  notice();
  $("status").textContent = "Starting passive capture...";
  try {
    const created = await post("/api/scans", {
      adapterId: adapter.id,
      durationSeconds: seconds,
    });
    if (!created?.scanId)
      throw new Error("The service did not return a capture ID.");
    state.activeScan = {
      id: created.scanId,
      adapterName: adapter.name,
      adapterId: adapter.id,
    };
    state.result = null;
    $("lastEvidence").hidden = true;
    $("resultContext").hidden = true;
    $("neighborCount").textContent = "0";
    $("neighborList").innerHTML =
      '<p class="sidebar-empty">Waiting for capture results.</p>';
    $("results").innerHTML = empty(
      "Listening for advertisements",
      "Results will appear when the capture finishes. You can use the other workspaces while it runs.",
    );
    $("status").textContent = `Listening on ${adapter.name}.`;
    $("captureSummary").textContent = "Capture in progress";
    startCountdown(seconds);
    await pollScan();
  } catch (error) {
    state.busy = false;
    $("status").textContent = error.message;
    notice(error.message, "error");
    updateControls();
  }
}

async function pollScan() {
  if (!state.activeScan || state.polling) return;
  state.polling = true;
  $("resumeScanBtn").hidden = true;
  notice();
  try {
    // Bound each polling attempt, while retaining the ID if the service needs more time.
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const scan = await request(
        `/api/scans/${encodeURIComponent(state.activeScan.id)}`,
      );
      if (scan?.state === "complete") {
        finishScan(scan);
        return;
      }
      if (scan?.state !== "running")
        throw new Error("The service returned an unknown capture state.");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(
      "The capture is taking longer than expected. Check its status again.",
    );
  } catch (error) {
    clearInterval(state.timer);
    $("progressText").textContent = "Capture status unavailable";
    $("countdown").textContent = "Waiting";
    $("status").textContent = error.message;
    notice(
      "The capture may still be running. Check its status before starting another capture.",
      "error",
    );
    $("resumeScanBtn").hidden = false;
  } finally {
    state.polling = false;
  }
}

function finishScan(scan) {
  clearInterval(state.timer);
  const context = state.activeScan;
  state.busy = false;
  state.activeScan = null;
  state.result = scan.result;
  $("captureProgress").hidden = true;
  $("progressBar").value = 100;
  const error = scan.error || scan.result?.error;
  $("status").textContent =
    error ||
    `Capture complete. ${plural(scan.result?.framesCaptured || 0, "captured frame")}.`;
  notice(error || "", "error");
  $("captureSummary").textContent =
    `${error ? "Completed with an error" : "Capture complete"} · ${formatDate(scan.result?.completedAt)}`;
  $("resultContext").hidden = false;
  $("resultContext").textContent =
    `Capture adapter: ${context.adapterName} · ${context.adapterId}`;
  renderResults(scan.result, error);
  if (scan.evidence) {
    $("lastEvidence").hidden = false;
    $("lastEvidence").innerHTML =
      `<p>Evidence saved <span class="mono">${escapeHtml(scan.evidence.evidenceId)}</span></p><button class="button small" type="button" data-open-evidence="${escapeHtml(scan.evidence.evidenceId)}">Review evidence</button>`;
  }
  updateControls();
  void Promise.allSettled([loadReports(), loadPortLog()]);
}

function renderResults(result, error) {
  const observations = result?.observations || [];
  $("neighborCount").textContent = String(observations.length);
  if (!observations.length) {
    $("neighborList").innerHTML =
      '<p class="sidebar-empty">No neighbors in this capture.</p>';
    $("results").innerHTML = error
      ? empty(
          "Capture could not complete cleanly",
          "Review the capture message above. No neighbor information is available for this attempt.",
        )
      : empty(
          "No advertisements observed",
          "The switch may not advertise LLDP or CDP on this port. Check the link and try a longer capture window.",
        );
    return;
  }
  $("neighborList").innerHTML = observations
    .map(
      (o, index) =>
        `<button type="button" class="neighbor-item" data-neighbor="${index}" aria-pressed="${index === 0}"><span class="badge">${escapeHtml(o.protocol)}</span><strong>${escapeHtml(o.latest?.deviceName || o.latest?.chassisId || "Unnamed neighbor")}</strong><small>${escapeHtml(o.latest?.portId || "Port not advertised")}</small></button>`,
    )
    .join("");
  selectNeighbor(0);
}

function field(label, value, className = "") {
  const missing = value === undefined || value === null || value === "";
  return `<div class="${className}"><dt>${escapeHtml(label)}</dt><dd${missing ? ' class="missing"' : ""}>${escapeHtml(missing ? "Not advertised" : value)}</dd></div>`;
}
function selectNeighbor(index) {
  const o = state.result?.observations?.[index];
  if (!o) return;
  const p = o.latest || {};
  document
    .querySelectorAll("[data-neighbor]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.neighbor) === index),
      ),
    );
  $("results").innerHTML =
    `<div class="neighbor-heading"><div><h3>${escapeHtml(p.deviceName || p.chassisId || "Unnamed neighbor")}</h3><p>Advertised switch information</p></div><span class="badge">${escapeHtml(o.protocol)}</span></div>
    <dl class="detail-grid">${field("Switch port", p.portId, "key-value")}${field("Native VLAN", p.nativeVlan, "key-value")}${field("Voice VLAN", p.voiceVlan, "key-value")}${field("Management IP", p.managementAddress)}${field("Duplex", p.duplex)}${field("Time to live", p.ttlSeconds == null ? null : `${p.ttlSeconds}s`)}${field("Port description", p.portDescription, "wide")}${field("Chassis ID", p.chassisId)}${field("Capabilities", (p.capabilities || []).join(", "), "full")}</dl>
    ${o.conflicts?.length ? `<div class="conflict"><strong>Conflicting advertisements</strong><ul>${o.conflicts.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul></div>` : ""}
    <div class="detail-meta"><span>${escapeHtml(plural(o.framesSeen, "advertisement"))}</span><span>First seen ${escapeHtml(formatDate(o.firstSeen))}</span><span>Last seen ${escapeHtml(formatDate(o.lastSeen))}</span></div>
    <details><summary>System and protocol details</summary><dl class="detail-grid">${field("System description", p.systemDescription, "full")}${field("Platform", p.platform)}${field("Software version", p.softwareVersion, "wide")}</dl><p>Decoded TLVs and unknown fields. Unknown TLV values are retained as hex.</p><pre>${escapeHtml(JSON.stringify({ details: p.details || [], unknownTlvs: p.unknownTlvs || [] }, null, 2))}</pre></details>`;
}

const settingFields = {
  includeWindowsUser: "includeUserInput",
  localHistoryPath: "localHistoryInput",
  archiveMirrorPath: "archiveMirrorInput",
  maxCaptureDurationSeconds: "maxCaptureDurationInput",
  allowSettingsEdit: "allowSettingsEditInput",
  requireValidLicense: "requireValidLicenseInput",
  requireEvidenceEncryption: "requireEvidenceEncryptionInput",
  evidenceRetentionDays: "evidenceRetentionDaysInput",
  allowEvidenceDeletion: "allowEvidenceDeletionInput",
  allowNasMirror: "allowNasMirrorInput",
  storageMode: "storageModeInput",
  localCachePath: "localCachePathInput",
  cacheExpirationHours: "cacheExpirationHoursInput",
  nasSyncIntervalMinutes: "nasSyncIntervalMinutesInput",
  adminManagedCacheEncryption: "adminManagedCacheEncryptionInput",
};
const settingsDefaults = {
  storageMode: "local-nas-mirror",
  localCachePath: "",
  cacheExpirationHours: 24,
  nasSyncIntervalMinutes: 60,
  adminManagedCacheEncryption: true,
};
function settingsRequireAdminUnlock() {
  return Boolean(state.admin?.isConfigured && !state.admin?.isUnlocked);
}
function renderAdminWorkspace() {
  const admin = state.admin || { isConfigured: false, isUnlocked: false };
  const unlocked = Boolean(admin.isUnlocked);
  const setupMode = !admin.isConfigured;
  $("adminWorkspace").hidden = !unlocked && !setupMode;
  $("adminUnlockForm").hidden = unlocked || setupMode;
  $("lockAdminBtn").hidden = !unlocked;
  badge(
    "adminAccessStatus",
    unlocked
      ? "Administrator unlocked"
      : admin.isConfigured
        ? "Password required"
        : "Initial setup",
    unlocked ? "success" : admin.isConfigured ? "warning" : "",
  );
  $("adminUnlockStatus").textContent = unlocked
    ? "Administrator workspace is active for this browser session."
    : admin.isConfigured
      ? "Enter the administrator password to show protected workspace tabs."
      : "Open Access Settings to create the administrator password for this workstation.";
  $("currentAdminPasswordInput").required = Boolean(admin.isConfigured);
  $("adminWindowsUser").textContent =
    state.workstation?.userName || "User identity not recorded";
  $("adminApprovedAccount").textContent =
    state.access?.account || "Not normalized";
  $("adminMachine").textContent =
    state.workstation?.machineName || "Local workstation";
  $("adminIdentityRecording").textContent = state.settings?.includeWindowsUser
    ? "Enabled"
    : "Disabled";
  $("adminPendingCache").textContent = plural(
    state.pendingCache?.length || 0,
    "record",
  );
  $("adminStaffStatus").textContent = setupMode
    ? "Initial setup"
    : "Administrator unlocked";
  $("adminStaffStatus").className = `badge ${setupMode ? "warning" : "success"}`;
  $("adminStorageMode").textContent =
    state.settings?.storageMode || "local-nas-mirror";
  $("adminArchiveRepository").textContent =
    state.settings?.archiveMirrorPath || "Not configured";
  $("approvedUsersList").innerHTML = (state.access?.approvedUsers || [])
    .map((user) => `<li>${escapeHtml(user)}</li>`)
    .join("");
}
function showAdminTab(name) {
  if (!["staff", "access", "general"].includes(name)) name = "staff";
  state.activeAdminTab = name;
  document.querySelectorAll("[data-admin-tab]").forEach((tab) => {
    const active = tab.dataset.adminTab === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    const active = panel.dataset.adminPanel === name;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
}
function renderSettingsStatus() {
  if (!state.settings) return;
  $("settingsStatus").textContent = state.settings.allowSettingsEdit
    ? settingsRequireAdminUnlock()
      ? "Unlock administrator access to save protected settings."
      : "Changes apply to future captures."
    : "Settings editing is disabled by local policy.";
}
function applySettings(settings) {
  settings = { ...settingsDefaults, ...settings };
  state.settings = settings;
  for (const [key, id] of Object.entries(settingFields)) {
    const control = $(id);
    if (control.type === "checkbox") control.checked = Boolean(settings[key]);
    else if (control.tagName === "SELECT")
      control.value = settings[key] || "local-nas-mirror";
    else control.value = settings[key] ?? "";
  }
  $("durationInput").max = String(settings.maxCaptureDurationSeconds || 120);
  if (Number($("durationInput").value) > Number($("durationInput").max))
    $("durationInput").value = $("durationInput").max;
  const adminLocked = settingsRequireAdminUnlock();
  $("settingsFields").disabled = !settings.allowSettingsEdit || adminLocked;
  $("saveSettingsBtn").disabled = !settings.allowSettingsEdit || adminLocked;
  badge(
    "settingsPolicy",
    adminLocked
      ? "Admin unlock required"
      : settings.allowSettingsEdit
      ? "Editable on this workstation"
      : "Settings locked",
    adminLocked || !settings.allowSettingsEdit ? "warning" : "",
  );
  renderAdminWorkspace();
  updateControls();
}
function applyLicense(license) {
  state.license = license;
  badge(
    "licenseStatus",
    `${license.state}${license.edition ? ` · ${license.edition}` : ""}`,
    license.isValid ? "success" : "",
  );
  $("licenseDetail").textContent = license.isValid
    ? `${license.organization || "Licensed workstation"}${license.validUntil ? `. Valid until ${formatDate(license.validUntil)}.` : "."}`
    : "No valid offline license is available. Captures are permitted unless policy requires a valid license.";
  updateControls();
}
async function loadSession() {
  try {
    const session = await request("/api/session");
    state.workstation = session.workstation;
    state.admin = session.admin || { isConfigured: false, isUnlocked: false };
    state.pendingCache = session.pendingCache || [];
    state.access = session.access || state.access;
    renderAccessGate();
    $("sessionMachine").textContent =
      session.workstation?.machineName || "Local workstation";
    $("sessionUser").textContent =
      session.workstation?.userName || "User identity not recorded";
    applySettings(session.settings);
    applyLicense(session.license);
    renderSettingsStatus();
    renderAdminWorkspace();
    updateAdapter();
  } catch (error) {
    $("settingsStatus").textContent = error.message;
    $("licenseDetail").textContent = "License status unavailable.";
    badge("settingsPolicy", "Settings unavailable", "error");
    notice(
      "Settings could not be loaded. Reload the page to reconnect to JackPeek.",
      "error",
    );
  }
}
async function saveSettings(event) {
  event.preventDefault();
  if (
    !state.settings?.allowSettingsEdit ||
    settingsRequireAdminUnlock() ||
    state.settingsBusy ||
    !$("settingsForm").reportValidity()
  )
    return;
  if (
    !$("allowSettingsEditInput").checked &&
    !window.confirm(
      "Lock settings after saving? To unlock them, you will need to edit %LOCALAPPDATA%\\JackPeek\\settings.json outside this app.",
    )
  )
    return;
  const update = {};
  for (const [key, id] of Object.entries(settingFields)) {
    const control = $(id);
    update[key] =
      control.type === "checkbox"
        ? control.checked
        : control.type === "number"
          ? Number(control.value)
          : control.value.trim();
  }
  // Preserve legacy and export policy fields that this form does not edit.
  state.settingsBusy = true;
  $("saveSettingsBtn").disabled = true;
  $("settingsFields").disabled = true;
  updateControls();
  $("settingsStatus").textContent = "Saving settings...";
  try {
    applySettings(await post("/api/evidence/settings", update, adminHeaders()));
    $("settingsStatus").textContent = state.settings.allowSettingsEdit
      ? "Settings saved."
      : "Settings saved and editing locked.";
    const session = await request("/api/session");
    state.workstation = session.workstation;
    state.admin = { ...(session.admin || state.admin), isUnlocked: state.admin.isUnlocked };
    state.pendingCache = session.pendingCache || [];
    state.access = session.access || state.access;
    renderAccessGate();
    $("sessionUser").textContent =
      session.workstation?.userName || "User identity not recorded";
    applyLicense(session.license);
    renderAdminWorkspace();
    updateAdapter();
    state.selectedReport = null;
    $("reportDetail").hidden = true;
    await loadReports();
  } catch (error) {
    $("settingsStatus").textContent = error.message;
  } finally {
    state.settingsBusy = false;
    $("settingsFields").disabled =
      !state.settings?.allowSettingsEdit || settingsRequireAdminUnlock();
    $("saveSettingsBtn").disabled =
      !state.settings?.allowSettingsEdit || settingsRequireAdminUnlock();
    updateControls();
  }
}
async function validateAdminPassword(password) {
    const result = await post("/api/admin/unlock", {
      password,
    });
    state.adminToken = result.token || "";
    state.admin = { isConfigured: true, isUnlocked: Boolean(result.unlocked) };
    renderAdminWorkspace();
    applySettings(state.settings);
    renderSettingsStatus();
    return result;
}
async function unlockAdmin(event) {
  event.preventDefault();
  if (!$("adminUnlockForm").reportValidity()) return;
  $("unlockAdminBtn").disabled = true;
  $("adminUnlockStatus").textContent = "Checking administrator password...";
  try {
    const result = await validateAdminPassword($("adminPasswordInput").value);
    $("adminPasswordInput").value = "";
    $("adminUnlockStatus").textContent =
      result.message || "Administrator workspace unlocked.";
  } catch (error) {
    $("adminUnlockStatus").textContent =
      error.message || "Administrator password was not accepted.";
  } finally {
    $("unlockAdminBtn").disabled = false;
  }
}
async function unlockAdminFromPortal(event) {
  event.preventDefault();
  if (!$("adminPortalForm").reportValidity()) return;
  $("adminPortalSubmitBtn").disabled = true;
  $("adminPortalStatus").textContent = "Validating administrator password...";
  try {
    const result = await validateAdminPassword($("adminPortalPasswordInput").value);
    $("adminPortalPasswordInput").value = "";
    hideAdminLoginPage();
    showTab("settings");
    showAdminTab("staff");
    $("adminUnlockStatus").textContent =
      result.message || "Administrator workspace unlocked.";
  } catch (error) {
    $("adminPortalStatus").textContent =
      error.message || "Administrator password was not accepted.";
  } finally {
    $("adminPortalSubmitBtn").disabled = false;
  }
}
async function saveAdminPassword(event) {
  event.preventDefault();
  if (!$("adminPasswordForm").reportValidity()) return;
  $("saveAdminPasswordBtn").disabled = true;
  $("adminPasswordStatus").textContent = "Saving administrator password...";
  try {
    await post("/api/admin/password", {
      currentPassword: $("currentAdminPasswordInput").value,
      newPassword: $("newAdminPasswordInput").value,
    });
    $("currentAdminPasswordInput").value = "";
    $("newAdminPasswordInput").value = "";
    state.admin = { isConfigured: true, isUnlocked: false };
    state.adminToken = "";
    $("adminPasswordInput").focus();
    $("adminPasswordStatus").textContent =
      "Administrator password saved. Unlock again to continue.";
    renderAdminWorkspace();
    applySettings(state.settings);
    renderSettingsStatus();
  } catch (error) {
    $("adminPasswordStatus").textContent = error.message;
  } finally {
    $("saveAdminPasswordBtn").disabled = false;
  }
}
function lockAdmin() {
  state.adminToken = "";
  state.admin = { ...(state.admin || {}), isUnlocked: false };
  $("adminUnlockStatus").textContent = "Administrator workspace locked.";
  renderAdminWorkspace();
  applySettings(state.settings);
  renderSettingsStatus();
}
async function syncPendingCache() {
  $("syncCacheBtn").disabled = true;
  $("syncCacheStatus").textContent = "Syncing pending NAS cache...";
  try {
    const result = await post("/api/evidence/sync", {}, adminHeaders());
    state.pendingCache = await request("/api/evidence/cache");
    $("syncCacheStatus").textContent = `${result.uploaded || 0} uploaded, ${result.failed || 0} failed, ${result.deletedExpired || 0} expired record removed.`;
    renderAdminWorkspace();
  } catch (error) {
    $("syncCacheStatus").textContent = error.message;
  } finally {
    $("syncCacheBtn").disabled = false;
  }
}
function handleBrandLogoClick(event) {
  state.logoClicks += 1;
  clearTimeout(state.logoClickTimer);
  state.logoClickTimer = setTimeout(() => {
    state.logoClicks = 0;
  }, 2500);
  if (state.logoClicks < 7) return;
  event.preventDefault();
  state.logoClicks = 0;
  clearTimeout(state.logoClickTimer);
  showAdminLoginPage();
}
async function importLicense() {
  const file = $("licenseFileInput").files[0];
  if (!file) return;
  if (file.size > 1024 * 1024) {
    $("licenseImportStatus").textContent =
      "Choose a license file smaller than 1 MB.";
    return;
  }
  $("licenseFileInput").disabled = true;
  $("licenseImportStatus").textContent = "Validating license...";
  try {
    const status = await request("/api/license/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await file.text(),
    });
    applyLicense(status);
    $("licenseImportStatus").textContent = "License imported and verified.";
    updateAdapter();
  } catch (error) {
    $("licenseImportStatus").textContent = error.message;
  } finally {
    $("licenseFileInput").disabled = false;
    $("licenseFileInput").value = "";
  }
}

async function loadReports() {
  $("refreshReportsBtn").disabled = true;
  $("historyStatus").textContent = "Loading evidence history...";
  try {
    const reports = await request("/api/reports");
    if (!Array.isArray(reports))
      throw new Error("The evidence list could not be read.");
    state.reports = reports;
    renderReports();
    $("historyStatus").textContent = "";
    if (
      state.selectedReport &&
      !reports.some((r) => r.evidenceId === state.selectedReport.evidenceId)
    ) {
      state.selectedReport = null;
      $("reportDetail").hidden = true;
    }
  } catch (error) {
    $("historyStatus").textContent = error.message;
    $("reportCount").textContent = "History unavailable";
    $("reports").innerHTML = empty(
      "History could not be loaded",
      "Refresh history to retry. Existing evidence files have not been changed.",
    );
  } finally {
    $("refreshReportsBtn").disabled = false;
  }
}

async function loadPortLog() {
  $("refreshPortsBtn").disabled = true;
  $("portStatus").textContent = "Loading port log...";
  try {
    const entries = await request("/api/ports/log");
    if (!Array.isArray(entries))
      throw new Error("The port log could not be read.");
    state.portLog = entries;
    renderPortLog();
    $("portStatus").textContent = "";
  } catch (error) {
    $("portStatus").textContent = error.message;
    $("portCount").textContent = "Port log unavailable";
    $("portLog").innerHTML = empty(
      "Port log could not be loaded",
      "Refresh the port log to retry. Existing evidence files have not been changed.",
    );
  } finally {
    $("refreshPortsBtn").disabled = false;
  }
}

function renderPortLog() {
  const query = $("portSearch").value.trim().toLocaleLowerCase();
  const rows = state.portLog.filter((item) => {
    const entry = item.entry || {};
    return [
      entry.switchName,
      entry.switchChassisId,
      entry.switchPort,
      entry.nativeVlan,
      entry.voiceVlan,
      entry.managementIp,
      entry.userName,
      entry.workstation,
      entry.evidenceId,
      entry.adapterId,
    ].some((value) =>
      String(value || "")
        .toLocaleLowerCase()
        .includes(query),
    );
  });
  $("portCount").textContent = query
    ? `${rows.length} of ${plural(state.portLog.length, "port record")}`
    : plural(rows.length, "port record");
  if (!rows.length) {
    $("portLog").innerHTML = empty(
      query ? "No matching port records" : "No port records yet",
      query
        ? "Try a different switch, port, VLAN, IP, user, workstation, or evidence ID."
        : "Completed captures with advertised switch information will appear here.",
    );
    return;
  }
  $("portLog").innerHTML =
    `<table><caption class="sr-only">Port scan log</caption><thead><tr><th scope="col">Date</th><th scope="col">Switch</th><th scope="col">Port</th><th scope="col">VLAN</th><th scope="col">Voice VLAN</th><th scope="col">Management IP</th><th scope="col">Scanned by</th><th scope="col">Workstation</th><th scope="col">Evidence</th><th scope="col">Changes</th></tr></thead><tbody>${rows.map(renderPortRow).join("")}</tbody></table>`;
}

function renderPortRow(item) {
  const entry = item.entry || {};
  const changes = item.changes || [];
  return `<tr class="${item.changedSincePrevious ? "changed-row" : ""}"><td>${escapeHtml(formatDate(entry.scannedAt))}</td><td><strong>${escapeHtml(entry.switchName || entry.switchChassisId || "Not advertised")}</strong><small class="mono">${escapeHtml((entry.protocols || []).join(", ") || "Protocol not recorded")}</small></td><td><strong>${escapeHtml(entry.switchPort || "Not advertised")}</strong>${entry.hasCompleteIdentity ? "" : '<small class="identity-state">Incomplete identity</small>'}</td><td>${escapeHtml(entry.nativeVlan ?? "Not advertised")}</td><td>${escapeHtml(entry.voiceVlan ?? "Not advertised")}</td><td class="mono">${escapeHtml(entry.managementIp || "Not advertised")}</td><td>${escapeHtml(entry.userName || "Not recorded")}</td><td>${escapeHtml(entry.workstation || "Not recorded")}</td><td><button class="button small" type="button" data-report="${escapeHtml(entry.evidenceId)}">Review</button><small class="mono">${escapeHtml(entry.evidenceId || "Not recorded")}</small></td><td>${renderChanges(changes, entry.hasCompleteIdentity)}</td></tr>`;
}

function renderChanges(changes, hasCompleteIdentity) {
  if (!hasCompleteIdentity)
    return '<span class="badge warning">Incomplete identity</span>';
  if (!changes.length) return '<span class="badge success">No change</span>';
  return `<div class="change-list"><span class="badge warning">${escapeHtml(plural(changes.length, "change"))}</span><details><summary>Changed fields</summary><dl>${changes.map((change) => `<div><dt>${escapeHtml(change.field)}</dt><dd>${escapeHtml(change.previous || "Not advertised")} to ${escapeHtml(change.current || "Not advertised")}</dd></div>`).join("")}</dl></details></div>`;
}

function renderReports() {
  const query = $("reportSearch").value.trim().toLocaleLowerCase();
  const reports = state.reports.filter((r) =>
    [
      r.deviceName,
      r.switchPort,
      r.machineName,
      r.evidenceId,
      formatDate(r.createdAt),
    ].some((v) =>
      String(v || "")
        .toLocaleLowerCase()
        .includes(query),
    ),
  );
  $("reportCount").textContent = query
    ? `${reports.length} of ${plural(state.reports.length, "report")}`
    : plural(reports.length, "report");
  if (!reports.length) {
    $("reports").innerHTML = empty(
      query ? "No matching reports" : "No saved evidence yet",
      query
        ? "Try a different device, port, or workstation name."
        : "Completed captures are saved here, including attempts that return no advertisements.",
    );
    return;
  }
  $("reports").innerHTML =
    `<table><caption class="sr-only">Saved capture evidence</caption><thead><tr><th scope="col">Device / port</th><th scope="col">Captured</th><th scope="col">Workstation</th><th scope="col">Observations</th><th scope="col">Report</th></tr></thead><tbody>${reports.map((r) => `<tr class="${r.evidenceId === state.selectedReport?.evidenceId ? "selected-row" : ""}"><td><strong>${escapeHtml(r.deviceName || "No neighbor observed")}</strong><small class="mono">${escapeHtml(r.switchPort || "Port not advertised")}</small></td><td>${escapeHtml(formatDate(r.createdAt))}</td><td>${escapeHtml(r.machineName)}</td><td>${escapeHtml(r.observations)}<small>${escapeHtml(plural(r.framesCaptured, "frame"))}</small></td><td><button class="button small" type="button" data-report="${escapeHtml(r.evidenceId)}" aria-label="Review report from ${escapeHtml(formatDate(r.createdAt))}">Review</button></td></tr>`).join("")}</tbody></table>`;
}
async function openReport(id) {
  const generation = ++state.reportRequest;
  $("reportDetail").hidden = false;
  $("reportDetail").innerHTML = '<p role="status">Loading report...</p>';
  try {
    const record = await request(`/api/reports/${encodeURIComponent(id)}`);
    if (generation !== state.reportRequest) return;
    state.selectedReport = record;
    renderReports();
    const base = `/api/reports/${encodeURIComponent(record.evidenceId)}`;
    $("reportDetail").innerHTML =
      `<div class="section-heading"><div><h2>Capture report</h2><p class="secondary-text">${escapeHtml(formatDate(record.createdAt))}</p></div><span class="badge">${escapeHtml(plural(record.scan?.observations?.length || 0, "observation"))}</span></div><dl class="detail-grid">${field("Evidence ID", record.evidenceId, "wide")}${field("Workstation", record.workstation?.machineName)}${field("Adapter ID", record.scan?.adapterId, "wide")}${field("Windows user", record.workstation?.userName || "Not recorded")}${field("Stored SHA-256", record.sha256, "full")}</dl>${record.scan?.error ? `<div class="notice error">${escapeHtml(record.scan.error)}</div>` : ""}<div class="report-actions"><a class="button small" href="/reports/${encodeURIComponent(record.evidenceId)}.html" target="_blank" rel="noopener noreferrer">Open printable report</a><a class="button small" href="${base}/download">Export JSON</a><a class="button small" href="${base}/csv">Export CSV</a><a class="button small" href="${base}/package">Download package</a><button id="verifyReportBtn" class="button small" type="button">Verify checksum</button>${state.settings?.allowEvidenceDeletion ? '<button id="deleteReportBtn" class="button small danger" type="button">Delete local report</button>' : ""}</div><p id="verificationStatus" class="verification-status" role="status">Checksum not checked. Exports contain readable evidence, even when stored files are encrypted.</p>`;
    $("verifyReportBtn").addEventListener("click", () =>
      verifyReport(record.evidenceId),
    );
    $("deleteReportBtn")?.addEventListener("click", () =>
      deleteReport(record.evidenceId),
    );
  } catch (error) {
    if (generation === state.reportRequest)
      $("reportDetail").innerHTML = empty("Report unavailable", error.message);
  }
}
async function verifyReport(id) {
  const button = $("verifyReportBtn");
  button.disabled = true;
  try {
    const result = await request(
      `/api/reports/${encodeURIComponent(id)}/verify`,
    );
    if (state.selectedReport?.evidenceId !== id) return;
    $("verificationStatus").textContent = result.valid
      ? "Checksum matches the stored record. This checks consistency, not authorship or authenticity."
      : "Checksum mismatch. The report content differs from its stored checksum.";
    $("verificationStatus").className =
      `verification-status ${result.valid ? "success-text" : "error-text"}`;
  } catch (error) {
    if (state.selectedReport?.evidenceId === id)
      $("verificationStatus").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
async function deleteReport(id) {
  if (
    !window.confirm(
      `Delete local evidence ${id}? This cannot be undone. Archive copies and exported files will remain.`,
    )
  )
    return;
  const button = $("deleteReportBtn");
  button.disabled = true;
  try {
    await request(`/api/reports/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (state.selectedReport?.evidenceId === id) {
      state.selectedReport = null;
      $("reportDetail").hidden = true;
    }
    await loadReports();
    $("historyStatus").textContent =
      "Local report deleted. Archive copies and exports were not removed.";
  } catch (error) {
    if (state.selectedReport?.evidenceId === id)
      $("verificationStatus").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

$("captureForm").addEventListener("submit", startScan);
$("brandLogo").addEventListener("click", handleBrandLogoClick);
$("refreshBtn").addEventListener("click", loadAdapters);
$("adapterSelect").addEventListener("change", updateAdapter);
$("resumeScanBtn").addEventListener("click", pollScan);
$("neighborList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-neighbor]");
  if (button) selectNeighbor(Number(button.dataset.neighbor));
});
$("settingsForm").addEventListener("submit", saveSettings);
$("adminUnlockForm").addEventListener("submit", unlockAdmin);
$("adminPortalForm").addEventListener("submit", unlockAdminFromPortal);
$("adminPortalCancelBtn").addEventListener("click", hideAdminLoginPage);
$("adminPasswordForm").addEventListener("submit", saveAdminPassword);
$("lockAdminBtn").addEventListener("click", lockAdmin);
$("syncCacheBtn").addEventListener("click", syncPendingCache);
document.querySelectorAll("[data-admin-tab]").forEach((tab) =>
  tab.addEventListener("click", () => showAdminTab(tab.dataset.adminTab)),
);
$("licenseFileInput").addEventListener("change", importLicense);
$("refreshReportsBtn").addEventListener("click", loadReports);
$("reportSearch").addEventListener("input", renderReports);
$("refreshPortsBtn").addEventListener("click", loadPortLog);
$("portSearch").addEventListener("input", renderPortLog);
$("reports").addEventListener("click", (event) => {
  const button = event.target.closest("[data-report]");
  if (button) void openReport(button.dataset.report);
});
$("lastEvidence").addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-evidence]");
  if (button) {
    showTab("history");
    void openReport(button.dataset.openEvidence);
  }
});
$("portLog").addEventListener("click", (event) => {
  const button = event.target.closest("[data-report]");
  if (button) {
    showTab("history");
    void openReport(button.dataset.report);
  }
});
$("npcapDismissBtn").addEventListener("click", hideNpcapDialog);
$("npcapCheckBtn").addEventListener("click", () => {
  hideNpcapDialog();
  void loadAdapters();
});
$("npcapDialog").addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideNpcapDialog();
});
$("adminLoginDialog").addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideAdminLoginPage();
});
showTab(location.hash.slice(1), false);
void Promise.allSettled([
  loadAdapters(),
  loadSession(),
  loadReports(),
  loadPortLog(),
]);
