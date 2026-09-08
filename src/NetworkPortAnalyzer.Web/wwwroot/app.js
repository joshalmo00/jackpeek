"use strict";

const $ = (id) => document.getElementById(id);
const state = {
  adapters: [],
  settings: null,
  license: null,
  reports: [],
  portLog: [],
  result: null,
  ports: [],
  selectedPort: 0,
  portHistory: [],
  selectedHistory: null,
  portHistoryRequest: 0,
  currentEvidence: null,
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
  activeAdminTab: "accounts",
  logoClicks: 0,
  logoClickTimer: null,
  access: { isApproved: false },
  signedIn: false,
  accounts: [],
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
  if (
    response.status === 401 &&
    state.signedIn &&
    !path.startsWith("/api/admin/unlock")
  ) {
    state.signedIn = false;
    state.adminToken = "";
    state.admin.isUnlocked = false;
    showAuthScreen("signInScreen");
    $("signInStatus").textContent = "Your session ended. Sign in to continue.";
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
    state.signedIn &&
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

function showAuthScreen(id) {
  document.querySelectorAll(".auth-screen").forEach((screen) => {
    screen.hidden = screen.id !== id;
  });
  document.body.classList.toggle("auth-active", Boolean(id));
  if (id) {
    hideNpcapDialog();
    document.title = "Secure access | JackPeek";
    window.scrollTo(0, 0);
    const target = $(id).querySelector("h1");
    if (target) {
      target.tabIndex = -1;
      target.focus();
    }
  }
}
function showAdminLoginPage() {
  showAuthScreen("adminLoginDialog");
  const setup = !state.admin.isConfigured;
  $("adminLoginTitle").textContent = setup
    ? "Set up administrator access"
    : "Administrator sign-in";
  $("adminLoginDescription").textContent = setup
    ? "Create a password for this installation. Use at least 10 characters."
    : "Enter the administrator password to manage accounts and settings.";
  $("adminPortalPasswordInput").value = "";
  $("adminPortalPasswordInput").minLength = setup ? 10 : 1;
  $("adminPortalPasswordInput").autocomplete = setup
    ? "new-password"
    : "current-password";
  $("adminConfirmLabel").hidden = !setup;
  $("adminConfirmInput").required = setup;
  $("adminConfirmInput").value = "";
  $("adminPortalSubmitBtn").textContent = setup
    ? "Create password & sign in"
    : "Sign in";
  $("adminPortalStatus").textContent = "";
  $("adminPortalPasswordInput").focus();
}
function hideAdminLoginPage() {
  if (state.signedIn) {
    showAuthScreen(null);
    showTab(location.hash.slice(1), false);
    $("brandLogo").focus();
  } else showAuthScreen("signInScreen");
}
function renderAccessGate() {
  $("detectedAccount").textContent =
    state.access.account || "Windows account unavailable";
  $("profileAccount").textContent = state.access.account || "";
  $("accessDeniedAccount").textContent =
    state.access.account || "Windows account unavailable";
  $("accessDeniedReason").textContent =
    state.access.message || "This Windows account is not approved.";
}
async function enterWorkspace(tab) {
  state.signedIn = true;
  if (!(await loadSession())) {
    state.signedIn = false;
    showAuthScreen("signInScreen");
    return;
  }
  showAuthScreen(null);
  showTab(tab);
  await Promise.allSettled([loadAdapters(), loadReports(), loadPortLog()]);
  if (state.admin.isUnlocked) await loadAccounts();
}
async function signInWindows() {
  $("windowsSignInBtn").disabled = true;
  $("signInStatus").textContent = "Checking account approval…";
  try {
    state.access = await post("/api/access/login", {});
    renderAccessGate();
    if (!state.access.isApproved) showAuthScreen("accessDeniedScreen");
    else if (state.access.requiresProfile) {
      showAuthScreen("profileScreen");
      $("firstNameInput").focus();
    } else await enterWorkspace("capture");
  } catch (error) {
    $("signInStatus").textContent = error.message;
  } finally {
    $("windowsSignInBtn").disabled = false;
  }
}
async function saveProfile(event) {
  event.preventDefault();
  if (!$("profileForm").reportValidity()) return;
  $("profileSubmitBtn").disabled = true;
  try {
    await post("/api/access/profile", {
      firstName: $("firstNameInput").value.trim(),
      lastName: $("lastNameInput").value.trim(),
    });
    await signInWindows();
  } catch (error) {
    $("profileStatus").textContent = error.message;
  } finally {
    $("profileSubmitBtn").disabled = false;
  }
}
async function signOut() {
  try {
    await post("/api/access/logout", {});
    location.reload();
  } catch (error) {
    notice(error.message, "error");
  }
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
    state.ports = [];
    state.portHistoryRequest++;
    state.portHistory = [];
    state.selectedHistory = null;
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
  state.ports = scan.ports || [];
  state.currentEvidence = scan.evidence;
  state.selectedHistory = null;
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
  renderResults(error);
  if (scan.evidence) {
    $("lastEvidence").hidden = false;
    $("lastEvidence").innerHTML =
      `<p>Evidence saved <span class="mono">${escapeHtml(scan.evidence.evidenceId)}</span></p><button class="button small" type="button" data-open-evidence="${escapeHtml(scan.evidence.evidenceId)}">Review evidence</button>`;
  }
  updateControls();
  void Promise.allSettled([loadReports(), loadPortLog()]);
}

function renderResults(error) {
  $("neighborCount").textContent = String(state.ports.length);
  if (!state.ports.length) {
    $("neighborList").innerHTML =
      '<p class="sidebar-empty">Capture a switch port to find its history.</p>';
    $("results").innerHTML = error
      ? empty(
          "Capture could not complete cleanly",
          "Review the capture message above.",
        )
      : empty(
          "No switch port observed",
          "No switch advertisements were received. Check the link and try a longer capture.",
        );
    return;
  }
  selectPort(0);
}
function field(label, value, className = "") {
  const missing = value === undefined || value === null || value === "";
  return `<div class="${className}"><dt>${escapeHtml(label)}</dt><dd${missing ? ' class="missing"' : ""}>${escapeHtml(missing ? "Not advertised" : value)}</dd></div>`;
}
const portFields = [
  ["switchName", "Switch name"],
  ["switchMac", "Switch MAC address"],
  ["port", "Switch port"],
  ["switchIp", "Switch IP"],
  ["nativeVlan", "Native VLAN"],
  ["voiceVlan", "Voice VLAN"],
  ["duplex", "Duplex"],
  ["portDescription", "Port description"],
  ["capabilities", "Capabilities"],
];
const knownValue = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  (!Array.isArray(value) || value.length > 0);
function comparable(key, value) {
  if (Array.isArray(value))
    return [...value]
      .map((v) => v.toLowerCase())
      .sort()
      .join(", ");
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (key === "port")
    return text
      .replace(/^(gigabitethernet|gi|g)(?=\d)/, "gi")
      .replace(/^tengigabitethernet/, "te")
      .replace(/^fastethernet/, "fa");
  return text;
}
function changedField(key, previous, current) {
  if (!knownValue(previous[key]) || !knownValue(current[key])) return false;
  if (
    key === "capabilities" &&
    comparable(key, previous.protocols || []) !==
      comparable(key, current.protocols || [])
  )
    return false;
  return comparable(key, previous[key]) !== comparable(key, current[key]);
}
function renderPortComparison() {
  const current = state.ports[state.selectedPort];
  if (!current) return;
  const history =
    state.selectedHistory === null
      ? null
      : state.portHistory[state.selectedHistory];
  const differences = history
    ? portFields.filter(([key]) => changedField(key, history.port, current))
    : [];
  const card = (port, title, subtitle) =>
    `<section class="port-card" aria-label="${escapeHtml(title)}"><div class="port-card-heading"><span class="badge">${escapeHtml(title)}</span><p>${escapeHtml(subtitle)}</p></div><dl class="port-values">${portFields
      .map(([key, label]) => {
        const value = port[key];
        const changed = history && changedField(key, history.port, current);
        return `<div class="port-value ${changed ? "value-changed" : ""}"><dt>${escapeHtml(label)}${changed ? '<span class="change-marker">Changed</span>' : ""}</dt><dd>${escapeHtml(knownValue(value) ? (Array.isArray(value) ? value.join(", ") : value) : "Not observed")}</dd></div>`;
      })
      .join(
        "",
      )}</dl>${port.conflicts?.length ? `<div class="conflict"><strong>Conflicting advertised values</strong><ul>${port.conflicts.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul></div>` : ""}</section>`;
  const selector =
    state.ports.length > 1
      ? `<label class="port-selector">Captured switch port<select id="capturedPortSelect">${state.ports.map((port, i) => `<option value="${i}" ${i === state.selectedPort ? "selected" : ""}>${escapeHtml(port.switchName || port.chassisId || "Unnamed switch")} · ${escapeHtml(port.port || "Unknown port")}</option>`).join("")}</select></label>`
      : "";
  $("results").innerHTML =
    `${selector}<div class="port-result-heading"><div><h3>${escapeHtml(current.switchName || "Switch name not observed")}</h3><p>Port ${escapeHtml(current.port || "not observed")}</p></div>${history ? '<button id="closeComparisonBtn" class="button small" type="button">Close comparison</button>' : '<span class="badge success">Current capture</span>'}</div>
    ${history ? `<p class="comparison-status" role="status">${differences.length ? plural(differences.length, "changed field") : "No confirmed value changes"} compared with ${escapeHtml(formatDate(history.scannedAt))}.</p>` : ""}
    <div class="port-comparison ${history ? "is-comparing" : ""}">${history ? card(history.port, "Previous capture", formatDate(history.scannedAt) + " · " + (history.scannedBy || "Name not recorded") + " · " + history.workstation) : ""}${card(current, "Current capture", formatDate(state.result?.completedAt) + " · " + (state.currentEvidence?.displayName || state.currentEvidence?.userName || "Name not recorded"))}</div>
    <p class="comparison-note">Only values observed in both captures are highlighted as changed. Missing values were not observed, and do not confirm a configuration change.</p>`;
}
function selectPort(index) {
  if (!state.ports[index]) return;
  state.selectedPort = index;
  state.selectedHistory = null;
  state.portHistory = [];
  renderPortComparison();
  void loadSelectedPortHistory();
}
async function loadSelectedPortHistory() {
  const id = ++state.portHistoryRequest;
  const port = state.ports[state.selectedPort];
  if (!port) return;
  if (!(port.switchName || port.chassisId) || !port.port) {
    $("neighborList").innerHTML =
      '<p class="sidebar-empty">Switch and port identity are incomplete. History cannot be matched safely.</p>';
    return;
  }
  $("neighborList").innerHTML =
    '<p class="sidebar-empty" role="status">Looking up previous captures…</p>';
  const query = new URLSearchParams({ port: port.port });
  if (port.switchName) query.set("switchName", port.switchName);
  if (port.chassisId) query.set("chassisId", port.chassisId);
  if (state.currentEvidence?.evidenceId)
    query.set("excludeEvidenceId", state.currentEvidence.evidenceId);
  if (state.result?.startedAt) query.set("before", state.result.startedAt);
  try {
    const result = await request("/api/ports/history?" + query);
    if (id !== state.portHistoryRequest) return;
    state.portHistory = result.entries || [];
    $("neighborList").innerHTML =
      `${result.warning ? `<p class="history-warning" role="status">${escapeHtml(result.warning)}</p>` : ""}${state.portHistory.length ? `<p class="history-count">${plural(state.portHistory.length, "previous capture")}</p>` + state.portHistory.map((record, i) => `<button class="port-history-item" type="button" data-port-history="${i}" aria-pressed="false"><strong>${escapeHtml(formatDate(record.scannedAt))}</strong><span>${escapeHtml(record.scannedBy || "Name not recorded")}</span><small>${escapeHtml(record.workstation)}</small></button>`).join("") : '<p class="sidebar-empty">No previous captures found for this port.</p>'}`;
  } catch (error) {
    if (id !== state.portHistoryRequest) return;
    $("neighborList").innerHTML =
      `<p class="history-warning" role="status">${escapeHtml(error.message)}</p><button id="retryPortHistoryBtn" class="button small" type="button">Retry history</button>`;
  }
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
  return !state.admin?.isUnlocked;
}
function renderAdminWorkspace() {
  const unlocked = Boolean(state.admin.isUnlocked);
  $("adminWorkspace").hidden = !unlocked;
  $("settingsLocked").hidden = unlocked;
  $("adminAccessStatus").textContent = "Administrator active";
  $("adminPendingCache").textContent = plural(
    state.pendingCache.length,
    "pending record",
  );
  const modes = {
    "local-only": "Local history",
    "local-nas-mirror": "Local history + NAS mirror",
    "nas-only-encrypted-cache": "NAS primary + encrypted cache",
  };
  $("adminStorageMode").textContent =
    modes[state.settings?.storageMode] || "Local history";
  $("adminArchiveRepository").textContent =
    state.settings?.archiveMirrorPath || "No archive folder configured";
}
function showAdminTab(name) {
  if (!["accounts", "general"].includes(name)) name = "accounts";
  state.activeAdminTab = name;
  document.querySelectorAll("[data-admin-tab]").forEach((tab) => {
    const active = tab.dataset.adminTab === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.adminPanel !== name;
    panel.classList.toggle("active", !panel.hidden);
  });
}
async function loadAccounts() {
  try {
    state.accounts = await request("/api/admin/accounts", {
      headers: adminHeaders(),
    });
    renderAccounts();
    $("accountsStatus").textContent = "";
  } catch (error) {
    $("accountsStatus").textContent = error.message;
  }
}
function renderAccounts() {
  const query = $("accountSearch").value.trim().toLowerCase();
  const filter = $("accountFilter").value;
  const rows = state.accounts.filter(
    (a) =>
      (filter === "all" || a.enabled === (filter === "enabled")) &&
      [a.account, a.displayName].join(" ").toLowerCase().includes(query),
  );
  $("accountCount").textContent = plural(
    state.accounts.filter((a) => a.enabled).length,
    "approved account",
  );
  $("accountRows").innerHTML = rows.length
    ? rows
        .map(
          (a) =>
            `<tr><td><strong class="mono">${escapeHtml(a.account)}</strong></td><td>${a.displayName ? escapeHtml(a.displayName) : '<span class="secondary-text">Name requested at first login</span>'}</td><td><span class="badge ${a.enabled ? "success" : ""}">${a.enabled ? "Approved" : "Disabled"}</span></td><td><button class="button small" type="button" data-account-toggle="${escapeHtml(a.account)}" data-enabled="${!a.enabled}" aria-label="${a.enabled ? "Disable" : "Approve"} ${escapeHtml(a.account)}">${a.enabled ? "Disable" : "Approve"}</button></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="4" class="directory-empty">No accounts match this view.</td></tr>';
}
async function approveAccount(event) {
  event.preventDefault();
  if (!$("accountForm").reportValidity()) return;
  $("approveAccountBtn").disabled = true;
  try {
    await post(
      "/api/admin/accounts",
      { account: $("accountInput").value.trim(), enabled: true },
      adminHeaders(),
    );
    $("accountInput").value = "";
    $("accountFormStatus").textContent =
      "Account approved. Their name will be requested at first login.";
    await loadAccounts();
  } catch (error) {
    $("accountFormStatus").textContent = error.message;
  } finally {
    $("approveAccountBtn").disabled = false;
  }
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
    $("windowsSignInBtn").disabled = false;
    $("administratorSignInBtn").disabled = false;
    $("retrySessionBtn").hidden = true;
    $("signInStatus").textContent = "";
    $("sessionMachine").textContent =
      session.workstation?.machineName || "Local workstation";
    $("sessionUser").textContent =
      session.workstation?.displayName ||
      session.workstation?.userName ||
      "User identity not recorded";
    if (session.settings) applySettings(session.settings);
    if (session.license) applyLicense(session.license);
    renderSettingsStatus();
    renderAdminWorkspace();
    updateAdapter();
    return true;
  } catch (error) {
    $("signInStatus").textContent = error.message;
    $("retrySessionBtn").hidden = false;
    $("settingsStatus").textContent = error.message;
    $("licenseDetail").textContent = "License status unavailable.";
    badge("settingsPolicy", "Settings unavailable", "error");
    notice(
      "Settings could not be loaded. Reload the page to reconnect to JackPeek.",
      "error",
    );
    return false;
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
    state.admin = {
      ...(session.admin || state.admin),
      isUnlocked: state.admin.isUnlocked,
    };
    state.pendingCache = session.pendingCache || [];
    state.access = session.access || state.access;
    renderAccessGate();
    $("sessionUser").textContent =
      session.workstation?.displayName ||
      session.workstation?.userName ||
      "User identity not recorded";
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
function showSettingSection(index) {
  document
    .querySelectorAll("#settingsFields .settings-section")
    .forEach((section, i) => {
      section.hidden = i !== index;
    });
  document
    .querySelectorAll("[data-setting-section]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.settingSection) === index),
      ),
    );
}
async function unlockAdminFromPortal(event) {
  event.preventDefault();
  if (!$("adminPortalForm").reportValidity()) return;
  $("adminPortalSubmitBtn").disabled = true;
  $("adminPortalStatus").textContent = "Checking administrator access…";
  try {
    const password = $("adminPortalPasswordInput").value;
    if (!state.admin.isConfigured) {
      if (password !== $("adminConfirmInput").value)
        throw new Error("The passwords do not match.");
      await post("/api/admin/password", {
        currentPassword: "",
        newPassword: password,
      });
      state.admin.isConfigured = true;
    }
    const result = await post("/api/admin/unlock", { password });
    state.adminToken = result.token || "";
    state.admin = { isConfigured: true, isUnlocked: true };
    $("adminPortalPasswordInput").value = "";
    $("adminConfirmInput").value = "";
    await enterWorkspace("settings");
    showAdminTab("accounts");
  } catch (error) {
    $("adminPortalStatus").textContent = error.message.includes("401")
      ? "The administrator password was not accepted."
      : error.message;
  } finally {
    $("adminPortalSubmitBtn").disabled = false;
  }
}
async function saveAdminPassword(event) {
  event.preventDefault();
  if (!$("adminPasswordForm").reportValidity()) return;
  $("saveAdminPasswordBtn").disabled = true;
  try {
    await post("/api/admin/password", {
      currentPassword: $("currentAdminPasswordInput").value,
      newPassword: $("newAdminPasswordInput").value,
    });
    await signOut();
  } catch (error) {
    $("adminPasswordStatus").textContent = error.message;
  } finally {
    $("saveAdminPasswordBtn").disabled = false;
  }
}

async function syncPendingCache() {
  $("syncCacheBtn").disabled = true;
  $("syncCacheStatus").textContent = "Syncing pending NAS cache...";
  try {
    const result = await post("/api/evidence/sync", {}, adminHeaders());
    state.pendingCache = await request("/api/evidence/cache");
    $("syncCacheStatus").textContent =
      `${result.uploaded || 0} uploaded, ${result.failed || 0} failed, ${result.deletedExpired || 0} expired record removed.`;
    renderAdminWorkspace();
  } catch (error) {
    $("syncCacheStatus").textContent = error.message;
  } finally {
    $("syncCacheBtn").disabled = false;
  }
}
function handleBrandLogoClick(event) {
  event.preventDefault();
  state.logoClicks += 1;
  clearTimeout(state.logoClickTimer);
  state.logoClickTimer = setTimeout(() => {
    state.logoClicks = 0;
  }, 2500);
  if (state.logoClicks < 7) {
    showTab("capture");
    return;
  }
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
      entry.displayName,
      entry.domainName,
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
    `<table><caption class="sr-only">Port scan log</caption><thead><tr><th scope="col">Date</th><th scope="col">Switch</th><th scope="col">Port</th><th scope="col">VLAN</th><th scope="col">Voice VLAN</th><th scope="col">Switch IP</th><th scope="col">Scanned by</th><th scope="col">Workstation</th><th scope="col">Evidence</th><th scope="col">Changes</th></tr></thead><tbody>${rows.map(renderPortRow).join("")}</tbody></table>`;
}

function renderPortRow(item) {
  const entry = item.entry || {};
  const changes = item.changes || [];
  return `<tr class="${item.changedSincePrevious ? "changed-row" : ""}"><td>${escapeHtml(formatDate(entry.scannedAt))}</td><td><strong>${escapeHtml(entry.switchName || entry.switchChassisId || "Not advertised")}</strong><small class="mono"></small></td><td><strong>${escapeHtml(entry.switchPort || "Not advertised")}</strong>${entry.hasCompleteIdentity ? "" : '<small class="identity-state">Incomplete identity</small>'}</td><td>${escapeHtml(entry.nativeVlan ?? "Not advertised")}</td><td>${escapeHtml(entry.voiceVlan ?? "Not advertised")}</td><td class="mono">${escapeHtml(entry.managementIp || "Not advertised")}</td><td>${escapeHtml(entry.displayName || entry.userName || "Not recorded")}</td><td>${escapeHtml(entry.workstation || "Not recorded")}</td><td><button class="button small" type="button" data-report="${escapeHtml(entry.evidenceId)}">Review</button><small class="mono">${escapeHtml(entry.evidenceId || "Not recorded")}</small></td><td>${renderChanges(changes, entry.hasCompleteIdentity)}</td></tr>`;
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
      `<div class="section-heading"><div><h2>Capture report</h2><p class="secondary-text">${escapeHtml(formatDate(record.createdAt))}</p></div><span class="badge">${escapeHtml(plural(record.scan?.observations?.length || 0, "observation"))}</span></div><dl class="detail-grid">${field("Evidence ID", record.evidenceId, "wide")}${field("Workstation", record.workstation?.machineName)}${field("Adapter ID", record.scan?.adapterId, "wide")}${field("Scanned by", record.workstation?.displayName || record.workstation?.userName || "Not recorded")}${field("Stored SHA-256", record.sha256, "full")}</dl>${record.scan?.error ? `<div class="notice error">${escapeHtml(record.scan.error)}</div>` : ""}<div class="report-actions"><a class="button small" href="/reports/${encodeURIComponent(record.evidenceId)}.html" target="_blank" rel="noopener noreferrer">Open printable report</a><a class="button small" href="${base}/download">Export JSON</a><a class="button small" href="${base}/csv">Export CSV</a><a class="button small" href="${base}/package">Download package</a><button id="verifyReportBtn" class="button small" type="button">Verify checksum</button>${state.settings?.allowEvidenceDeletion ? '<button id="deleteReportBtn" class="button small danger" type="button">Delete local report</button>' : ""}</div><p id="verificationStatus" class="verification-status" role="status">Checksum not checked. Exports contain readable evidence, even when stored files are encrypted.</p>`;
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
  if (event.target.closest("#retryPortHistoryBtn")) {
    void loadSelectedPortHistory();
    return;
  }
  const button = event.target.closest("[data-port-history]");
  if (!button) return;
  state.selectedHistory = Number(button.dataset.portHistory);
  document
    .querySelectorAll("[data-port-history]")
    .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
  renderPortComparison();
});
$("results").addEventListener("change", (event) => {
  if (event.target.id === "capturedPortSelect")
    selectPort(Number(event.target.value));
});
$("results").addEventListener("click", (event) => {
  if (!event.target.closest("#closeComparisonBtn")) return;
  state.selectedHistory = null;
  document
    .querySelectorAll("[data-port-history]")
    .forEach((b) => b.setAttribute("aria-pressed", "false"));
  renderPortComparison();
});
$("settingsForm").addEventListener("submit", saveSettings);
$("adminPortalForm").addEventListener("submit", unlockAdminFromPortal);
$("adminPortalCancelBtn").addEventListener("click", hideAdminLoginPage);
$("adminPasswordForm").addEventListener("submit", saveAdminPassword);
$("lockAdminBtn").addEventListener("click", signOut);
$("syncCacheBtn").addEventListener("click", syncPendingCache);
document
  .querySelectorAll("[data-admin-tab]")
  .forEach((tab) =>
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
void loadSession();
showSettingSection(0);
document
  .querySelectorAll("[data-setting-section]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      showSettingSection(Number(button.dataset.settingSection)),
    ),
  );
$("settingsForm").addEventListener(
  "invalid",
  (event) => {
    const section = event.target.closest(".settings-section");
    const index = [
      ...document.querySelectorAll("#settingsFields .settings-section"),
    ].indexOf(section);
    if (index >= 0) showSettingSection(index);
  },
  true,
);
$("windowsSignInBtn").addEventListener("click", signInWindows);
$("administratorSignInBtn").addEventListener("click", showAdminLoginPage);
$("retrySessionBtn").addEventListener("click", loadSession);
$("profileForm").addEventListener("submit", saveProfile);
$("signOutBtn").addEventListener("click", signOut);
document
  .querySelectorAll("[data-open-admin]")
  .forEach((b) => b.addEventListener("click", showAdminLoginPage));
document
  .querySelectorAll("[data-back-signin]")
  .forEach((b) =>
    b.addEventListener("click", () => showAuthScreen("signInScreen")),
  );
$("accountForm").addEventListener("submit", approveAccount);
$("accountSearch").addEventListener("input", renderAccounts);
$("accountFilter").addEventListener("change", renderAccounts);
$("accountRows").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-account-toggle]");
  if (!button) return;
  button.disabled = true;
  try {
    await post(
      "/api/admin/accounts",
      {
        account: button.dataset.accountToggle,
        enabled: button.dataset.enabled === "true",
      },
      adminHeaders(),
    );
    await loadAccounts();
  } catch (error) {
    $("accountsStatus").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
const adminTabs = [...document.querySelectorAll("[data-admin-tab]")];
adminTabs.forEach((tab, index) =>
  tab.addEventListener("keydown", (event) => {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % adminTabs.length
        : event.key === "ArrowLeft"
          ? (index + adminTabs.length - 1) % adminTabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? adminTabs.length - 1
              : null;
    if (next !== null) {
      event.preventDefault();
      showAdminTab(adminTabs[next].dataset.adminTab);
      adminTabs[next].focus();
    }
  }),
);
