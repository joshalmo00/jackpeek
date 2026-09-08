// Run against a locally running JackPeek instance. Mutating APIs are mocked.
// Requires Playwright on NODE_PATH or installed in the development environment.
const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.JACKPEEK_TEST_URL || "http://127.0.0.1:52521";
const output = path.resolve(".ui-test");
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const remoteRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith(base)) remoteRequests.push(request.url());
  });
  const check = async (name, action) => {
    await action();
    console.log(`PASS ${name}`);
  };
  const expectText = async (selector, text) => {
    await page.locator(selector).filter({ hasText: text }).waitFor();
  };
  try {
    await check("embedded HTML, legal pages, and binary logo", async () => {
      for (const route of ["/", "/privacy", "/terms"]) {
        const response = await page.goto(base + route);
        assert.equal(response.status(), 200);
        await page.locator("h1:visible").waitFor();
        assert(
          await page
            .locator(".brand img")
            .evaluate((img) => img.complete && img.naturalWidth > 0),
        );
        const ids = await page
          .locator("[id]")
          .evaluateAll((elements) => elements.map((e) => e.id));
        assert.equal(
          new Set(ids).size,
          ids.length,
          `Duplicate IDs at ${route}`,
        );
        assert(
          !/\u2014/.test(await page.locator("body").innerText()),
          `Em dash at ${route}`,
        );
      }
      const logo = await page.request.get(base + "/assets/port-checker.png");
      assert.equal(logo.headers()["content-type"], "image/png");
      assert(
        (await logo.body()).equals(
          fs.readFileSync(
            "src/NetworkPortAnalyzer.Web/wwwroot/assets/port-checker.png",
          ),
        ),
      );
      await page.goto(base);
      await page.waitForFunction(
        () =>
          !document.querySelector("#status").textContent.includes("Loading"),
      );
      await page.screenshot({
        path: path.join(output, "capture-actual-desktop.png"),
        fullPage: true,
      });
    });

    let adapters = [];
    let settings = {
      secureMode: true,
      includeWindowsUser: true,
      localHistoryPath: "C:\\JackPeekTest\\Evidence",
      archiveMirrorPath: "",
      maxCaptureDurationSeconds: 120,
      allowSettingsEdit: true,
      requireValidLicense: false,
      requireEvidenceEncryption: false,
      evidenceRetentionDays: 0,
      allowEvidenceDeletion: true,
      allowNasMirror: true,
      allowedExportFormats: ["json", "html", "package"],
    };
    const license = {
      isValid: false,
      state: "Not installed",
      detail: "Not installed",
    };
    const packet = {
      deviceName: "TEST FIXTURE: Access switch 01",
      chassisId: "00:11:22:33:44:55",
      portId: "Gi1/0/24",
      portDescription: "Workstation outlet",
      nativeVlan: 20,
      voiceVlan: 40,
      managementAddress: "192.0.2.10",
      duplex: "Full",
      ttlSeconds: 120,
      capabilities: ["Bridge"],
      details: [{ name: "System name", value: "<img src=x onerror=alert(1)>" }],
      unknownTlvs: [{ type: "127", value: "00 AB CD" }],
    };
    const scan = {
      scanId: "fixture1",
      adapterId: "wired1",
      framesCaptured: 2,
      startedAt: "2026-09-05T12:00:00Z",
      completedAt: "2026-09-05T12:00:30Z",
      observations: [
        {
          protocol: "LLDP",
          framesSeen: 2,
          latest: packet,
          firstSeen: "2026-09-05T12:00:01Z",
          lastSeen: "2026-09-05T12:00:28Z",
          conflicts: ["Native VLAN changed from 10 to 20"],
        },
      ],
    };
    const report = {
      evidenceId: "fixture1",
      createdAt: scan.completedAt,
      machineName: "TEST-WORKSTATION",
      deviceName: packet.deviceName,
      switchPort: packet.portId,
      observations: 1,
      framesCaptured: 2,
      sha256: "a".repeat(64),
      scan,
      workstation: { machineName: "TEST-WORKSTATION", userName: "Test user" },
    };
    let reports = [];
    let portLog = [
      {
        entry: {
          ledgerId: "ledger1",
          scannedAt: "2026-09-05T12:00:30Z",
          switchName: "NB-TEST-1stFloor-Stack1",
          switchChassisId: "00:11:22:33:44:55",
          switchPort: "Gi1/0/13",
          protocols: ["LLDP"],
          nativeVlan: 20,
          voiceVlan: 40,
          managementIp: "192.0.2.10",
          duplex: "Full",
          capabilities: ["Bridge"],
          workstation: "TEST-WORKSTATION",
          userName: "Test user",
          domainName: "TEST",
          userSid: "S-1-5-21-fixture",
          adapterId: "wired1",
          evidenceId: "fixture1",
          scanId: "fixture1",
          hasCompleteIdentity: true,
          identityKey: "NB-TEST-1STFLOOR-STACK1|GI1/0/13",
        },
        changes: [
          { field: "Native VLAN", previous: "10", current: "20" },
          {
            field: "Management IP",
            previous: "192.0.2.9",
            current: "192.0.2.10",
          },
        ],
        changedSincePrevious: true,
      },
      {
        entry: {
          ledgerId: "ledger2",
          scannedAt: "2026-09-05T12:02:30Z",
          switchName: null,
          switchChassisId: null,
          switchPort: "Gi1/0/14",
          protocols: ["LLDP"],
          nativeVlan: 30,
          voiceVlan: null,
          managementIp: null,
          duplex: null,
          capabilities: [],
          workstation: "TEST-WORKSTATION",
          userName: "Test user",
          adapterId: "wired1",
          evidenceId: "fixture1",
          scanId: "fixture1",
          hasCompleteIdentity: false,
          identityKey: null,
        },
        changes: [],
        changedSincePrevious: false,
      },
    ];
    let failCreation = false,
      failPoll = false,
      runningPolls = 0;
    let settingsPosts = 0;
    await page.route("**/api/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      let body,
        status = 200;
      if (url.pathname === "/api/adapters") body = adapters;
      else if (url.pathname === "/api/session")
        body = {
          settings,
          license,
          workstation: {
            machineName: "TEST-WORKSTATION",
            userName: settings.includeWindowsUser ? "Test user" : null,
          },
        };
      else if (url.pathname === "/api/reports") body = reports;
      else if (url.pathname === "/api/ports/log") body = portLog;
      else if (url.pathname.endsWith("/verify")) body = { valid: true };
      else if (url.pathname === "/api/reports/fixture1") body = report;
      else if (url.pathname === "/api/evidence/settings") {
        settingsPosts++;
        settings = { ...settings, ...request.postDataJSON() };
        body = settings;
      } else if (url.pathname === "/api/license/import") {
        status = 400;
        body = { error: "License signature is invalid." };
      } else if (url.pathname === "/api/scans") {
        status = failCreation ? 402 : 202;
        body = failCreation ? null : { scanId: "fixture1" };
      } else if (url.pathname === "/api/scans/fixture1") {
        if (failPoll) {
          await route.abort();
          return;
        }
        body =
          runningPolls-- > 0
            ? { state: "running" }
            : { state: "complete", result: scan, evidence: report };
      } else throw new Error(`Unmocked API request: ${url.pathname}`);
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    await check(
      "no adapter state, accessible tabs and history empty state",
      async () => {
        await page.goto(base);
        await expectText("#status", "No wired Ethernet");
        assert(await page.locator("#scanBtn").isDisabled());
        await page.getByRole("tab", { name: "Capture", exact: true }).focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(
          await page
            .getByRole("tab", { name: "Evidence history" })
            .getAttribute("aria-selected"),
          "true",
        );
        await expectText("#reports", "No saved evidence yet");
        await page.keyboard.press("End");
        assert(await page.locator("#settings").isVisible());
        await page.screenshot({
          path: path.join(output, "settings-desktop.png"),
          fullPage: true,
        });
      },
    );
    await check("missing capture support and disconnected link", async () => {
      adapters = [
        {
          id: "wired1",
          name: "Ethernet",
          description: "TEST USB Ethernet",
          operationalStatus: "Up",
          captureAvailable: false,
          macAddress: "00:11:22:33:44:55",
          ipAddresses: ["192.0.2.20"],
        },
      ];
      await page.getByRole("tab", { name: "Capture", exact: true }).click();
      await page.locator("#refreshBtn").click();
      await expectText("#captureState", "Npcap not ready");
      await expectText("#npcapDialog", "Capture driver required");
      assert.equal(
        await page.locator("#npcapDownloadLink").getAttribute("href"),
        "https://npcap.com/#download",
      );
      await page.locator("#npcapDismissBtn").click();
      assert(await page.locator("#npcapDialog").isHidden());
      assert(await page.locator("#scanBtn").isDisabled());
      assert(await page.locator("#captureNotice a").isVisible());
      adapters[0].captureAvailable = true;
      adapters[0].operationalStatus = "Down";
      await page.locator("#refreshBtn").click();
      await expectText("#adapterLink", "Disconnected");
      assert(await page.locator("#scanBtn").isDisabled());
    });
    await check("capture HTTP errors restore controls", async () => {
      adapters[0].operationalStatus = "Up";
      await page.locator("#refreshBtn").click();
      await page.waitForFunction(
        () => !document.querySelector("#scanBtn").disabled,
      );
      failCreation = true;
      await expectText("#captureState", "Npcap ready");
      await page.locator("#scanBtn").click();
      await expectText("#status", "license policy");
      assert(await page.locator("#scanBtn").isEnabled());
      failCreation = false;
    });
    await check(
      "capture polling failure can resume without duplicate capture",
      async () => {
        failPoll = true;
        await page.locator("#scanBtn").click();
        await page.locator("#resumeScanBtn").waitFor();
        assert(await page.locator("#scanBtn").isDisabled());
        failPoll = false;
        runningPolls = 1;
        await page.locator("#resumeScanBtn").click();
        await expectText("#results", packet.deviceName);
        assert(await page.locator("#scanBtn").isEnabled());
        assert(await page.locator("#adapterSelect").isEnabled());
        await expectText("#results", "Gi1/0/24");
        await expectText("#results", "Conflicting advertisements");
        await page.locator("#results summary").click();
        await expectText("#results pre", "<img src=x onerror=alert(1)>");
        assert.equal(await page.locator("#results pre img").count(), 0);
        await page.locator("#results summary").click();
        await page.screenshot({
          path: path.join(output, "capture-results-fixture-desktop.png"),
          fullPage: true,
        });
      },
    );
    await check(
      "history filtering and inline checksum verification",
      async () => {
        reports = [report];
        await page.getByRole("tab", { name: "Evidence history" }).click();
        await page.locator("#refreshReportsBtn").click();
        await expectText("#reports", "Access switch");
        await page.locator("#reportSearch").fill("no-such-device");
        await expectText("#reports", "No matching");
        await page.locator("#reportSearch").fill("");
        await page.locator("#reports [data-report]").click();
        await page.locator("#verifyReportBtn").click();
        await expectText("#verificationStatus", "Checksum matches");
        assert.equal(await page.locator(".report-actions a").count(), 4);
        await page.screenshot({
          path: path.join(output, "history-desktop.png"),
          fullPage: true,
        });
      },
    );
    await check(
      "port log shows changes, incomplete rows, and search",
      async () => {
        await page.getByRole("tab", { name: "Port log" }).click();
        await page.locator("#refreshPortsBtn").click();
        await expectText("#portLog", "NB-TEST-1stFloor-Stack1");
        await expectText("#portLog", "Gi1/0/13");
        await expectText("#portLog", "2 changes");
        await expectText("#portLog", "Incomplete identity");
        assert.equal(await page.locator(".changed-row").count(), 1);
        await page.locator("#portLog summary").click();
        await expectText("#portLog", "192.0.2.9 to 192.0.2.10");
        await page.locator("#portSearch").fill("Gi1/0/14");
        await expectText("#portCount", "1 of 2 port records");
        await expectText("#portLog", "Incomplete identity");
        await page.locator("#portSearch").fill("");
        await page.locator("#portLog [data-report]").first().click();
        await page.getByRole("heading", { name: "Capture report" }).waitFor();
        await page.screenshot({
          path: path.join(output, "port-log-desktop.png"),
          fullPage: true,
        });
      },
    );
    await check("settings save and policy lock remain consistent", async () => {
      await page.getByRole("tab", { name: "Settings", exact: true }).click();
      await page.locator("#includeUserInput").uncheck();
      await page.locator("#maxCaptureDurationInput").fill("15");
      await page.locator("#saveSettingsBtn").click();
      await expectText("#settingsStatus", "Settings saved");
      assert.equal(settingsPosts, 1);
      assert.equal(
        await page.locator("#durationInput").getAttribute("max"),
        "15",
      );
      await expectText("#sessionUser", "not recorded");
      await page.locator("#allowSettingsEditInput").uncheck();
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator("#saveSettingsBtn").click();
      await expectText("#settingsStatus", "locked");
      assert(await page.locator("#saveSettingsBtn").isDisabled());
      assert(await page.locator("#includeUserInput").isDisabled());
      assert.deepEqual(settings.allowedExportFormats, [
        "json",
        "html",
        "package",
      ]);
    });
    await check("invalid license gets a readable error", async () => {
      await page.locator("#licenseFileInput").setInputFiles({
        name: "test.lic",
        mimeType: "application/json",
        buffer: Buffer.from("{}"),
      });
      await expectText("#licenseImportStatus", "License signature is invalid");
      assert(await page.locator("#licenseFileInput").isEnabled());
    });
    await check("narrow layouts, legal navigation, no overflow", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      for (const route of [
        "/#capture",
        "/#history",
        "/#ports",
        "/#settings",
        "/privacy",
        "/terms",
      ]) {
        await page.goto(base + route);
        await page.locator("h1:visible").waitFor();
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `Horizontal overflow at ${route}`,
        );
        assert(
          await page.evaluate(() => {
            const rootStyle = getComputedStyle(document.documentElement);
            const tableStyle = getComputedStyle(
              document.querySelector(".table-scroll") || document.body,
            );
            return (
              rootStyle.scrollbarWidth === "none" &&
              tableStyle.scrollbarWidth === "none"
            );
          }),
          `Visible scrollbar styling at ${route}`,
        );
        await page.screenshot({
          path: path.join(output, `${route.replace(/[^a-z]/g, "")}-mobile.png`),
          fullPage: true,
        });
      }
      await page.getByRole("link", { name: "Back to JackPeek" }).click();
      await page
        .getByRole("heading", { name: "Settings", exact: true })
        .waitFor();
    });
    await check(
      "WCAG A/AA accessibility checks on every workspace and legal page",
      async () => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        for (const route of [
          "/#capture",
          "/#history",
          "/#ports",
          "/#settings",
          "/privacy",
          "/terms",
        ]) {
          await page.goto(base + route);
          await page.locator("h1:visible").waitFor();
          const audit = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          assert.deepEqual(
            audit.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              nodes: v.nodes.map((n) => n.target),
            })),
            [],
            `Accessibility violations at ${route}`,
          );
        }
      },
    );
    assert.deepEqual(errors, [], "Browser runtime errors");
    assert.deepEqual(
      remoteRequests,
      [],
      "Application fetched external resources",
    );
    console.log("PASS no browser errors or external asset requests");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
