import assert from "node:assert/strict";
import { resolveTrustedAppOrigin } from "../src/lib/request-origin.server.ts";

const keys = ["PUBLIC_APP_ORIGIN", "GITHUB_ACTIONS", "NODE_ENV"];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

function restore() {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

try {
  delete process.env.PUBLIC_APP_ORIGIN;
  delete process.env.GITHUB_ACTIONS;
  process.env.NODE_ENV = "production";

  assert.equal(
    resolveTrustedAppOrigin("https://evil.example/vendor/subscription"),
    "https://1lv.ca",
    "production requests must ignore an injected host",
  );

  process.env.PUBLIC_APP_ORIGIN = "https://www.1lv.ca";
  assert.equal(
    resolveTrustedAppOrigin("https://evil.example/vendor/payouts"),
    "https://www.1lv.ca",
    "explicit canonical HTTPS origin must win over the request host",
  );

  delete process.env.PUBLIC_APP_ORIGIN;
  process.env.GITHUB_ACTIONS = "true";
  delete process.env.NODE_ENV;
  assert.equal(
    resolveTrustedAppOrigin("http://127.0.0.1:4178/vendor/subscription"),
    "http://127.0.0.1:4178",
    "GitHub Actions local smoke tests must retain the loopback origin",
  );

  delete process.env.GITHUB_ACTIONS;
  process.env.NODE_ENV = "production";
  assert.equal(
    resolveTrustedAppOrigin("http://127.0.0.1:4178/vendor/subscription"),
    "https://1lv.ca",
    "production must not accept a loopback Host header",
  );

  process.env.PUBLIC_APP_ORIGIN = "http://1lv.ca";
  assert.throws(
    () => resolveTrustedAppOrigin("https://1lv.ca/vendor/subscription"),
    /must be an HTTPS origin/,
    "non-HTTPS configured origins must fail closed",
  );

  process.env.PUBLIC_APP_ORIGIN = "https://1lv.ca/unsafe";
  assert.throws(
    () => resolveTrustedAppOrigin("https://1lv.ca/vendor/subscription"),
    /must be an HTTPS origin/,
    "configured origins with paths must fail closed",
  );

  console.log("Trusted request origin tests: PASS");
} finally {
  restore();
}
