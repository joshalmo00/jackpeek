// Render the shipped markup/CSS in isolation. No sign-in, capture or Internet traffic.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('src/NetworkPortAnalyzer.Web/wwwroot');
const output = path.resolve('.ui-test/button-colors');
const base = 'http://127.0.0.1:49998';

function contrast(foreground, background) {
  const luminance = color => {
    const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.JACKPEEK_BROWSER || 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 720, height: 1000 }, reducedMotion: 'reduce' });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      assert.equal(url.origin, base, 'No external requests');
      if (url.pathname.endsWith('.js')) return route.fulfill({ contentType: 'text/javascript', body: '' });
      const file = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
      const type = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)];
      return route.fulfill({ contentType: type || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await page.goto(base);
    await page.evaluate(() => {
      document.querySelector('#detectedAccount').textContent = 'DEMO\\reviewer';
      document.querySelector('#signInStatus').textContent = '';
    });
    async function check(selector, state, expectedBackground) {
      const result = await page.locator(selector).evaluate(button => {
        const style = getComputedStyle(button);
        const opacity = [];
        for (let node = button; node; node = node.parentElement) opacity.push(getComputedStyle(node).opacity);
        return {
          background: style.backgroundColor, color: style.color, opacity,
          children: [...button.querySelectorAll('strong, small, svg')].map(node => ({
            tag: node.tagName, color: getComputedStyle(node).color
          }))
        };
      });
      assert.equal(result.background, expectedBackground, `${selector} ${state} background`);
      assert(result.opacity.every(value => Number(value) === 1), `${selector} ${state} must not fade text`);
      for (const item of [{ tag: 'button', color: result.color }, ...result.children]) {
        assert(contrast(item.color, result.background) >= 4.5, `${selector} ${state} ${item.tag}: insufficient contrast`);
      }
      console.log(`PASS ${selector} ${state} including nested text/icons`);
    }
    const login = page.locator('#windowsSignInBtn');
    const admin = page.locator('#administratorSignInBtn');
    for (const selector of ['#windowsSignInBtn', '#administratorSignInBtn']) {
      await check(selector, 'disabled', 'rgb(237, 240, 244)');
    }
    await page.screenshot({ path: path.join(output, 'disabled.png'), fullPage: true });
    await page.locator('.signin-option').evaluateAll(nodes => nodes.forEach(node => { node.disabled = false; }));
    await check('#windowsSignInBtn', 'normal', 'rgb(0, 103, 206)');
    await check('#administratorSignInBtn', 'normal', 'rgb(255, 255, 255)');
    await page.screenshot({ path: path.join(output, 'login.png'), fullPage: true });
    await login.hover();
    await check('#windowsSignInBtn', 'hover', 'rgb(0, 87, 177)');
    await page.mouse.down();
    await check('#windowsSignInBtn', 'pressed', 'rgb(0, 78, 158)');
    await page.mouse.up();
    await page.mouse.move(0, 0);
    await admin.focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'windowsSignInBtn');
    assert.equal(await login.evaluate(node => getComputedStyle(node).outlineStyle), 'solid');
    await check('#windowsSignInBtn', 'keyboard focus', 'rgb(0, 103, 206)');
    await admin.hover();
    await check('#administratorSignInBtn', 'hover', 'rgb(237, 245, 255)');
    await page.mouse.move(0, 0);
    await login.evaluate(node => { node.disabled = true; node.setAttribute('aria-busy', 'true'); });
    await check('#windowsSignInBtn', 'busy disabled', 'rgb(237, 240, 244)');
    await login.evaluate(node => { node.disabled = false; node.removeAttribute('aria-busy'); });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, 'login-mobile.png'), fullPage: true });

    // Shared action-button states, including inherited fieldset disabling.
    await page.evaluate(() => {
      const fixture = document.createElement('fieldset');
      fixture.id = 'buttonColorFixture';
      fixture.style.padding = '24px';
      fixture.innerHTML = '<button id="testPrimary" class="button primary">Save</button> <button id="testSecondary" class="button secondary">Cancel</button> <button id="testDanger" class="button danger">Delete</button>';
      document.body.prepend(fixture);
    });
    await check('#testPrimary', 'normal', 'rgb(0, 103, 206)');
    await page.locator('#testPrimary').hover();
    await check('#testPrimary', 'hover', 'rgb(0, 87, 177)');
    await check('#testSecondary', 'normal', 'rgb(255, 255, 255)');
    await page.locator('#testSecondary').hover();
    await check('#testSecondary', 'hover', 'rgb(240, 243, 247)');
    await check('#testDanger', 'normal', 'rgb(255, 240, 241)');
    await page.locator('#testDanger').hover();
    await check('#testDanger', 'hover', 'rgb(255, 227, 230)');
    await page.locator('#buttonColorFixture').evaluate(node => { node.disabled = true; });
    for (const selector of ['#testPrimary', '#testSecondary', '#testDanger']) {
      await check(selector, 'disabled fieldset', 'rgb(237, 240, 244)');
    }
    console.log('PASS button colors: all tested states meet 4.5:1 contrast');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
