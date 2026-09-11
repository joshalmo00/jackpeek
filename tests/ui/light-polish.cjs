// Isolated UI regression fixtures: every request is intercepted, no live API/NAS.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const axe = require('axe-core');
const root = path.resolve('src/NetworkPortAnalyzer.Web/wwwroot');
const output = path.resolve('.ui-test/redesign');
fs.mkdirSync(output, { recursive: true });
const base = 'http://127.0.0.1:49999';
const switchName = 'DEMO-EastTower-Distribution-Stack-01.example.test';
const port = { switchName, chassisId: '02:00:00:00:00:01', switchMac: '02:00:00:00:00:01', port: 'GigabitEthernet1/0/24', switchIp: '192.0.2.10', nativeVlan: 2954, voiceVlan: 1024, duplex: 'Full', capabilities: ['Bridge'], portDescription: 'DEMO workstation outlet', protocols: ['LLDP'], conflicts: [] };
const packet = { deviceName: switchName, chassisId: port.chassisId, portId: port.port, managementAddress: port.switchIp, nativeVlan: port.nativeVlan, voiceVlan: port.voiceVlan, duplex: 'Full', capabilities: ['Bridge'], details: [], unknownTlvs: [] };
const scan = { scanId: 'demo-0', adapterId: 'demo-wired', framesCaptured: 2, startedAt: '2026-09-09T15:00:00Z', completedAt: '2026-09-09T15:00:30Z', observations: [{ protocol: 'LLDP', framesSeen: 2, latest: packet, conflicts: [], firstSeen: '2026-09-09T15:00:01Z', lastSeen: '2026-09-09T15:00:28Z' }] };
const reports = Array.from({ length: 24 }, (_, i) => ({ evidenceId: `demo-${i}`, createdAt: new Date(Date.parse(scan.completedAt) - i * 3600000).toISOString(), machineName: 'DEMO-WORKSTATION', userName: 'Demo reviewer', deviceName: switchName, switchPort: port.port, switchChassisId: port.chassisId, managementIp: port.switchIp, observations: 1, framesCaptured: 2, sha256: 'a'.repeat(64), storageState: 'local-saved', priorReviewFound: true, priorReviewMatchScore: 3, matchedIdentityFields: ['Name', 'IP', 'Chassis'], changedIdentityFields: [], scan, workstation: { machineName: 'DEMO-WORKSTATION', userName: 'Demo reviewer' } }));
const ledger = reports.map((r, i) => ({ entry: { ledgerId: `demo-ledger-${i}`, scannedAt: r.createdAt, switchName, switchChassisId: port.chassisId, managementIp: port.switchIp, switchPort: port.port, nativeVlan: 2954, voiceVlan: 1024, capabilities: ['Bridge'], duplex: 'Full', workstation: r.machineName, userName: r.userName, evidenceId: r.evidenceId, protocols: ['LLDP'], hasCompleteIdentity: true }, changes: [] }));
const settings = { secureMode: true, includeWindowsUser: true, localHistoryPath: 'DEMO/Evidence', archiveMirrorPath: '', maxCaptureDurationSeconds: 120, allowSettingsEdit: true, requireValidLicense: false, requireEvidenceEncryption: false, evidenceRetentionDays: 0, allowEvidenceDeletion: false, allowNasMirror: false, allowedExportFormats: ['json', 'html', 'package'], storageMode: 'local-only' };

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.JACKPEEK_BROWSER ? { channel: process.env.JACKPEEK_BROWSER } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(7000);
  const errors = [], unknown = [];
  page.on('pageerror', e => errors.push(e.message));
  let admin = true, approved = true, driver = true, speedRequests = 0;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'https://speed.cloudflare.com') {
      speedRequests++;
      // This suite exercises the blocked-service experience. The speed engine
      // tests separately validate throughput, stream sizes and cancellation.
      return route.abort('internetdisconnected');
    }
    assert.equal(url.origin, base, 'Unexpected external request');
    let body;
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/session') body = { settings, license: { isValid: false, state: 'Not installed' }, admin: { isConfigured: true, isUnlocked: admin }, access: { isApproved: approved, account: 'DEMO\\reviewer', requiresProfile: false }, workstation: { machineName: 'DEMO-WORKSTATION', userName: 'Demo reviewer' } };
      else if (url.pathname === '/api/access/login') body = { isApproved: approved, requiresProfile: false };
      else if (url.pathname === '/api/adapters') body = [{ id: 'demo-wired', name: 'DEMO Ethernet', description: 'DEMO Ethernet', operationalStatus: 'Up', captureAvailable: driver, macAddress: '02:00:00:00:00:02', ipAddresses: ['192.0.2.20', '2001:db8:1234:5678:1234:5678:abcd:1234'] }, { id: 'demo-usb', name: 'DEMO USB Ethernet', description: 'DEMO USB Gigabit adapter', operationalStatus: 'Down', captureAvailable: true, ipAddresses: [] }];
      else if (url.pathname.endsWith('/traffic')) body = { capturedAt: new Date().toISOString(), bytesReceived: 1000000, bytesSent: 500000 };
      else if (url.pathname === '/api/reports') body = reports;
      else if (url.pathname === '/api/ports/log') body = ledger;
      else if (url.pathname === '/api/nas/health') body = { state: 'healthy', connected: true, archivePath: 'DEMO/NAS', retainedLocalLogs: 2, pendingUploadLogs: 0, expiringSoonLogs: 0, nextExpiration: null, lastError: null, pending: [] };
      else if (url.pathname === '/api/nas/sync') body = { sync: { pendingBefore: 0, uploaded: 0, deletedExpired: 0, failed: 0, lastError: null }, health: { state: 'healthy', connected: true, archivePath: 'DEMO/NAS', retainedLocalLogs: 2, pendingUploadLogs: 0, expiringSoonLogs: 0, nextExpiration: null, lastError: null, pending: [] } };
      else if (url.pathname === '/api/ports/history') body = { entries: reports.map(r => ({ evidenceId: r.evidenceId, scannedAt: r.createdAt, scannedBy: r.userName, workstation: r.machineName, port: {...port, nativeVlan: 100} })), warning: null };
      else if (url.pathname === '/api/admin/accounts') body = [];
      else if (url.pathname === '/api/admin/reviews') body = [];
      else if (url.pathname === '/api/scans') body = { scanId: 'demo-0' };
      else if (url.pathname === '/api/scans/demo-0') body = { state: 'complete', result: scan, evidence: reports[0], ports: [port] };
      else if (/^\/api\/reports\/demo-\d+$/.test(url.pathname)) body = reports.find(r => url.pathname.endsWith(r.evidenceId));
      else if (url.pathname === '/api/admin/technical-review') body = { buildVersion: 'DEMO', review: JSON.parse(fs.readFileSync('docs/technical-review.json')), manifest: { sourceFingerprintSha256: 'demo' }, capabilities: ['Synthetic UI test'] };
      else { unknown.push(url.pathname); body = {}; }
      return route.fulfill({ json: body });
    }
    const file = path.join(root, url.pathname === '/' ? 'index.html' : ['privacy', 'terms'].includes(url.pathname.slice(1)) ? `${url.pathname}.html` : url.pathname);
    if (!fs.existsSync(file)) { unknown.push(url.pathname); return route.fulfill({ status: 404 }); }
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
    return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
  });
  const shot = name => page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  async function fit(name) {
    const result = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, dark: getComputedStyle(document.body).colorScheme }));
    assert(result.scroll <= result.width + 1, `${name} overflows: ${JSON.stringify(result)}`);
    assert.equal(result.dark, 'light', `${name} color scheme`);
    console.log(`PASS ${name}`);
  }
  async function accessible(name) {
    await page.addScriptTag({ content: axe.source });
    const results = await page.evaluate(async () => {
      const result = await axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
      return result.violations.map(v => ({id:v.id, impact:v.impact, nodes:v.nodes.map(n => n.target)}));
    });
    assert.deepEqual(results, [], `${name}: accessibility`);
    console.log(`PASS ${name} accessibility`);
  }
  try {
    await page.goto(base);
    await page.locator('#windowsSignInBtn:not(:disabled)').waitFor();
    assert.equal(speedRequests, 0, 'No Internet test before sign-in');
    assert.match(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily), /Arial|Helvetica Neue|Segoe UI/i, 'App uses the Arial-like system font stack');
    await shot('login');
    await accessible('sign-in');
    await page.locator('#administratorSignInBtn').click();
    await fit('administrator login');
    await shot('admin-login');
    await page.locator('#adminPortalCancelBtn').click();
    await page.locator('#windowsSignInBtn').click();
    await page.locator('#scanBtn:not(:disabled)').waitFor();
    assert.equal(await page.locator('#liveTrafficPanel').count(), 0, 'Traffic counters do not replace speed test');
    await page.locator('#speedTestPanel[data-phase="error"]').waitFor();
    assert(speedRequests > 0, 'Test starts automatically after sign-in');
    assert.equal(await page.locator('#speedUpload').textContent(), '–', 'Missing upload is not zero');
    assert.equal(await page.locator('#speedTestTitle').textContent(), 'Speed Test');
    assert.equal(await page.locator('#speedChart').count(), 1, 'Speed Test includes a live graph surface');
    await page.locator('#adapterMenuButton').click();
    await shot('adapter-dropdown');
    await page.keyboard.press('Escape');
    await page.locator('#scanBtn').click();
    await page.locator('[data-port-history="23"]').waitFor({ state: 'attached' });
    assert(await page.locator('#neighborList').evaluate(e => e.scrollHeight > e.clientHeight && getComputedStyle(e).overflowY === 'auto'));
    await fit('capture desktop with 24 records');
    await shot('capture-desktop');
    await accessible('capture');
    await page.locator('[data-port-history="0"]').click();
    assert.equal(await page.locator('.port-side-by-side .port-list-panel').count(), 2, 'Previous and current shown together');
    assert.equal(await page.locator('.value-changed').count(), 2, 'Both VLAN values highlighted');
    const panels = await page.locator('.port-list-panel').evaluateAll(nodes => nodes.map(n => ({ x:n.getBoundingClientRect().x, y:n.getBoundingClientRect().y })));
    assert(panels[0].x < panels[1].x && Math.abs(panels[0].y-panels[1].y)<1, 'Comparison panels are side by side');
    await shot('comparison-desktop');
    await accessible('side by side comparison');
    await page.locator('#closeComparisonBtn').click();
    const help = page.locator('#speedTestPanel .info-tip').first();
    await help.hover();
    await page.locator('#contextHelp:visible').waitFor();
    await page.keyboard.press('Escape');
    assert(await page.locator('#contextHelp').isHidden());
    await help.focus();
    await page.locator('#contextHelp:visible').waitFor();
    console.log('PASS hover, keyboard help and Escape');
    await page.locator('#history-tab').click();
    await page.locator('.timeline-group').first().waitFor();
    await fit('history desktop');
    await shot('history-desktop');
    await accessible('evidence history');
    await page.locator('#settings-tab').click();
    await page.locator('#openAccountDialogBtn').click();
    await fit('approve account dialog');
    await shot('approve-account');
    await page.locator('#cancelAccountDialogBtn').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'accountInput', 'Dialog focus wraps');
    await accessible('account dialog');
    await page.locator('#cancelAccountDialogBtn').click();
    await page.locator('#openAdminPasswordDialogBtn').click();
    await fit('password dialog');
    await shot('password');
    await page.locator('#cancelAdminPasswordDialogBtn').click();
    for (const tab of ['accounts', 'general', 'reviews', 'inventory', 'technical']) {
      await page.locator(`#${tab}-tab`).click();
      if (tab === 'inventory') {
        assert(await page.locator('.inventory-card').count() > 0, 'Inventory renders loaded evidence');
        await page.locator('#inventorySearch').fill('missing-switch');
        assert.equal(await page.locator('.inventory-card').count(), 0);
        await page.locator('#inventorySearch').fill('192.0.2.10');
        assert.equal(await page.locator('.inventory-card').count(), 1);
        await page.locator('#inventorySearch').fill('');
        await page.locator('.inventory-card summary').click();
        assert.equal(await page.locator('.inventory-review-list [data-inventory-report]').count(), 24);
        await page.locator('.inventory-card summary').click();
      }
      await fit(`${tab} desktop`);
      await shot(`${tab}-desktop`);
      await accessible(tab);
    }
    for (const [width, height] of [[1280,800], [768,1024], [390,844], [720,500]]) {
      await page.setViewportSize({ width, height });
      for (const tab of ['capture', 'history', 'settings']) {
        await page.locator(`#${tab}-tab`).click();
        if (tab === 'settings') await page.locator('#inventory-tab').click();
        await fit(`${tab} ${width}x${height}`);
        if (width === 390 && tab === 'history') {
          await page.locator('#historyFiltersToggle').click();
          await page.locator('#historyFilters:visible').waitFor();
          await fit('expanded mobile filters');
        }
        await shot(`${tab}-${width}`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await fit('200 percent CSS zoom');
    await shot('zoom-200');
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    await page.locator('#capture-tab').click();
    driver = false;
    await page.route('**/api/adapters', route => route.fulfill({ json: [{ id: 'demo-wired', name: 'DEMO Ethernet', description: 'DEMO Ethernet', operationalStatus: 'Up', captureAvailable: false, ipAddresses: [] }] }));
    await page.locator('#refreshBtn').click();
    await page.locator('#npcapDialog:visible').waitFor();
    await shot('driver-dialog');
    await fit('driver dialog');
    admin = false; approved = false;
    await page.goto(base);
    await page.locator('#windowsSignInBtn:not(:disabled)').waitFor();
    await page.locator('#windowsSignInBtn').click();
    await page.locator('#accessDeniedScreen:visible').waitFor();
    await shot('access-denied');
    approved = true; driver = true;
    await page.goto(base);
    await page.locator('#windowsSignInBtn:not(:disabled)').waitFor();
    await page.locator('#windowsSignInBtn').click();
    assert(await page.locator('#settings-tab').isHidden(), 'Non-admin settings hidden');
    for (const route of ['privacy', 'terms']) {
      await page.goto(`${base}/${route}`);
      await fit(route);
      await shot(route);
    }
    assert.deepEqual(errors, [], 'JavaScript errors');
    assert.deepEqual(unknown, [], 'Unhandled fixture requests');
    console.log('PASS isolated light-theme suite; no live API or NAS access');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
