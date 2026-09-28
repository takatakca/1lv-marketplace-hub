/*
 * 1lv.ca - MochaHost / cPanel Node.js startup file
 *
 * The project is built LOCALLY with Nitro's node-server preset.
 * The production server is generated at: ./dist/server/index.mjs
 *
 * This wrapper:
 *   1) loads .env from the application root without requiring dotenv,
 *   2) keeps cPanel/Passenger's PORT if it provides one,
 *   3) starts the already-built Nitro/TanStack server.
 */

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

function loadLocalEnv() {
  const envFile = path.join(__dirname, ".env");
  if (!fs.existsSync(envFile)) return;

  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equals = line.indexOf("=");
    if (equals <= 0) continue;

    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
if (!process.env.HOST) process.env.HOST = "0.0.0.0";
if (!process.env.PORT) process.env.PORT = "3000";

const entry = path.join(__dirname, "dist", "server", "index.mjs");

if (!fs.existsSync(entry)) {
  console.error("[1lv.ca] Missing production server: " + entry);
  console.error("[1lv.ca] Build locally with: npm run build");
  process.exit(1);
}

console.log("[1lv.ca] Starting pre-built production server...");
console.log("[1lv.ca] NODE_ENV=" + process.env.NODE_ENV + " PORT=" + process.env.PORT);

import(pathToFileURL(entry).href).catch((error) => {
  console.error("[1lv.ca] Failed to start production server:", error);
  process.exit(1);
});
