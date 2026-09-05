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

let adapters = [];
let countdownTimer = null;

refreshBtn.addEventListener("click", loadAdapters);
scanBtn.addEventListener("click", startScan);
adapterSelect.addEventListener("change", updateSelectedAdapter);

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
  renderResults(scan.result);
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

loadAdapters().catch(error => {
  statusEl.textContent = error.message;
});
