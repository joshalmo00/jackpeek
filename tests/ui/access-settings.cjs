// Real embedded UI with isolated API fixtures. No changes to workstation accounts or passwords.
const { chromium } = require("playwright-core");
const AxeBuilder = require("@axe-core/playwright").default;
const assert = require("node:assert/strict");
const base = process.env.JACKPEEK_TEST_URL || "http://127.0.0.1:52523";
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1256, height: 912 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const visible = async (id) => {
    await page.locator("#" + id).waitFor({ state: "visible" });
  };
  const screenshot = async (name) =>
    page.screenshot({ path: `.ui-test/${name}.png`, fullPage: true });
  const layout = async () =>
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "No horizontal page overflow",
    );
  const axe = async () => {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
    );
  };
  try {
    await page.goto(base);
    await visible("signInScreen");
    assert(!(await page.locator(".topbar").isVisible()));
    await page.locator("#windowsSignInBtn:not(:disabled)").waitFor();
    await screenshot("secure-access-desktop");
    await axe();
    const fixture = await (
      await page.request.get(base + "/api/session")
    ).json();
    fixture.settings = {
      localHistoryPath: "C:\\JackPeek\\Evidence",
      archiveMirrorPath: "",
      localCachePath: "C:\\JackPeek\\Cache",
      storageMode: "local-nas-mirror",
      allowNasMirror: true,
      allowSettingsEdit: true,
      includeWindowsUser: true,
      maxCaptureDurationSeconds: 120,
      evidenceRetentionDays: 0,
      cacheExpirationHours: 24,
      nasSyncIntervalMinutes: 60,
      adminManagedCacheEncryption: true,
    };
    fixture.license = { isValid: false, state: "Not installed" };
    fixture.admin = { isConfigured: true, isUnlocked: false };
    fixture.access = {
      isApproved: false,
      account: "OTHER\\unapproved",
      requiresProfile: false,
      displayName: null,
      message: "This Windows account is not approved.",
    };
    let accounts = [
      {
        account: "SBHCS\\joalvarez",
        enabled: true,
        firstName: null,
        lastName: null,
        displayName: null,
      },
    ];
    let savedSettings = 0;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const input =
        route.request().method() === "POST"
          ? route.request().postDataJSON()
          : null;
      let body = {},
        status = 200;
      if (path === "/api/session") body = fixture;
      else if (path === "/api/access/login") body = fixture.access;
      else if (path === "/api/access/profile") {
        assert.equal(input.firstName, "Joshua");
        assert.equal(input.lastName, "Alvarez");
        fixture.access.requiresProfile = false;
        fixture.access.displayName = "Joshua Alvarez";
        accounts[0] = {
          ...accounts[0],
          firstName: "Joshua",
          lastName: "Alvarez",
          displayName: "Joshua Alvarez",
        };
      } else if (path === "/api/admin/unlock") {
        if (input.password !== "Fixture-only-password") {
          status = 401;
          body = { error: "Incorrect administrator password." };
        } else {
          fixture.admin.isUnlocked = true;
          body = { unlocked: true, token: "fixture-session" };
        }
      } else if (path === "/api/admin/password")
        fixture.admin.isConfigured = true;
      else if (path === "/api/admin/accounts") {
        if (input) {
          const current = accounts.find((a) => a.account === input.account);
          if (current) current.enabled = input.enabled;
          else accounts.push({ ...input, displayName: null });
        }
        body = accounts;
      } else if (path === "/api/evidence/settings") {
        savedSettings++;
        fixture.settings = { ...fixture.settings, ...input };
        body = fixture.settings;
      } else if (
        path === "/api/adapters" ||
        path === "/api/reports" ||
        path === "/api/ports/log" ||
        path === "/api/evidence/cache"
      )
        body = [];
      else if (path === "/api/access/logout") fixture.admin.isUnlocked = false;
      else throw new Error("Unexpected API: " + path);
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    await page.reload();
    await page.locator("#windowsSignInBtn").click();
    await visible("accessDeniedScreen");
    await axe();
    await page.locator("#accessDeniedScreen [data-open-admin]").click();
    await visible("adminLoginDialog");
    await page.locator("#adminPortalPasswordInput").fill("incorrect-password");
    await page.locator("#adminPortalSubmitBtn").click();
    await page
      .locator("#adminPortalStatus")
      .filter({ hasText: "Incorrect" })
      .waitFor();
    assert(!(await page.locator("#adminWorkspace").isVisible()));
    await page.locator("#adminPortalCancelBtn").click();
    await visible("signInScreen");
    await page.locator("#administratorSignInBtn").click();
    await screenshot("administrator-access-desktop");
    await axe();
    await page
      .locator("#adminPortalPasswordInput")
      .fill("Fixture-only-password");
    await page.locator("#adminPortalSubmitBtn").click();
    await visible("accounts-panel");
    await page.locator("#accountRows tr").waitFor();
    assert(
      !(await page.locator("#settingsForm").isVisible()),
      "General settings cannot leak into Account Manager",
    );
    assert.equal(await page.locator("[data-admin-tab]").count(), 2);
    await screenshot("account-manager-desktop");
    await layout();
    await axe();
    await page.locator("#accountInput").fill("SBHCS\\fixture-user");
    await page.locator("#approveAccountBtn").click();
    await page
      .locator("#accountRows")
      .filter({ hasText: "fixture-user" })
      .waitFor();
    await page.locator("#accountSearch").fill("fixture-user");
    assert.equal(await page.locator("#accountRows tr").count(), 1);
    await page.locator("#accountRows button").click();
    await page
      .locator("#accountRows .badge")
      .filter({ hasText: "Disabled" })
      .waitFor();
    await page.locator("#accountSearch").fill("");
    await page.locator("#general-tab").click();
    await visible("settingsForm");
    assert(!(await page.locator("#accountForm").isVisible()));
    await screenshot("general-settings-desktop");
    await axe();
    await layout();
    await page.locator('[data-setting-section="2"]').click();
    await page.locator("#maxCaptureDurationInput").fill("90");
    await page.locator("#saveSettingsBtn").click();
    await page
      .locator("#settingsStatus")
      .filter({ hasText: "Settings saved" })
      .waitFor();
    assert.equal(savedSettings, 1);
    assert.equal(fixture.settings.maxCaptureDurationSeconds, 90);
    await page.locator("#capture-tab").click();
    for (let i = 0; i < 6; i++) await page.locator("#brandLogo").click();
    assert(
      await page.locator(".topbar").isVisible(),
      "First six logo clicks preserve header",
    );
    await page.locator("#brandLogo").click();
    await visible("adminLoginDialog");
    await page.locator("#adminPortalCancelBtn").click();
    assert(await page.locator(".topbar").isVisible(), "Cancel restores header");
    console.log(
      "PASS startup, denied-account recovery, admin validation, account controls, settings separation/save, seven-click recovery",
    );

    fixture.admin.isUnlocked = false;
    fixture.access = {
      isApproved: true,
      account: "SBHCS\\joalvarez",
      requiresProfile: true,
      displayName: null,
    };
    await page.reload();
    await page.locator("#windowsSignInBtn").click();
    await visible("profileScreen");
    await screenshot("first-login-name");
    await axe();
    await page.locator("#firstNameInput").fill("Joshua");
    await page.locator("#lastNameInput").fill("Alvarez");
    await page.locator("#profileSubmitBtn").click();
    await page.locator(".topbar").waitFor();
    await page.reload();
    await visible("signInScreen");
    await page.locator("#windowsSignInBtn").click();
    await page.locator(".topbar").waitFor();
    assert(
      !(await page.locator("#profileScreen").isVisible()),
      "Returning user skips name registration",
    );
    await page.locator("#settings-tab").click();
    await visible("settingsLocked");
    console.log(
      "PASS first-login names, returning-user flow, regular-user settings protection",
    );

    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.reload();
      await visible("signInScreen");
      await layout();
      await screenshot("secure-access-" + width);
      await page.locator("#administratorSignInBtn").click();
      await page
        .locator("#adminPortalPasswordInput")
        .fill("Fixture-only-password");
      await page.locator("#adminPortalSubmitBtn").click();
      await visible("accounts-panel");
      await layout();
      await axe();
      await screenshot("account-manager-" + width);
      await page.locator("#general-tab").click();
      await layout();
      await axe();
      await screenshot("general-settings-" + width);
    }
    fixture.admin = { isConfigured: false, isUnlocked: false };
    await page.reload();
    await page.locator("#administratorSignInBtn").click();
    await visible("adminConfirmInput");
    await page
      .locator("#adminPortalPasswordInput")
      .fill("Fixture-only-password");
    await page.locator("#adminConfirmInput").fill("Fixture-only-password");
    await page.locator("#adminPortalSubmitBtn").click();
    await visible("accounts-panel");
    assert.deepEqual(errors, []);
    console.log(
      "PASS responsive layouts, WCAG checks, initial administrator setup, no JavaScript errors",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
