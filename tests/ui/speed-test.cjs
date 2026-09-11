// Deterministic measurement tests. These never connect to the internet.
const test = require('node:test');
const assert = require('node:assert/strict');
const SpeedTest = require('../../src/NetworkPortAnalyzer.Web/wwwroot/speed-test.js');

function fixture(options = {}) {
  let now = 0, latencyIndex = -1;
  const calls = [], updates = [];
  const fetch = async (address, request) => {
    const url = new URL(address);
    calls.push({ url, request });
    assert.equal(url.origin, 'https://speed.cloudflare.com');
    assert.equal(request.credentials, 'omit');
    assert.equal(request.referrerPolicy, 'no-referrer');
    assert.equal(request.cache, 'no-store');
    assert.equal(request.redirect, 'error');
    request.signal.throwIfAborted();
    if (options.fail?.(url, request)) throw new TypeError('Failed to fetch');
    const trace = url.pathname === '/cdn-cgi/trace';
    const bytes = Number(url.searchParams.get('bytes'));
    const emptyDownload = url.pathname === '/__down' && bytes === 0;
    const duration = emptyDownload ? [10, 20, 30, 20, 10, 20][Math.max(0, latencyIndex++) % 6] : 10;
    now += duration;
    const content = trace ? new TextEncoder().encode('ip=192.0.2.10\ncolo=EWR\n')
      : request.body ? new TextEncoder().encode('ok')
        : new Uint8Array(options.truncate ? Math.max(0, bytes - 1) : bytes);
    let read = false;
    return { ok: true, status: 200, body: { getReader: () => ({
      async read() {
        request.signal.throwIfAborted();
        if (read) return { done: true };
        read = true;
        now += (request.body?.byteLength || bytes) / 10000;
        return { done: false, value: content };
      }, async cancel() {},
    }) } };
  };
  const engine = new SpeedTest({ fetch, now: () => now, random: (bytes) => bytes.fill(37),
    onUpdate: (value) => { updates.push(value); options.update?.(value, engine); } });
  return { engine, calls, updates };
}

test('real transfers produce download, upload, HTTPS ping, jitter, and edge with bounded payloads', async () => {
  const { engine, calls, updates } = fixture();
  const result = await engine.run();
  assert.equal(result.phase, 'complete');
  assert.equal(result.running, false);
  assert.equal(result.progress, 100);
  assert.equal(result.ping, 20);
  assert.equal(result.jitter, 10);
  assert.equal(result.edge, 'EWR');
  assert.ok(result.download > 70 && result.download < 80);
  assert.ok(result.upload > 70 && result.upload < 80);
  assert.ok(result.payloadBytes <= 39500000);
  assert.ok(calls.every(({url,request}) => Number(url.searchParams.get('bytes')) <= 4000000 && (request.body?.byteLength || 0) <= 4000000));
  assert.equal(result.samples.length, 12);
  assert.ok(result.samples.some((sample) => sample.direction === 'download'));
  assert.ok(result.samples.some((sample) => sample.direction === 'upload'));
  assert.ok(updates.every((update, i) => !i || update.progress >= updates[i - 1].progress));
  const uploads = calls.filter((call) => call.request.method === 'POST');
  assert.ok(uploads.length >= 1);
  assert.ok(uploads.every(({ request }) => request.body[0] === 37 && request.body.at(-1) === 37));
  assert.ok(calls.every(({ url }) => ['/cdn-cgi/trace', '/__down', '/__up'].includes(url.pathname)));
  assert.equal(JSON.stringify(result).includes('192.0.2.10'), false, 'trace client IP is discarded');
});

test('unavailable optional edge lookup does not prevent measurements', async () => {
  const { engine } = fixture({ fail: (url) => url.pathname === '/cdn-cgi/trace' });
  const result = await engine.run();
  assert.equal(result.phase, 'complete');
  assert.equal(result.edge, null);
});

test('truncated downloads are rejected, never reported as valid throughput', async () => {
  const { engine } = fixture({ truncate: true });
  const result = await engine.run();
  assert.equal(result.phase, 'error');
  assert.equal(result.download, null);
  assert.ok(result.upload > 0, 'A malformed download does not prevent an independent upload measurement');
  assert.match(result.detail, /incomplete/);
});

test('blocked upload retains completed download and latency, with missing upload distinct from zero', async () => {
  const { engine } = fixture({ fail: (url) => url.pathname === '/__up' });
  const result = await engine.run();
  assert.equal(result.phase, 'error');
  assert.ok(result.download > 0);
  assert.ok(result.ping > 0);
  assert.equal(result.upload, null);
  assert.match(result.detail, /Cloudflare failed or was blocked/);
  assert.ok(result.progress < 100);
});

test('cancel aborts in-flight requests and duplicate runs do not issue extra requests', async () => {
  let calls = 0;
  const engine = new SpeedTest({ fetch: (_, { signal }) => new Promise((resolve, reject) => {
    calls++;
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) });
  const running = engine.run();
  assert.equal(await engine.run(), null);
  engine.cancel();
  const result = await running;
  assert.equal(calls, 1);
  assert.equal(result.phase, 'cancelled');
  assert.equal(result.download, null);
  assert.equal(result.ping, null);
  assert.equal(result.running, false);
});

test('request timeout ends with a clear error and does not turn missing measurements into zero', async () => {
  const engine = new SpeedTest({ requestTimeout: 5, runTimeout: 1000,
    fetch: (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
  const result = await engine.run();
  assert.equal(result.phase, 'error');
  assert.match(result.detail, /timed out/);
  assert.equal(result.upload, null);
});

test('whole-run time limit aborts a hanging request', async () => {
  const engine = new SpeedTest({ requestTimeout: 1000, runTimeout: 5,
    fetch: (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
  const result = await engine.run();
  assert.equal(result.phase, 'error');
  assert.match(result.detail, /timed out/);
  assert.equal(engine.controller, null);
});

test('a rerun resets earlier results before measuring', async () => {
  const { engine, updates } = fixture();
  await engine.run();
  const split = updates.length;
  await engine.run();
  assert.equal(updates[split].phase, 'latency');
  assert.equal(updates[split].download, null);
  assert.equal(updates[split].upload, null);
  assert.equal(updates[split].ping, null);
  assert.equal(updates[split].progress, 0);
});
