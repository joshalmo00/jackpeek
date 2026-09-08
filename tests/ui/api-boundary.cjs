// Read-only and rejected-request integration checks against a running local app.
const assert = require("node:assert/strict");
const base = process.env.JACKPEEK_TEST_URL || "http://127.0.0.1:52522";
(async () => {
  const response = await fetch(base + "/");
  assert.equal(response.status, 200);
  assert.equal((await fetch(base + "/api/ports/log")).status, 200);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert(
    response.headers
      .get("content-security-policy")
      .includes("script-src 'self'"),
  );
  for (const headers of [
    { Origin: "https://example.invalid" },
    { Origin: "null" },
    { Origin: "http://127.0.0.1:1" },
    { "Sec-Fetch-Site": "cross-site" },
  ]) {
    assert.equal(
      (await fetch(base + "/api/adapters", { headers })).status,
      403,
    );
  }
  // fetch normalizes Host; use a native HTTP request to exercise DNS rebinding.
  const hostStatus = await new Promise((resolve, reject) => {
    require("node:http")
      .get(
        base + "/api/adapters",
        { headers: { Host: "rebinding.invalid" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      )
      .on("error", reject);
  });
  assert.equal(hostStatus, 403);
  assert.equal(
    (
      await fetch(base + "/api/scans", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      })
    ).status,
    415,
  );
  const invalid = await fetch(base + "/api/scans", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({
      adapterId: "not-a-physical-nic",
      durationSeconds: 5,
    }),
  });
  assert.equal(invalid.status, 400);
  assert((await invalid.json()).error.includes("physical wired Ethernet"));
  console.log(
    "PASS live server security headers, origin/host boundaries, content type, and adapter rejection",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
