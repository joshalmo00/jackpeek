"use strict";

const $ = (id) => document.getElementById(id);

// A shared viewport-level tooltip avoids clipping inside scrolling panels.
function setupContextHelp() {
  const tooltip = document.createElement("div");
  tooltip.id = "contextHelp";
  tooltip.className = "info-tooltip";
  tooltip.role = "tooltip";
  tooltip.hidden = true;
  document.body.append(tooltip);
  let trigger = null;
  let previousDescription = null;
  let closeTimer;
  function close() {
    clearTimeout(closeTimer);
    if (trigger) {
      if (previousDescription === null)
        trigger.removeAttribute("aria-describedby");
      else trigger.setAttribute("aria-describedby", previousDescription);
    }
    tooltip.hidden = true;
    trigger = null;
  }
  function open(button) {
    clearTimeout(closeTimer);
    if (!button || button === trigger) return;
    close();
    const description = button.dataset.help || button.getAttribute("title");
    if (!description) return;
    button.dataset.help = description;
    button.removeAttribute("title");
    trigger = button;
    previousDescription = button.getAttribute("aria-describedby");
    button.setAttribute(
      "aria-describedby",
      [previousDescription, tooltip.id].filter(Boolean).join(" "),
    );
    tooltip.textContent = description;
    tooltip.hidden = false;
    position();
  }
  function position() {
    if (!trigger) return;
    const anchor = trigger.getBoundingClientRect();
    if (anchor.bottom < 0 || anchor.top > innerHeight) {
      close();
      return;
    }
    const box = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(12, Math.min(anchor.left, innerWidth - box.width - 12))}px`;
    const below = anchor.bottom + 8;
    tooltip.style.top = `${Math.max(12, below + box.height <= innerHeight - 12 ? below : anchor.top - box.height - 8)}px`;
  }
  document.addEventListener("pointerover", (event) => {
    if (tooltip.contains(event.target)) clearTimeout(closeTimer);
    else open(event.target.closest(".info-tip"));
  });
  document.addEventListener("pointerout", (event) => {
    if (event.target.closest(".info-tip, #contextHelp")) {
      closeTimer = setTimeout(() => {
        if (document.activeElement !== trigger) close();
      }, 140);
    }
  });
  document.addEventListener("focusin", (event) => {
    const button = event.target.closest(".info-tip");
    if (button) open(button);
    else close();
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".info-tip");
    if (button) open(button);
    else if (!tooltip.contains(event.target)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  document.addEventListener("scroll", position, true);
  window.addEventListener("resize", close);
}
setupContextHelp();

const state = {
  adapters: [],
  settings: null,
  license: null,
  reports: [],
  ledger: [],
  integrity: {},
  reportFilter: "all",
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
  speedTest: { engine: null, autoStarted: false },
  accounts: [],
  adminReviews: [],
  selectedAdminReview: null,
  adminReviewFilter: "all",
  nasHealth: null,
  nasHealthOpen: false,
};
const tabs = [...document.querySelectorAll(".tabs [role='tab']")];
const iconMarkup = (name) =>
  `<svg class="icon" aria-hidden="true"><use href="/assets/heroicons.svg#${name}" /></svg>`;
const emptySymbol = `<div class="empty-symbol" aria-hidden="true">${iconMarkup("server")}</div>`;
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
const plural = (value, noun, pluralNoun = `${noun}s`) =>
  `${value} ${value === 1 ? noun : pluralNoun}`;
const storageStateLabel = (value) =>
  ({
    "local-saved": "Local",
    "local-and-nas-synced": "NAS synchronized",
    "nas-synced": "NAS synchronized",
    "pending-nas-sync": "Pending synchronization",
    pending: "Cache only",
  })[value] || "Storage unavailable";
const userDetailsAllowed = () => state.settings?.includeWindowsUser !== false;
const empty = (title, detail) =>
  `<div class="empty-state">${emptySymbol}<h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p></div>`;
const selectedAdapter = () =>
  state.adapters.find((a) => a.id === $("adapterSelect").value);

function renderNasHealth() {
  const health = state.nasHealth;
  const dock = $("nasHealthDock");
  const menu = $("nasHealthMenu");
  const open = state.nasHealthOpen;
  menu.hidden = !open;
  $("nasHealthBtn").setAttribute("aria-expanded", String(open));
  if (!health) {
    dock.dataset.state = "unknown";
    badge("nasHealthState", "Checking");
    $("nasHealthMessage").textContent = "Checking NAS repository health.";
    $("nasRetainedCount").textContent = "0";
    $("nasPendingCount").textContent = "0";
    $("nasExpiringCount").textContent = "0";
    $("nasNextExpiry").textContent = "None";
    $("nasArchivePath").textContent = "Archive path not loaded.";
    $("nasHealthBadge").hidden = true;
    $("nasForceUploadBtn").disabled = true;
    return;
  }
  dock.dataset.state = health.state || "error";
  const tone =
    health.state === "healthy"
      ? "success"
      : health.state === "warning"
        ? "warning"
        : "error";
  badge(
    "nasHealthState",
    health.connected
      ? health.state === "warning"
        ? "Attention"
        : "Connected"
      : "Unavailable",
    tone,
  );
  $("nasHealthMessage").textContent = health.connected
    ? health.expiringSoonLogs > 0
      ? "NAS is reachable. Some retained local cache records are close to cleanup."
      : "NAS is reachable. New captures are saved to the repository when possible."
    : health.lastError || "NAS repository is not reachable.";
  $("nasRetainedCount").textContent = String(health.retainedLocalLogs || 0);
  $("nasPendingCount").textContent = String(health.pendingUploadLogs || 0);
  $("nasExpiringCount").textContent = String(health.expiringSoonLogs || 0);
  $("nasNextExpiry").textContent = health.nextExpiration
    ? formatDate(health.nextExpiration)
    : "None";
  $("nasArchivePath").textContent =
    health.archivePath || "No NAS archive path configured.";
  const attention = (health.pendingUploadLogs || 0) + (health.expiringSoonLogs || 0);
  $("nasHealthBadge").hidden = attention === 0 && health.connected;
  $("nasHealthBadge").textContent = String(Math.max(1, attention));
  $("nasForceUploadBtn").disabled = !state.signedIn || (health.pendingUploadLogs || 0) === 0;
}

async function loadNasHealth() {
  if (!state.signedIn) return;
  try {
    state.nasHealth = await request("/api/nas/health");
  } catch (error) {
    state.nasHealth = {
      state: "error",
      connected: false,
      retainedLocalLogs: 0,
      pendingUploadLogs: 0,
      expiringSoonLogs: 0,
      lastError: error.message,
    };
  }
  renderNasHealth();
}

async function forceNasUpload() {
  $("nasForceUploadBtn").disabled = true;
  $("nasForceUploadBtn").setAttribute("aria-busy", "true");
  $("nasHealthSyncStatus").textContent = "Uploading pending logs to NAS...";
  try {
    const result = await post("/api/nas/sync", {});
    state.nasHealth = result.health;
    state.pendingCache = state.nasHealth.pending || [];
    $("nasHealthSyncStatus").textContent =
      `${result.sync?.uploaded || 0} uploaded, ${result.sync?.failed || 0} failed, ${result.sync?.deletedExpired || 0} local cache record(s) cleaned.`;
    renderNasHealth();
    renderAdminWorkspace();
    void loadReports();
  } catch (error) {
    $("nasHealthSyncStatus").textContent = error.message;
    await loadNasHealth();
  } finally {
    $("nasForceUploadBtn").setAttribute("aria-busy", "false");
    renderNasHealth();
  }
}

function normalizeWorkstation(value) {
  if (!value) return value;
  return {
    ...value,
    machineName: value.machineName || value.computerName,
    userName: value.userName || value.account,
    displayName: value.displayName || value.userName || value.account,
  };
}

function normalizeAccess(value) {
  if (!value) return value;
  return {
    ...value,
    isApproved: value.isApproved ?? value.approved ?? false,
    account: value.account || value.userName,
    displayName: value.displayName || value.userName || value.account,
    message:
      value.message ||
      ((value.isApproved ?? value.approved)
        ? "This account is approved."
        : "This Windows account is not approved."),
  };
}

function updateSettingsTabVisibility() {
  const adminUnlocked = state.admin?.isUnlocked === true;
  const settingsTab = $("settings-tab");
  settingsTab.hidden = !adminUnlocked;
  settingsTab.style.display = adminUnlocked ? "" : "none";
  settingsTab.setAttribute("aria-hidden", String(!adminUnlocked));
  if (!adminUnlocked && location.hash === "#settings") showTab("capture");
}

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
  if (
    response.status === 403 &&
    path.startsWith("/api/admin/") &&
    state.admin.isUnlocked
  ) {
    state.adminToken = "";
    state.admin.isUnlocked = false;
    state.adminReviews = [];
    updateSettingsTabVisibility();
    showTab("capture");
    notice(
      "Administrator session expired. Sign in again to continue.",
      "warning",
    );
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

function npcapNotice() {
  notice(
    "Install or repair Npcap, then refresh adapters. JackPeek does not install capture drivers.",
  );
  const link = document.createElement("a");
  link.href = "https://npcap.com/#download";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = " Open Npcap download";
  $("captureNotice").append(link);
}

function renderSpeedChart(result) {
  const samples = Array.isArray(result.samples) ? result.samples : [];
  const latest =
    Number.isFinite(result.currentMbps) && result.running
      ? result.currentMbps
      : Number.isFinite(result.upload)
        ? result.upload
        : Number.isFinite(result.download)
          ? result.download
          : null;
  $("speedGaugeValue").textContent = Number.isFinite(latest)
    ? latest.toFixed(latest >= 100 ? 0 : 1)
    : "–";
  $("speedGaugeLabel").textContent =
    result.currentDirection === "upload"
      ? "upload Mbps"
      : result.currentDirection === "download"
        ? "download Mbps"
        : "Mbps";
  if (!samples.length) {
    $("speedChartPath").setAttribute("d", "");
    $("speedChartPeak").textContent = "Waiting";
    return;
  }
  const peak = Math.max(1, ...samples.map((sample) => sample.mbps || 0));
  const width = 360;
  const height = 120;
  const last = Math.max(1, samples.length - 1);
  const path = samples
    .map((sample, index) => {
      const x = (index / last) * width;
      const y =
        height -
        Math.min(1, (sample.mbps || 0) / peak) * (height - 12) -
        6;
      return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  $("speedChartPath").setAttribute("d", path);
  $("speedChartPeak").textContent = `${peak.toFixed(peak >= 100 ? 0 : 1)} Mbps peak`;
}

function renderSpeedTest(result) {
  const number = (value) =>
    Number.isFinite(value) ? value.toFixed(value >= 100 ? 0 : 1) : "–";
  $("speedDownload").textContent = number(result.download);
  $("speedUpload").textContent = number(result.upload);
  $("speedPing").textContent = number(result.ping);
  $("speedJitter").textContent = number(result.jitter);
  $("speedEdge").textContent = result.edge || "Not available";
  renderSpeedChart(result);
  const label = {
    idle: "Ready",
    latency: "Measuring latency",
    download: "Testing download",
    upload: "Testing upload",
    complete: "Complete",
    cancelled: "Cancelled",
    error: "Incomplete",
  };
  badge(
    "speedTestState",
    label[result.phase] || "Ready",
    result.phase === "complete"
      ? "success"
      : result.phase === "error"
        ? "warning"
        : "",
  );
  $("speedTestPanel").classList.toggle("is-running", result.running);
  $("speedTestPanel").dataset.phase = result.phase;
  $("speedTestProgress").value = result.progress;
  $("speedTestProgress").setAttribute(
    "aria-label",
    `${label[result.phase]}: ${Math.round(result.progress)}%`,
  );
  $("speedTestDetail").textContent = result.detail;
  $("speedTestStartBtn").disabled = result.running || !state.signedIn;
  $("speedTestStartBtn").innerHTML =
    `${iconMarkup(result.phase === "idle" ? "play" : "arrow-path")}<span>${result.phase === "idle" ? "Run speed test" : "Run again"}</span>`;
  $("speedTestCancelBtn").hidden = !result.running;
}

function startSpeedTest(manual = false) {
  if (!state.signedIn || (!manual && state.speedTest.autoStarted)) return;
  state.speedTest.autoStarted = true;
  if (!state.speedTest.engine)
    state.speedTest.engine = new window.JackPeekSpeedTest({
      onUpdate: renderSpeedTest,
    });
  void state.speedTest.engine.run();
}

function stopSpeedTest() {
  state.speedTest.engine?.cancel();
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

function showAccountDialog() {
  $("accountFormStatus").textContent = "";
  $("accountDialog").hidden = false;
  $("accountInput").focus();
}

function hideAccountDialog() {
  $("accountDialog").hidden = true;
  $("accountInput").value = "";
  $("accountFormStatus").textContent = "";
  $("openAccountDialogBtn").focus();
}

function showAdminPasswordDialog() {
  $("adminPasswordStatus").textContent = "Use at least 10 characters.";
  $("currentAdminPasswordInput").value = "";
  $("newAdminPasswordInput").value = "";
  $("adminPasswordDialog").hidden = false;
  $("currentAdminPasswordInput").focus();
}

function hideAdminPasswordDialog() {
  $("adminPasswordDialog").hidden = true;
  $("currentAdminPasswordInput").value = "";
  $("newAdminPasswordInput").value = "";
  $("adminPasswordStatus").textContent = "Use at least 10 characters.";
  $("openAdminPasswordDialogBtn").focus();
}

function showAuthScreen(id) {
  window.JackPeekTechnicalReview?.clear();
  document.querySelectorAll(".auth-screen").forEach((screen) => {
    screen.hidden = screen.id !== id;
  });
  document.body.classList.toggle("auth-active", Boolean(id));
  if (id) {
    stopSpeedTest();
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
  startSpeedTest();
  await Promise.allSettled([loadAdapters(), loadReports()]);
  if (state.admin.isUnlocked)
    await Promise.all([loadAccounts(), loadAdminReviews()]);
}
async function signInWindows() {
  $("windowsSignInBtn").disabled = true;
  $("signInStatus").textContent = "Checking account approval…";
  try {
    state.adminToken = "";
    state.admin = { ...state.admin, isUnlocked: false };
    updateSettingsTabVisibility();
    state.access = normalizeAccess(await post("/api/access/login", {}));
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
  $("profileSubmitBtn").setAttribute("aria-busy", "true");
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
    $("profileSubmitBtn").setAttribute("aria-busy", "false");
  }
}
async function signOut() {
  try {
    stopSpeedTest();
    await post("/api/access/logout", {});
    location.reload();
  } catch (error) {
    notice(error.message, "error");
  }
}

function showTab(name, updateUrl = true) {
  if (name === "settings" && !(state.admin?.isUnlocked === true))
    name = "capture";
  if (!tabs.some((tab) => tab.dataset.tab === name && tab.hidden !== true))
    name = "capture";
  tabs.forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active && tab.hidden !== true ? 0 : -1;
    $(tab.dataset.tab).hidden = !active;
  });
  const titles = {
    capture: "Capture",
    history: "Evidence history",
    settings: "Settings",
  };
  document.title = `${titles[name] || "Capture"} | JackPeek`;
  if (updateUrl && location.hash !== `#${name}`)
    history.pushState(null, "", `#${name}`);
}
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => showTab(tab.dataset.tab));
  tab.addEventListener("keydown", (event) => {
    const visibleTabs = tabs.filter((item) => item.hidden !== true);
    const current = visibleTabs.indexOf(tab);
    const next =
      event.key === "ArrowRight"
        ? (current + 1) % visibleTabs.length
        : event.key === "ArrowLeft"
          ? (current + visibleTabs.length - 1) % visibleTabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? visibleTabs.length - 1
              : null;
    if (next !== null && visibleTabs.length) {
      event.preventDefault();
      visibleTabs[next].focus();
      showTab(visibleTabs[next].dataset.tab);
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
  const unavailable =
    !adapter?.captureAvailable || adapter.operationalStatus !== "Up" || blocked;
  $("scanBtn").disabled =
    state.busy ||
    state.adapterLoading ||
    state.settingsBusy ||
    !state.settings ||
    unavailable ||
    Boolean(blocked);
  $("scanBtn").querySelector("span").textContent = state.busy
    ? "Capture in progress"
    : unavailable
      ? "Capture unavailable"
      : "Start capture";
  $("adapterSelect").disabled =
    state.busy || state.adapterLoading || !state.adapters.length;
  $("adapterMenuButton").disabled =
    state.busy || state.adapterLoading || !state.adapters.length;
  if ($("durationInput")) $("durationInput").disabled = state.busy;
  $("refreshBtn").disabled = state.busy || state.adapterLoading;
  $("scanBtn").setAttribute("aria-busy", String(state.busy));
  $("saveSettingsBtn").setAttribute("aria-busy", String(state.settingsBusy));
  $("refreshBtn").setAttribute("aria-busy", String(state.adapterLoading));
}

function captureSupportUnavailable() {
  return `<div class="empty-state capture-driver-state">${emptySymbol}<h3>Capture driver required</h3><p>JackPeek can see the wired adapter, but Windows has not exposed an Npcap capture device for passive LLDP/CDP capture.</p><a class="button small" href="https://npcap.com/#download" target="_blank" rel="noopener noreferrer">Open Npcap download</a></div>`;
}

function adapterStatusLabel(adapter) {
  if (!adapter) return "Unavailable";
  if (adapter.operationalStatus !== "Up") return adapter.operationalStatus;
  return adapter.captureAvailable ? "Ready" : "Driver missing";
}

function adapterDescription(adapter) {
  const name = String(adapter?.name || "").trim();
  const description = String(adapter?.description || "").trim();
  return description &&
    description.localeCompare(name, undefined, { sensitivity: "accent" }) !== 0
    ? description
    : "";
}

function adapterDisplayName(adapter) {
  if (!adapter) return "";
  const description = adapterDescription(adapter);
  return description ? `${adapter.name} · ${description}` : adapter.name;
}

function renderAdapterMenu() {
  const selected = selectedAdapter();
  $("adapterMenuLabel").textContent = selected
    ? adapterDisplayName(selected)
    : state.adapters.length
      ? "Select Ethernet adapter"
      : "No wired adapter detected";
  $("adapterMenu").innerHTML = state.adapters.length
    ? state.adapters
        .map((adapter) => {
          const active = adapter.id === $("adapterSelect").value;
          const tone =
            adapter.operationalStatus === "Up" && adapter.captureAvailable
              ? "success"
              : "warning";
          const description = adapterDescription(adapter);
          return `<button class="adapter-menu-option" type="button" role="option" aria-selected="${active}" data-adapter-id="${escapeHtml(adapter.id)}"><span><strong>${escapeHtml(adapter.name)}</strong>${description ? `<small>${escapeHtml(description)}</small>` : ""}</span><span class="badge ${tone}">${escapeHtml(adapterStatusLabel(adapter))}</span></button>`;
        })
        .join("")
    : '<p class="adapter-menu-empty">No wired Ethernet adapters detected.</p>';
}

function closeAdapterMenu() {
  $("adapterMenu").hidden = true;
  $("adapterMenuButton").setAttribute("aria-expanded", "false");
}

function toggleAdapterMenu() {
  if ($("adapterMenuButton").disabled) return;
  const opening = $("adapterMenu").hidden;
  $("adapterMenu").hidden = !opening;
  $("adapterMenuButton").setAttribute("aria-expanded", String(opening));
  if (opening) renderAdapterMenu();
}

function selectAdapter(id) {
  if (!state.adapters.some((adapter) => adapter.id === id)) return;
  $("adapterSelect").value = id;
  closeAdapterMenu();
  updateAdapter();
}

function updateAdapter() {
  const adapter = selectedAdapter();
  const description = adapterDescription(adapter);
  $("adapterName").textContent = adapter?.name || "No wired Ethernet adapter";
  $("adapterDescription").textContent =
    description ||
    (adapter ? "" : "Connect a physical Ethernet adapter, then refresh.");
  $("adapterDescription").hidden = Boolean(adapter && !description);
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
        : "Driver missing"
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
      $("status").textContent = "Passive capture needs the local Npcap driver.";
      npcapNotice();
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
          ? captureSupportUnavailable()
          : state.settings?.requireValidLicense && !state.license?.isValid
            ? empty(
                "A valid license is required",
                "Import an offline license in Settings to enable capture on this workstation.",
              )
            : empty(
                "Ready to capture",
                "Start a passive capture. Only information advertised by the connected switch will appear here.",
              );
  }
  updateControls();
  renderAdapterMenu();
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
        (adapter) => new Option(adapterDisplayName(adapter), adapter.id),
      ),
    );
    if (!adapters.length)
      $("adapterSelect").append(new Option("No wired adapter detected", ""));
    else
      $("adapterSelect").value = adapters.some((a) => a.id === previous)
        ? previous
        : (adapters.find((a) => a.operationalStatus === "Up") || adapters[0])
            .id;
    renderAdapterMenu();
    updateAdapter();
    if (adapters.some((adapter) => adapter.captureAvailable)) {
      hideNpcapDialog();
    } else {
      showNpcapDialog();
    }
  } catch (error) {
    state.adapters = [];
    $("adapterSelect").replaceChildren(new Option("Adapters unavailable", ""));
    renderAdapterMenu();
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
    $("countdown").textContent = remaining
      ? `${remaining}s remaining`
      : "Saving results";
    $("progressText").textContent = remaining
      ? "Listening for switch advertisements"
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
  const configuredMax = Number(state.settings?.maxCaptureDurationSeconds || 30);
  const requestedSeconds = Number($("durationInput")?.value || 30);
  const seconds = Math.max(5, Math.min(configuredMax, requestedSeconds || 30));
  if ($("durationInput")) $("durationInput").value = String(seconds);
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
  void loadReports();
  void loadNasHealth();
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
const portValueText = (port, key) => {
  const value = port?.[key];
  return knownValue(value)
    ? Array.isArray(value)
      ? value.join(", ")
      : String(value)
    : "Not observed";
};
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
function portResultCopyText() {
  const current = state.ports[state.selectedPort];
  if (!current) return "";
  const history =
    state.selectedHistory === null
      ? null
      : state.portHistory[state.selectedHistory];
  const lines = [
    "JackPeek capture result",
    `Captured: ${formatDate(state.result?.completedAt)}`,
    `Evidence ID: ${state.currentEvidence?.evidenceId || "Not recorded"}`,
    "",
    "Current switch port",
    ...portFields.map(([, label], index) => {
      const key = portFields[index][0];
      return `${label}: ${portValueText(current, key)}`;
    }),
  ];
  if (current.conflicts?.length) {
    lines.push(
      "",
      "Conflicts",
      ...current.conflicts.map((item) => `- ${item}`),
    );
  }
  if (history) {
    lines.push(
      "",
      `Compared with: ${formatDate(history.scannedAt)} by ${history.scannedBy || "Name not recorded"} on ${history.workstation || "Workstation not recorded"}`,
      "Changed fields",
    );
    const differences = portFields.filter(([key]) =>
      changedField(key, history.port, current),
    );
    lines.push(
      ...(differences.length
        ? differences.map(
            ([key, label]) =>
              `${label}: ${portValueText(history.port, key)} -> ${portValueText(current, key)}`,
          )
        : ["None"]),
    );
  }
  return lines.join("\n");
}
async function copyPortResults() {
  const text = portResultCopyText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    $("copyPortResultsBtn").innerHTML =
      `${iconMarkup("check-circle")}<span>Copied</span>`;
    setTimeout(() => {
      if ($("copyPortResultsBtn"))
        $("copyPortResultsBtn").innerHTML =
          `${iconMarkup("clipboard-document")}<span>Copy results</span>`;
    }, 1500);
  } catch {
    notice("Could not copy results to the clipboard.", "error");
  }
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
  const listRows = (port, compareTo = null) =>
    portFields
      .map(([key, label]) => {
        const changed = compareTo && changedField(key, compareTo, port);
        return `<div class="port-list-row ${changed ? "value-changed" : ""}"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(portValueText(port, key))}${changed ? '<span class="change-marker">Changed</span>' : ""}</dd></div>`;
      })
      .join("");
  const selector =
    state.ports.length > 1
      ? `<label class="port-selector">Captured switch port<select id="capturedPortSelect">${state.ports.map((port, i) => `<option value="${i}" ${i === state.selectedPort ? "selected" : ""}>${escapeHtml(port.switchName || port.chassisId || "Unnamed switch")} · ${escapeHtml(port.port || "Unknown port")}</option>`).join("")}</select></label>`
      : "";
  $("results").innerHTML =
    `<section class="port-dashboard">${selector}<div class="port-result-heading"><div><span class="workspace-label">Current capture</span><h3>${escapeHtml(current.switchName || "Switch name not observed")}</h3><p>Port ${escapeHtml(current.port || "not observed")} · ${escapeHtml(formatDate(state.result?.completedAt))}</p></div><div class="port-result-actions"><button id="copyPortResultsBtn" class="button small" type="button">${iconMarkup("clipboard-document")}<span>Copy results</span></button>${history ? `<button id="closeComparisonBtn" class="button small" type="button">${iconMarkup("x-mark")}<span>Close comparison</span></button>` : '<span class="badge success">Current capture</span>'}</div></div>
    ${history ? `<div class="comparison-status" role="status">${differences.length ? plural(differences.length, "changed field") : "No confirmed value changes"} compared with ${escapeHtml(formatDate(history.scannedAt))}.</div><div class="port-side-by-side"><section class="port-list-panel"><h4>Previous</h4><p>${escapeHtml(formatDate(history.scannedAt))} · ${escapeHtml(history.scannedBy || "Name not recorded")} · ${escapeHtml(history.workstation || "Workstation not recorded")}</p><dl>${listRows(history.port, current)}</dl></section><section class="port-list-panel"><h4>Current</h4><p>${escapeHtml(formatDate(state.result?.completedAt))} · ${escapeHtml(state.currentEvidence?.displayName || state.currentEvidence?.userName || "Name not recorded")}</p><dl>${listRows(current, history.port)}</dl></section></div>` : `<dl class="port-list">${listRows(current)}</dl>`}
    ${current.conflicts?.length ? `<div class="conflict"><strong>Conflicting advertised values</strong><ul>${current.conflicts.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul></div>` : ""}
    ${history ? '<p class="comparison-note">Only values observed in both captures are highlighted as changed. Missing values do not confirm a configuration change.</p>' : ""}</section>`;
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
      `${result.warning ? `<p class="history-warning" role="status">${escapeHtml(result.warning)}</p>` : ""}${state.portHistory.length ? `<p class="history-count">${plural(state.portHistory.length, "previous capture")}</p>` + state.portHistory.map((record, i) => `<button class="port-history-item" type="button" data-port-history="${i}" aria-pressed="false"><strong>${escapeHtml(formatDate(record.scannedAt))}</strong><span>${escapeHtml(record.scannedBy || "Name not recorded")}</span></button>`).join("") : '<p class="sidebar-empty">No previous captures found for this port.</p>'}`;
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
  storageMode: "nas-only-encrypted-cache",
  localCachePath: "",
  cacheExpirationHours: 168,
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
  $("adminReviewTabCount").textContent = state.adminReviews.filter(
    (r) => r.status === "Pending review" || r.status === "New identity",
  ).length;
  renderSwitchInventory();
}
function showAdminTab(name) {
  if (
    !["accounts", "general", "reviews", "inventory", "technical"].includes(name)
  )
    name = "accounts";
  state.activeAdminTab = name;
  if (name === "inventory") renderSwitchInventory();
  if (name === "technical") window.JackPeekTechnicalReview?.load();
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
function renderSwitchInventory() {
  const search = $("inventorySearch")?.value.trim().toLocaleLowerCase() || "";
  const statusFilter = $("inventoryStatusFilter")?.value || "all";
  const changesOnly = Boolean($("inventoryChangesFilter")?.checked);
  const pendingOnly = Boolean($("inventoryPendingFilter")?.checked);
  const entries = state.ledger
    .map((item) => item.entry || item)
    .filter((entry) => entry.evidenceId);
  const reportsById = new Map(
    state.reports.map((report) => [report.evidenceId, report]),
  );
  const groups = [];
  const parent = entries.map((_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  };
  const identity = (entry) =>
    [entry.switchName, entry.managementIp, entry.switchChassisId].map(
      (value) => {
        const text = String(value || "")
          .trim()
          .toLocaleLowerCase();
        return text ? text.replace(/[-:]/g, "") : "";
      },
    );
  const values = entries.map(identity);
  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      const matches = values[left].filter(
        (value, index) => value && value === values[right][index],
      ).length;
      if (matches >= 2) union(left, right);
    }
  }
  entries.forEach((entry, index) => {
    const root = find(index);
    let group = groups[root];
    if (!group)
      group = groups[root] = {
        entries: [],
        reports: new Map(),
        names: new Set(),
        ips: new Set(),
        macs: new Set(),
        ports: new Set(),
        vlans: new Set(),
        changes: [],
        pending: false,
        reviewPending: false,
      };
    group.entries.push(entry);
    if (entry.switchName) group.names.add(entry.switchName);
    if (entry.managementIp) group.ips.add(entry.managementIp);
    if (entry.switchChassisId) group.macs.add(entry.switchChassisId);
    if (entry.switchPort) group.ports.add(entry.switchPort);
    [entry.nativeVlan, entry.voiceVlan]
      .filter((value) => value !== null && value !== undefined)
      .forEach((value) => group.vlans.add(String(value)));
    const ledgerItem = state.ledger.find(
      (item) => (item.entry || item).ledgerId === entry.ledgerId,
    );
    (ledgerItem?.changes || []).forEach((change) =>
      group.changes.push({
        ...change,
        scannedAt: entry.scannedAt,
        evidenceId: entry.evidenceId,
        userName: entry.userName,
        workstation: entry.workstation,
        domainName: entry.domainName,
        userSid: entry.userSid,
        sha256: reportsById.get(entry.evidenceId)?.sha256,
        adminStatus: reportsById.get(entry.evidenceId)?.adminReviewRequired
          ? "Requires review"
          : "Pending / not reviewed",
      }),
    );
    const report = reportsById.get(entry.evidenceId);
    if (report) group.reports.set(entry.evidenceId, report);
    if (report?.adminReviewRequired) group.reviewPending = true;
    if (
      report?.adminReviewRequired ||
      report?.storageState === "pending-nas-sync"
    )
      group.pending = true;
  });
  const inventory = groups
    .filter(Boolean)
    .map((group) => {
      const reports = [...group.reports.values()].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
      const latest = reports[0];
      const score = latest?.priorReviewFound
        ? Number(latest.priorReviewMatchScore || 0)
        : 0;
      const status = !latest?.priorReviewFound
        ? { key: "new", label: "New identity", tone: "warning" }
        : latest.adminReviewRequired
          ? { key: "review", label: "Requires review", tone: "warning" }
          : score === 3
            ? { key: "confirmed", label: "Identity confirmed", tone: "success" }
            : { key: "updated", label: "Identity updated", tone: "info" };
      const searchable = [
        ...group.names,
        ...group.ips,
        ...group.macs,
        ...group.ports,
        ...group.vlans,
        ...reports.flatMap((report) => [
          report.deviceName,
          report.model,
          report.platform,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      const changed = group.changes.length > 0 || status.key === "updated";
      const reviewPending = group.reviewPending || status.key === "review";
      return {
        ...group,
        latest,
        reports,
        status,
        changed,
        reviewPending,
        searchable,
        label:
          [...group.names][0] || [...group.macs][0] || "Unidentified switch",
      };
    })
    .filter(
      (group) =>
        (!search || group.searchable.includes(search)) &&
        (statusFilter === "all" || group.status.key === statusFilter) &&
        (!changesOnly || group.changed) &&
        (!pendingOnly || group.reviewPending),
    )
    .sort(
      (a, b) =>
        Date.parse(b.latest?.createdAt || 0) -
        Date.parse(a.latest?.createdAt || 0),
    );
  $("inventoryCount").textContent = plural(
    inventory.length,
    "switch",
    "switches",
  );
  if (!inventory.length) {
    $("switchInventory").innerHTML = empty(
      "No switches in inventory",
      "Completed passive reviews will appear here after they are saved.",
    );
    return;
  }
  $("switchInventory").innerHTML = inventory
    .map(
      (group) =>
        `<article class="inventory-card"><div class="inventory-card-header"><div><span class="workspace-label">${plural(group.reports.length, "review")} · ${plural(group.ports.size, "port")}</span><h3>${escapeHtml(group.label)}</h3></div><span class="badge ${group.status.tone}">${escapeHtml(group.status.label)}</span><button class="info-tip" type="button" title="${escapeHtml(group.status.key === "confirmed" ? "Identity confirmed: all three switch identifiers matched." : group.status.key === "updated" ? "Identity updated: two of three identifiers matched and a change was detected." : group.status.key === "review" ? "Requires review: only one identifier matched or an administrative check is pending." : "New identity: no sufficient match was found in previous evidence.")}" aria-label="Explain identity status">?</button></div><dl class="inventory-facts"><div><dt>Known IP</dt><dd>${escapeHtml([...group.ips].join(", ") || "Not advertised")}</dd></div><div><dt>MAC / chassis ID</dt><dd>${escapeHtml([...group.macs].join(", ") || "Not advertised")}</dd></div><div><dt>Last review</dt><dd>${escapeHtml(formatDate(group.latest?.createdAt))}</dd></div><div><dt>Confidence <button class="info-tip" type="button" title="Confidence is the number of matching identifiers out of three: switch name, Switch IP, and MAC/chassis ID." aria-label="Explain confidence">?</button></dt><dd>${group.latest?.priorReviewFound ? `${escapeHtml(String(group.latest.priorReviewMatchScore || 0))}/3` : "No prior match"}</dd></div></dl><div class="identity-breakdown"><span><strong>Matched</strong> ${escapeHtml((group.latest?.matchedIdentityFields || []).join(", ") || "None")}</span><span><strong>Changed</strong> ${escapeHtml((group.latest?.changedIdentityFields || []).join(", ") || "None")}</span><span><strong>Not announced</strong> ${escapeHtml((group.latest?.unannouncedIdentityFields || []).join(", ") || "None")}</span></div><div class="inventory-subrow"><div><strong>Observed ports</strong><span>${escapeHtml([...group.ports].join(", ") || "None")}</span></div><div><strong>VLANs</strong><span>${escapeHtml([...group.vlans].join(", ") || "Not advertised")}</span></div><div><strong>Storage</strong><span>${escapeHtml(group.latest?.storageState || "Not recorded")}${group.pending ? " · Review pending" : ""}</span></div></div>${
          group.changes.length
            ? `<div class="inventory-changes"><strong>Recent changes</strong>${group.changes
                .slice(0, 4)
                .map(
                  (change) =>
                    `<span>${escapeHtml(change.field)}: ${escapeHtml(change.previous || "Not observed")} → ${escapeHtml(change.current || "Not observed")} · ${escapeHtml(formatDate(change.scannedAt))}</span>`,
                )
                .join("")}</div>`
            : ""
        }<details><summary>View reviews and evidence</summary><div class="inventory-review-list">${group.reports.map((report) => `<div><span>${escapeHtml(formatDate(report.createdAt))} · ${escapeHtml(report.machineName || "Workstation not recorded")}</span><button class="button small" type="button" data-inventory-report="${escapeHtml(report.evidenceId)}">Open evidence</button></div>`).join("")}</div></details></article>`,
    )
    .join("");
  document
    .querySelectorAll("#switchInventory [data-inventory-report]")
    .forEach((button) => {
      const evidenceId = button.dataset.inventoryReport;
      const actions = document.createElement("span");
      actions.className = "inventory-review-actions";
      [
        ["JSON", `/api/reports/${encodeURIComponent(evidenceId)}/download`],
        ["HTML", `/reports/${encodeURIComponent(evidenceId)}.html`],
        ["Package", `/api/reports/${encodeURIComponent(evidenceId)}/package`],
      ].forEach(([label, href]) => {
        const link = document.createElement("a");
        link.className = "button small secondary";
        link.href = href;
        link.textContent = label;
        if (label === "HTML") {
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        actions.append(link);
      });
      button.parentElement.append(actions);
    });
  document
    .querySelectorAll("#switchInventory .inventory-card")
    .forEach((card, index) => {
      const group = inventory[index];
      [
        [
          ".inventory-subrow > div:nth-child(3) strong",
          "Storage shows whether this evidence is local, synchronized to NAS, or waiting for synchronization.",
        ],
        [
          ".inventory-changes > strong",
          "Recent changes compare this review with the latest compatible evidence. They remain visible while an administrator verifies them.",
        ],
      ].forEach(([selector, title]) => {
        const heading = card.querySelector(selector);
        if (!heading) return;
        const help = document.createElement("button");
        help.className = "info-tip";
        help.type = "button";
        help.title = title;
        help.setAttribute("aria-label", `Explain ${heading.textContent}`);
        help.textContent = "?";
        heading.append(help);
      });
      const portCell = card.querySelector(
        ".inventory-subrow > div:first-child span",
      );
      const storageCell = card.querySelector(
        ".inventory-subrow > div:nth-child(3) span",
      );
      if (storageCell) {
        storageCell.textContent = `${storageStateLabel(group.latest?.storageState)}${group.pending ? " · Review pending" : ""}${state.integrity[group.latest?.evidenceId] === false ? " · Integrity warning" : ""}`;
      }
      if (!group || !portCell) return;
      portCell.replaceChildren();
      [...group.ports].forEach((port) => {
        const latestPortEntry = group.entries
          .filter((entry) => entry.switchPort === port && entry.evidenceId)
          .sort(
            (a, b) =>
              Date.parse(b.scannedAt || 0) - Date.parse(a.scannedAt || 0),
          )[0];
        if (!latestPortEntry) return;
        const button = document.createElement("button");
        button.className = "inventory-port-link";
        button.type = "button";
        button.dataset.inventoryReport = latestPortEntry.evidenceId;
        button.textContent = port;
        button.title = `Open latest evidence for port ${port}`;
        portCell.append(button);
      });
    });
}
async function loadAdminReviews() {
  if (!state.admin.isUnlocked) return;
  try {
    state.adminReviews = await request("/api/admin/reviews", {
      headers: adminHeaders(),
    });
    renderAdminReviews();
    renderAdminWorkspace();
  } catch (error) {
    $("adminReviewStatus").textContent = error.message;
  }
}
async function retryAdminNas() {
  $("retryAdminNasBtn").disabled = true;
  $("retryAdminNasBtn").setAttribute("aria-busy", "true");
  $("adminReviewStatus").textContent = "Retrying NAS synchronization...";
  try {
    const result = await post("/api/admin/reviews/sync", {}, adminHeaders());
    state.pendingCache = await request("/api/evidence/cache");
    $("adminReviewStatus").textContent =
      String(result.uploaded || 0) + " evidence item(s) synchronized.";
    await loadAdminReviews();
  } catch (error) {
    $("adminReviewStatus").textContent = error.message;
  } finally {
    $("retryAdminNasBtn").disabled = false;
    $("retryAdminNasBtn").setAttribute("aria-busy", "false");
  }
}
function renderAdminReviews() {
  const query = $("adminReviewSearch").value.trim().toLowerCase();
  const rows = state.adminReviews.filter((r) => {
    const isPending =
      r.status === "Pending review" || r.status === "New identity";
    const matchesFilter =
      state.adminReviewFilter === "all" ||
      (state.adminReviewFilter === "pending" && isPending) ||
      (state.adminReviewFilter === "change" &&
        (r.matchScore === 1 || r.matchScore === 2)) ||
      (state.adminReviewFilter === "new" && r.matchScore === 0) ||
      (state.adminReviewFilter === "nas" &&
        r.storageState === "pending-nas-sync") ||
      (state.adminReviewFilter === "warning" &&
        r.cacheExpiresAt &&
        new Date(r.cacheExpiresAt) - Date.now() <= 6 * 3600000);
    return (
      matchesFilter &&
      [
        r.switchName,
        r.managementIp,
        r.chassisId,
        r.switchPort,
        r.workstation,
        r.user,
        r.evidenceId,
        r.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  });
  const pending = state.adminReviews.filter(
    (r) => r.status === "Pending review" || r.status === "New identity",
  ).length;
  const changes = state.adminReviews.filter(
    (r) => r.matchScore === 1 || r.matchScore === 2,
  ).length;
  const nas = state.adminReviews.filter(
    (r) => r.storageState === "pending-nas-sync",
  ).length;
  const warnings = state.adminReviews.filter(
    (r) =>
      r.cacheExpiresAt &&
      new Date(r.cacheExpiresAt) - Date.now() <= 6 * 3600000,
  ).length;
  $("adminReviewSummary").innerHTML = [
    ["Reviews pending", pending, "pending"],
    ["Identity changes", changes, "change"],
    [
      "New identities",
      state.adminReviews.filter((r) => r.matchScore === 0).length,
      "new",
    ],
    ["NAS sync pending", nas, "nas"],
    ["Cache warnings", warnings, "warning"],
  ]
    .map(
      ([label, value, tone]) =>
        `<button class="review-summary-card ${tone}" type="button" data-review-filter="${tone}"><strong>${value}</strong><span>${label}</span></button>`,
    )
    .join("");
  $("adminReviewTabCount").textContent = pending;
  if (!rows.length) {
    $("adminReviewRows").innerHTML = empty(
      "No reviews pending",
      "Identity alerts and NAS cache warnings will appear here.",
    );
    return;
  }
  $("adminReviewRows").innerHTML =
    `<table><thead><tr><th>Date</th><th>Switch / port</th><th>Match</th><th>Changed</th><th>Storage</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map((r) => `<tr class="${state.selectedAdminReview?.evidenceId === r.evidenceId ? "selected-row" : ""}"><td>${escapeHtml(formatDate(r.createdAt))}</td><td><strong>${escapeHtml(r.switchName || "New identity")}</strong><small class="mono">${escapeHtml(r.switchPort || "Port not advertised")}</small></td><td><span class="badge ${r.matchScore >= 2 ? "success" : "warning"}">${r.matchScore}/3</span><small>${escapeHtml((r.matchedFields || []).join(", ") || "none")}</small></td><td>${escapeHtml((r.changedFields || []).join(", ") || "none")}</td><td>${escapeHtml(r.storageState === "pending-nas-sync" ? "NAS pending" : "Stored")}</td><td><span class="badge ${r.status === "Confirmed" ? "success" : r.status === "Rejected" ? "error" : "warning"}">${escapeHtml(r.status)}</span></td><td><button class="button small" type="button" data-admin-review="${escapeHtml(r.evidenceId)}">Review</button></td></tr>`).join("")}</tbody></table>`;
}
async function openAdminReview(id) {
  const detail = $("adminReviewDetail");
  detail.innerHTML = '<p role="status">Loading review...</p>';
  try {
    const result = await request(
      `/api/admin/reviews/${encodeURIComponent(id)}`,
      { headers: adminHeaders() },
    );
    state.selectedAdminReview = result.item;
    const r = result.item;
    const record = result.record;
    detail.innerHTML = `<div class="section-heading"><div><span class="workspace-label">Review ${escapeHtml(r.matchScore)}/3</span><h3>${escapeHtml(r.switchName || "New switch identity")}</h3><p>${escapeHtml(r.reason)}</p></div><span class="badge warning">${escapeHtml(r.status)}</span></div><dl class="detail-grid">${field("Switch IP", r.managementIp)}${field("Chassis / MAC", r.chassisId)}${field("Port", r.switchPort)}${field("Workstation", r.workstation)}${field("User", r.user || "Not recorded")}${field("SHA-256", r.sha256, "full")}${field("Storage", r.storageState)}${field("NAS expiration", r.cacheExpiresAt ? formatDate(r.cacheExpiresAt) : "Not applicable")}</dl><div class="review-comparison"><h4>Identity comparison</h4><p><strong>Matched:</strong> ${escapeHtml((r.matchedFields || []).join(", ") || "None")}</p><p><strong>Changed:</strong> ${escapeHtml((r.changedFields || []).join(", ") || "None")}</p><p><strong>Not announced:</strong> ${escapeHtml((r.unannouncedFields || []).join(", ") || "None")}</p>${r.priorCreatedAt ? `<p><strong>Previous review:</strong> ${escapeHtml(formatDate(r.priorCreatedAt))}</p>` : ""}</div><div class="review-actions"><a class="button small" href="/api/reports/${encodeURIComponent(r.evidenceId)}/download">Open evidence</a><a class="button small" href="/api/reports/${encodeURIComponent(r.evidenceId)}/package">Export package</a><button class="button small" type="button" data-verify-admin-review="${escapeHtml(r.evidenceId)}">Verify SHA-256</button></div><form id="adminReviewDecisionForm" class="review-decision-form"><label>Administrator comment<textarea id="adminReviewComment" rows="3" placeholder="Add context for the audit record"></textarea></label><div class="review-actions"><button class="button primary" type="submit" data-decision="Confirmed">Confirm identity</button><button class="button secondary" type="submit" data-decision="Review later">Review later</button><button class="button danger" type="submit" data-decision="Rejected">Reject identity</button></div><p id="adminReviewDecisionStatus" class="inline-status" role="status"></p></form>`;
    $("adminReviewDecisionForm").addEventListener("submit", (event) => {
      event.preventDefault();
      void saveAdminReviewDecision(
        r.evidenceId,
        event.submitter.dataset.decision,
      );
    });
    detail
      .querySelector("[data-verify-admin-review]")
      .addEventListener("click", async (event) => {
        event.target.disabled = true;
        const v = await request(
          `/api/reports/${encodeURIComponent(r.evidenceId)}/verify`,
        );
        event.target.textContent = v.valid
          ? "SHA-256 verified"
          : "SHA-256 mismatch";
      });
  } catch (error) {
    detail.innerHTML = empty("Review unavailable", error.message);
  }
}
async function saveAdminReviewDecision(id, status) {
  const statusEl = $("adminReviewDecisionStatus");
  try {
    await post(
      `/api/admin/reviews/${encodeURIComponent(id)}/decision`,
      { status, comment: $("adminReviewComment").value },
      adminHeaders(),
    );
    statusEl.textContent = "Decision saved to the audit log.";
    await loadAdminReviews();
    await openAdminReview(id);
  } catch (error) {
    statusEl.textContent = error.message;
  }
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
  $("approveAccountBtn").setAttribute("aria-busy", "true");
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
    $("accountsStatus").textContent =
      "Account approved. Their name will be requested at first login.";
    hideAccountDialog();
  } catch (error) {
    $("accountFormStatus").textContent = error.message;
  } finally {
    $("approveAccountBtn").disabled = false;
    $("approveAccountBtn").setAttribute("aria-busy", "false");
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
  if ($("durationInput")) {
    const max = Math.max(5, Number(settings.maxCaptureDurationSeconds || 30));
    const current = Number($("durationInput").value || 30);
    $("durationInput").max = String(max);
    $("durationInput").value = String(Math.max(5, Math.min(max, current)));
  }
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
    state.workstation = normalizeWorkstation(session.workstation);
    state.admin = session.admin || { isConfigured: false, isUnlocked: false };
    if (state.admin.isUnlocked !== true) state.adminToken = "";
    updateSettingsTabVisibility();
    state.pendingCache = session.pendingCache || [];
    state.access = normalizeAccess(session.access || state.access);
    renderAccessGate();
    $("windowsSignInBtn").disabled = false;
    $("administratorSignInBtn").disabled = false;
    $("retrySessionBtn").hidden = true;
    $("signInStatus").textContent = "";
    $("sessionMachine").textContent =
      state.workstation?.machineName || "Local workstation";
    $("sessionUser").textContent =
      state.workstation?.displayName ||
      state.workstation?.userName ||
      "User identity not recorded";
    if (session.settings) applySettings(session.settings);
    if (session.license) applyLicense(session.license);
    renderSettingsStatus();
    renderAdminWorkspace();
    updateAdapter();
    if (state.signedIn) void loadNasHealth();
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
    state.workstation = normalizeWorkstation(session.workstation);
    state.admin = {
      ...(session.admin || state.admin),
      isUnlocked: state.admin.isUnlocked,
    };
    updateSettingsTabVisibility();
    state.pendingCache = session.pendingCache || [];
    state.access = normalizeAccess(session.access || state.access);
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
  $("adminPortalSubmitBtn").setAttribute("aria-busy", "true");
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
    state.adminToken = "";
    state.admin = { isConfigured: true, isUnlocked: true };
    updateSettingsTabVisibility();
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
    $("adminPortalSubmitBtn").setAttribute("aria-busy", "false");
  }
}
async function saveAdminPassword(event) {
  event.preventDefault();
  if (!$("adminPasswordForm").reportValidity()) return;
  $("saveAdminPasswordBtn").disabled = true;
  $("saveAdminPasswordBtn").setAttribute("aria-busy", "true");
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
    $("saveAdminPasswordBtn").setAttribute("aria-busy", "false");
  }
}

async function syncPendingCache() {
  $("syncCacheBtn").disabled = true;
  $("syncCacheBtn").setAttribute("aria-busy", "true");
  $("syncCacheStatus").textContent = "Syncing pending NAS cache...";
  try {
    const result = await post("/api/evidence/sync", {}, adminHeaders());
    state.pendingCache = await request("/api/evidence/cache");
    await loadNasHealth();
    $("syncCacheStatus").textContent =
      `${result.uploaded || 0} uploaded, ${result.failed || 0} failed, ${result.deletedExpired || 0} expired record removed.`;
    renderAdminWorkspace();
    await loadAdminReviews();
  } catch (error) {
    $("syncCacheStatus").textContent = error.message;
  } finally {
    $("syncCacheBtn").disabled = false;
    $("syncCacheBtn").setAttribute("aria-busy", "false");
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
  $("refreshReportsBtn").setAttribute("aria-busy", "true");
  $("historyStatus").textContent = "Loading evidence history...";
  try {
    const [reports, ledger] = await Promise.all([
      request("/api/reports"),
      request("/api/ports/log").catch(() => []),
    ]);
    if (!Array.isArray(reports))
      throw new Error("The evidence list could not be read.");
    state.reports = reports;
    state.ledger = Array.isArray(ledger) ? ledger : [];
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
    $("refreshReportsBtn").setAttribute("aria-busy", "false");
  }
}

function historyFilterConfig(type) {
  return type === "switch"
    ? {
        input: "timelineSwitchFilter",
        menu: "switchFilterMenu",
        empty: "No switch values yet",
      }
    : {
        input: "timelinePortFilter",
        menu: "portFilterMenu",
        empty: "No port values yet",
      };
}

function getHistoryFilterOptions(type) {
  const ledgerByEvidence = new Map(
    state.ledger.map((item) => [
      item.entry?.evidenceId || item.evidenceId,
      item,
    ]),
  );
  const values = new Set();
  state.reports.forEach((report) => {
    const ledger = ledgerByEvidence.get(report.evidenceId)?.entry || {};
    const source =
      type === "switch"
        ? [
            report.deviceName,
            ledger.switchName,
            ledger.switchChassisId,
            ledger.managementIp,
          ]
        : [
            report.switchPort,
            ledger.switchPort,
            ledger.nativeVlan,
            ledger.voiceVlan,
          ];
    source
      .filter(
        (value) =>
          value !== null && value !== undefined && String(value).trim(),
      )
      .forEach((value) => values.add(String(value).trim()));
  });
  return [...values].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
}

function renderHistoryFilterMenu(type) {
  const config = historyFilterConfig(type);
  const input = $(config.input);
  const menu = $(config.menu);
  if (!input || !menu) return;
  const query = input.value.trim().toLocaleLowerCase();
  const options = getHistoryFilterOptions(type)
    .filter((value) => !query || value.toLocaleLowerCase().includes(query))
    .slice(0, 12);
  menu.innerHTML = options.length
    ? options
        .map(
          (value) =>
            `<button class="history-combobox-option" type="button" role="option" data-history-filter-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`,
        )
        .join("")
    : `<p class="history-combobox-empty">${escapeHtml(config.empty)}</p>`;
}

function openHistoryFilterMenu(type) {
  const config = historyFilterConfig(type);
  const input = $(config.input);
  const menu = $(config.menu);
  if (!input || !menu) return;
  renderHistoryFilterMenu(type);
  menu.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function closeHistoryFilterMenu(type) {
  const config = historyFilterConfig(type);
  const input = $(config.input);
  const menu = $(config.menu);
  if (!input || !menu) return;
  menu.hidden = true;
  input.setAttribute("aria-expanded", "false");
}

function closeHistoryFilterMenus() {
  closeHistoryFilterMenu("switch");
  closeHistoryFilterMenu("port");
}

function selectHistoryFilterValue(type, value) {
  const config = historyFilterConfig(type);
  const input = $(config.input);
  if (!input) return;
  input.value = value;
  closeHistoryFilterMenu(type);
  renderReports();
}

function setupResponsiveFilters(toggleId, panelId) {
  const toggle = $(toggleId);
  const panel = $(panelId);
  if (!toggle || !panel) return;

  const compactLayout = window.matchMedia("(max-width: 1180px)");
  let expanded = !compactLayout.matches;

  const render = () => {
    const collapsible = compactLayout.matches;
    toggle.hidden = !collapsible;
    panel.hidden = collapsible && !expanded;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    toggle.classList.toggle("active", collapsible && expanded);
  };

  toggle.addEventListener("click", () => {
    expanded = !expanded;
    render();
  });

  const resetForViewport = () => {
    expanded = !compactLayout.matches;
    render();
  };
  compactLayout.addEventListener?.("change", resetForViewport);
  render();
}

function renderReports() {
  const query = $("reportSearch").value.trim().toLocaleLowerCase();
  const filter = $("reportFilter")?.value || "all";
  state.reportFilter = filter;
  const switchQuery =
    $("timelineSwitchFilter")?.value.trim().toLocaleLowerCase() || "";
  const portQuery =
    $("timelinePortFilter")?.value.trim().toLocaleLowerCase() || "";
  const statusFilter = $("timelineStatusFilter")?.value || "all";
  const from = $("timelineFromFilter")?.value || "";
  const to = $("timelineToFilter")?.value || "";
  const ledgerByEvidence = new Map(
    state.ledger.map((item) => [
      item.entry?.evidenceId || item.evidenceId,
      item,
    ]),
  );
  renderHistoryFilterMenu("switch");
  renderHistoryFilterMenu("port");
  const identityState = (r) => {
    if (!r.priorReviewFound)
      return {
        key: "new",
        label: "New identity",
        tone: "warning",
        detail: "No prior switch identity matched this review.",
      };
    if (r.adminReviewRequired)
      return {
        key: "review",
        label: "Requires review",
        tone: "warning",
        detail: `Identity match ${r.priorReviewMatchScore || 1}/3; administrator verification is required.`,
      };
    if (r.priorReviewMatchScore === 3)
      return {
        key: "confirmed",
        label: "Identity confirmed",
        tone: "success",
        detail:
          "All available switch identity markers matched the previous review.",
      };
    return {
      key: "updated",
      label: "Identity updated",
      tone: "info",
      detail: `Identity match ${r.priorReviewMatchScore}/3; the review remains visible while the change is verified.`,
    };
  };
  const reports = state.reports.filter((r) => {
    const isEmpty = Number(r.observations || 0) === 0;
    const hasError = Boolean(r.error || r.status === "error");
    const pending = ["pending-nas-sync", "pending"].includes(r.storageState);
    const needsReview = Boolean(r.adminReviewRequired);
    const status = identityState(r);
    const ledger = ledgerByEvidence.get(r.evidenceId)?.entry || {};
    const identityText = [
      r.deviceName,
      ledger.switchName,
      ledger.switchChassisId,
      ledger.managementIp,
    ]
      .join(" ")
      .toLocaleLowerCase();
    const portText = [
      r.switchPort,
      ledger.switchPort,
      ledger.nativeVlan,
      ledger.voiceVlan,
    ]
      .join(" ")
      .toLocaleLowerCase();
    const date = String(r.createdAt || "").slice(0, 10);
    const matchesFilter =
      filter === "all" ||
      (filter === "success" && !isEmpty && !hasError) ||
      (filter === "empty" && isEmpty) ||
      (filter === "error" && hasError) ||
      (filter === "pending" && pending) ||
      (filter === "review" && needsReview);
    return (
      matchesFilter &&
      (statusFilter === "all" || status.key === statusFilter) &&
      (!switchQuery || identityText.includes(switchQuery)) &&
      (!portQuery || portText.includes(portQuery)) &&
      (!from || date >= from) &&
      (!to || date <= to) &&
      [
        r.deviceName,
        r.switchPort,
        r.machineName,
        r.storageState,
        r.adminReviewReason,
        r.evidenceId,
        formatDate(r.createdAt),
      ].some((v) =>
        String(v || "")
          .toLocaleLowerCase()
          .includes(query),
      )
    );
  });
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
  const groups = new Map();
  reports.forEach((r) => {
    const ledger = ledgerByEvidence.get(r.evidenceId)?.entry || {};
    const groupKey = (
      r.deviceName ||
      ledger.switchChassisId ||
      "Unidentified switch"
    )
      .trim()
      .toLocaleLowerCase();
    if (!groups.has(groupKey))
      groups.set(groupKey, {
        label: r.deviceName || ledger.switchChassisId || "Unidentified switch",
        items: [],
      });
    groups
      .get(groupKey)
      .items.push({
        report: r,
        ledger,
        status: identityState(r),
        changes: ledgerByEvidence.get(r.evidenceId)?.changes || [],
      });
  });
  $("reports").innerHTML =
    `<div class="timeline" aria-label="Evidence timeline">${[...groups.values()]
      .map(
        (group) =>
          `<section class="timeline-group"><div class="timeline-group-heading"><span class="workspace-label">Switch history</span><h2>${escapeHtml(group.label)}</h2><span class="secondary-text">${plural(group.items.length, "review")}</span></div><div class="timeline-events">${group.items
            .map(({ report: r, ledger, status, changes }) => {
              const reviewer = userDetailsAllowed()
                ? ledger.displayName ||
                  ledger.userName ||
                  r.userName ||
                  "Not recorded"
                : "Windows user hidden by policy";
              const changeMarkup = changes.length
                ? `<ul class="timeline-changes">${changes.map((c) => `<li><strong>${escapeHtml(c.field)}</strong><span>${escapeHtml(c.previous || "Not observed")} → ${escapeHtml(c.current || "Not observed")} · ${escapeHtml(formatDate(c.scannedAt))}</span></li>`).join("")}</ul>`
                : `<p class="timeline-muted">No confirmed value changes from the previous review.</p>`;
              const matched = r.matchedIdentityFields || [];
              const changed = r.changedIdentityFields || [];
              const unannounced = r.unannouncedIdentityFields || [];
              const identityDetails = `<div class="identity-breakdown"><span><strong>Matched</strong> ${escapeHtml(matched.join(", ") || "None")}</span><span><strong>Changed</strong> ${escapeHtml(changed.join(", ") || "None")}</span><span><strong>Not announced</strong> ${escapeHtml(unannounced.join(", ") || "None")}</span></div>`;
              return `<article class="timeline-event ${status.key}"><div class="timeline-marker" aria-hidden="true"></div><div class="timeline-event-body"><div class="timeline-event-header"><div><time datetime="${escapeHtml(r.createdAt)}">${escapeHtml(formatDate(r.createdAt))}</time><h3>${escapeHtml(r.switchPort || ledger.switchPort || "Port not advertised")}</h3></div><span class="badge ${status.tone}">${escapeHtml(status.label)}</span></div><p class="timeline-meta"><strong>${escapeHtml(reviewer)}</strong> · ${escapeHtml(ledger.workstation || r.machineName || "Workstation not recorded")}${userDetailsAllowed() ? ` · ${escapeHtml(ledger.domainName || "Local account")}` : ""}</p><p class="timeline-meta">${escapeHtml(ledger.managementIp || "IP not advertised")} · ${escapeHtml(ledger.switchChassisId || "MAC not advertised")} · ${escapeHtml(ledger.nativeVlan ? `VLAN ${ledger.nativeVlan}` : "VLAN not advertised")}</p><details><summary>View identity comparison and evidence</summary><p class="timeline-status-copy">${escapeHtml(status.detail)}</p>${identityDetails}${changeMarkup}<div class="timeline-actions"><button class="button small" type="button" data-report="${escapeHtml(r.evidenceId)}">Review evidence</button><span class="timeline-integrity">SHA-256 ${escapeHtml(r.sha256 ? r.sha256.slice(0, 12) + "…" : "not available")} · ${escapeHtml(storageStateLabel(r.storageState))}${state.integrity[r.evidenceId] === false ? " · Integrity warning" : ""}</span></div></details></div></article>`;
            })
            .join("")}</div></section>`,
      )
      .join("")}</div>`;
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
      `<div class="section-heading"><div><h2>Capture report</h2><p class="secondary-text">${escapeHtml(formatDate(record.createdAt))}</p></div><span class="badge">${escapeHtml(plural(record.scan?.observations?.length || 0, "observation"))}</span></div><dl class="detail-grid">${field("Evidence ID", record.evidenceId, "wide")}${field("Workstation", record.workstation?.machineName)}${field("Adapter ID", record.scan?.adapterId, "wide")}${field("Windows user", record.workstation?.userName || "Not recorded")}${field("Domain", record.workstation?.domainName || "Not recorded")}${field("SID", record.workstation?.userSid || "Not recorded")}${field("Operating system", record.workstation?.operatingSystem || "Not recorded")}${field("App version", record.workstation?.appVersion || "Not recorded")}${field("Scanned by", record.workstation?.displayName || record.workstation?.userName || "Not recorded")}${field("Stored SHA-256", record.sha256, "full")}</dl><div class="timeline-observations"><h3>Advertised switch data</h3>${record.scan?.observations?.length ? record.scan.observations.map((observation) => `<div class="observation-row"><strong>${escapeHtml(observation.latest?.deviceName || observation.latest?.chassisId || "Unnamed switch")}</strong><span>${escapeHtml(observation.latest?.PortId || observation.latest?.portId || "Port not advertised")} · ${escapeHtml(observation.latest?.ManagementAddress || observation.latest?.managementAddress || "IP not advertised")} · ${escapeHtml(observation.Protocol || observation.protocol || "Protocol not recorded")}</span></div>`).join("") : '<p class="timeline-muted">No switch advertisements were recorded.</p>'}</div>${record.scan?.error ? `<div class="notice error">${escapeHtml(record.scan.error)}</div>` : ""}<div class="report-actions"><a class="button small" href="/reports/${encodeURIComponent(record.evidenceId)}.html" target="_blank" rel="noopener noreferrer">Open printable report</a><a class="button small" href="${base}/download">Export JSON</a><a class="button small" href="${base}/csv">Export CSV</a><a class="button small" href="${base}/package">Download package</a><button id="verifyReportBtn" class="button small" type="button">Verify checksum</button>${state.settings?.allowEvidenceDeletion ? '<button id="deleteReportBtn" class="button small danger" type="button">Delete local report</button>' : ""}</div><p id="verificationStatus" class="verification-status" role="status">Checksum not checked. Exports contain readable evidence, even when stored files are encrypted.</p>`;
    $("verifyReportBtn").textContent = "Verify integrity";
    const storageNotice = document.createElement("p");
    storageNotice.className = "timeline-integrity";
    storageNotice.textContent = `Storage: ${storageStateLabel(record.storageState)}. The original evidence file is read-only.`;
    $("verificationStatus").before(storageNotice);
    if (!userDetailsAllowed()) {
      const detailFields =
        $("reportDetail").querySelector(".detail-grid")?.children || [];
      [3, 4, 5, 8].forEach((index) => detailFields[index]?.remove());
    }
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
    state.integrity[id] = Boolean(result.valid);
    $("verificationStatus").textContent = result.valid
      ? "Integrity verified: SHA-256 matches the stored record. This checks consistency, not authorship or authenticity."
      : "Integrity warning: SHA-256 does not match the stored record. The evidence content may have changed.";
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
$("speedTestStartBtn").addEventListener("click", () => startSpeedTest(true));
$("speedTestCancelBtn").addEventListener("click", stopSpeedTest);
window.addEventListener("pagehide", stopSpeedTest);
$("adapterMenuButton").addEventListener("click", toggleAdapterMenu);
$("adapterMenu").addEventListener("click", (event) => {
  const option = event.target.closest("[data-adapter-id]");
  if (option) selectAdapter(option.dataset.adapterId);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".adapter-control")) closeAdapterMenu();
});
$("adapterMenuButton").addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAdapterMenu();
  if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleAdapterMenu();
  }
});
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
  if (event.target.closest("#copyPortResultsBtn")) {
    void copyPortResults();
    return;
  }
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
$("openAccountDialogBtn").addEventListener("click", showAccountDialog);
$("cancelAccountDialogBtn").addEventListener("click", hideAccountDialog);
$("openAdminPasswordDialogBtn").addEventListener(
  "click",
  showAdminPasswordDialog,
);
$("cancelAdminPasswordDialogBtn").addEventListener(
  "click",
  hideAdminPasswordDialog,
);
$("lockAdminBtn").addEventListener("click", signOut);
$("syncCacheBtn").addEventListener("click", syncPendingCache);
$("nasHealthBtn").addEventListener("click", () => {
  state.nasHealthOpen = !state.nasHealthOpen;
  renderNasHealth();
  if (state.nasHealthOpen) void loadNasHealth();
});
$("nasRefreshHealthBtn").addEventListener("click", loadNasHealth);
$("nasForceUploadBtn").addEventListener("click", forceNasUpload);
document.addEventListener("click", (event) => {
  if (!event.target.closest("#nasHealthDock")) {
    state.nasHealthOpen = false;
    renderNasHealth();
  }
});
$("refreshAdminReviewsBtn").addEventListener("click", loadAdminReviews);
$("retryAdminNasBtn").addEventListener("click", retryAdminNas);
$("adminReviewSearch").addEventListener("input", renderAdminReviews);
$("adminReviewRows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-admin-review]");
  if (button) void openAdminReview(button.dataset.adminReview);
});
$("adminReviewSummary").addEventListener("click", (event) => {
  const card = event.target.closest("[data-review-filter]");
  if (!card) return;
  state.adminReviewFilter = card.dataset.reviewFilter;
  renderAdminReviews();
});
document
  .querySelectorAll("[data-admin-tab]")
  .forEach((tab) =>
    tab.addEventListener("click", () => showAdminTab(tab.dataset.adminTab)),
  );
$("licenseFileInput").addEventListener("change", importLicense);
$("refreshReportsBtn").addEventListener("click", loadReports);
$("reportSearch").addEventListener("input", renderReports);
$("reportFilter").addEventListener("change", renderReports);
["timelineFromFilter", "timelineToFilter"].forEach((id) =>
  $(id)?.addEventListener("input", renderReports),
);
["switch", "port"].forEach((type) => {
  const config = historyFilterConfig(type);
  const input = $(config.input);
  const menu = $(config.menu);
  const combobox = document.querySelector(`[data-history-combobox="${type}"]`);
  input?.addEventListener("input", () => {
    openHistoryFilterMenu(type);
    renderReports();
  });
  input?.addEventListener("click", () => openHistoryFilterMenu(type));
  input?.addEventListener("focus", () => openHistoryFilterMenu(type));
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHistoryFilterMenu(type);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openHistoryFilterMenu(type);
      menu?.querySelector("button")?.focus();
    }
  });
  combobox?.addEventListener("click", () => {
    input?.focus();
    openHistoryFilterMenu(type);
  });
  menu?.addEventListener("click", (event) => {
    event.stopPropagation();
    const option = event.target.closest("[data-history-filter-value]");
    if (option)
      selectHistoryFilterValue(type, option.dataset.historyFilterValue || "");
  });
  menu?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeHistoryFilterMenu(type);
      input?.focus();
    }
  });
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".history-combobox")) closeHistoryFilterMenus();
});
setupResponsiveFilters("historyFiltersToggle", "historyFilters");
setupResponsiveFilters("inventoryFiltersToggle", "inventoryFilters");
$("timelineStatusFilter")?.addEventListener("change", renderReports);
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
$("npcapDismissBtn").addEventListener("click", hideNpcapDialog);
$("npcapCheckBtn").addEventListener("click", () => {
  hideNpcapDialog();
  void loadAdapters();
});
$("npcapDialog").addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideNpcapDialog();
});
$("accountDialog").addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideAccountDialog();
});
$("adminPasswordDialog").addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideAdminPasswordDialog();
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
$("inventorySearch")?.addEventListener("input", renderSwitchInventory);
$("inventoryStatusFilter")?.addEventListener("change", renderSwitchInventory);
$("inventoryChangesFilter")?.addEventListener("change", renderSwitchInventory);
$("inventoryPendingFilter")?.addEventListener("change", renderSwitchInventory);
$("refreshInventoryBtn")?.addEventListener("click", async () => {
  $("refreshInventoryBtn").disabled = true;
  $("refreshInventoryBtn").setAttribute("aria-busy", "true");
  try {
    await loadReports();
    renderSwitchInventory();
  } finally {
    $("refreshInventoryBtn").disabled = false;
    $("refreshInventoryBtn").setAttribute("aria-busy", "false");
  }
});
$("switchInventory")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-inventory-report]");
  if (!button) return;
  showTab("history");
  void openReport(button.dataset.inventoryReport);
});
