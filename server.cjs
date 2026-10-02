const http = require("http");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { URL, pathToFileURL } = require("url");

const CLIENT_DIR = path.join(__dirname, "dist", "client");
const SERVER_ENTRY = path.join(__dirname, "dist", "server", "server.js");
const CURRENT_RELEASE_FILE = path.join(__dirname, "CURRENT");

// Production deploys atomically update CURRENT before asking Passenger to
// restart. Export that exact release SHA into the TanStack runtime so the
// public health endpoint can prove the newly activated process is running.
if (!process.env.RELEASE_REVISION && fs.existsSync(CURRENT_RELEASE_FILE)) {
  try {
    const revision = fs.readFileSync(CURRENT_RELEASE_FILE, "utf8").trim();
    if (/^[0-9a-f]{40}$/i.test(revision)) {
      process.env.RELEASE_REVISION = revision.toLowerCase();
    } else if (revision) {
      console.error("[1lv.ca] CURRENT contains an invalid release revision.");
    }
  } catch (error) {
    console.error("[1lv.ca] Could not read CURRENT release revision:", error);
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

for (const required of [CLIENT_DIR, SERVER_ENTRY]) {
  if (!fs.existsSync(required)) {
    console.error("[1lv.ca] FATAL: production build is incomplete:", required);
    process.exit(1);
  }
}

let serverEntryPromise;

function getServerEntry() {
  if (!serverEntryPromise) {
    serverEntryPromise = import(pathToFileURL(SERVER_ENTRY).href).then((module) => {
      const entry = module.default ?? module;
      if (!entry || typeof entry.fetch !== "function") {
        throw new Error("TanStack server bundle does not export a fetch handler.");
      }
      return entry;
    });
  }
  return serverEntryPromise;
}

const DEFAULT_PUBLIC_ORIGIN = "https://1lv.ca";
const ALLOW_LOCAL_ORIGIN =
  process.env.GITHUB_ACTIONS === "true" ||
  process.env.NODE_ENV === "development" ||
  process.env.NODE_ENV === "test";

function configuredPublicOrigin() {
  const raw = String(
    process.env.PUBLIC_APP_ORIGIN || DEFAULT_PUBLIC_ORIGIN,
  ).trim();

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("[1lv.ca] PUBLIC_APP_ORIGIN is not a valid URL.");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "[1lv.ca] PUBLIC_APP_ORIGIN must be a clean HTTPS origin.",
    );
  }

  return parsed.origin;
}

const PUBLIC_ORIGIN = configuredPublicOrigin();

function requestUrl(req) {
  let pathAndQuery = "/";
  try {
    const parsedPath = new URL(req.url || "/", "http://localhost");
    pathAndQuery = `${parsedPath.pathname}${parsedPath.search}`;
  } catch {
    pathAndQuery = "/";
  }

  if (ALLOW_LOCAL_ORIGIN) {
    const directHost = String(req.headers.host || "").split(",")[0].trim();
    try {
      const candidate = new URL(`http://${directHost}`);
      const hostname = candidate.hostname.toLowerCase();
      const loopback =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname === "[::1]";

      if (loopback) {
        return `http://${candidate.host}${pathAndQuery}`;
      }
    } catch {
      // Fall through to the canonical production origin.
    }
  }

  return `${PUBLIC_ORIGIN}${pathAndQuery}`;
}

function toWebRequest(req) {
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, String(value));
    }
  }

  const method = req.method || "GET";
  const hasBody = method !== "GET" && method !== "HEAD";

  return new Request(requestUrl(req), {
    method,
    headers,
    ...(hasBody
      ? {
          body: Readable.toWeb(req),
          duplex: "half",
        }
      : {}),
  });
}

const PRIVATE_ROUTE_PREFIXES = [
  "/account",
  "/admin",
  "/checkout",
  "/login",
  "/order-confirmation",
  "/orders",
  "/signup",
  "/vendor",
  "/wishlist",
];

function requestRequiresNoStore(req) {
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return true;
  if (req.headers.authorization || req.headers.cookie) return true;

  let pathname = "/";
  try {
    pathname = new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    return true;
  }

  return PRIVATE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

function writeWebResponse(req, response, res) {
  res.statusCode = response.status;
  res.statusMessage = response.statusText || res.statusMessage;

  const getSetCookie = response.headers.getSetCookie;
  const setCookies =
    typeof getSetCookie === "function"
      ? getSetCookie.call(response.headers)
      : [];

  response.headers.forEach((value, name) => {
    if (name.toLowerCase() !== "set-cookie") {
      res.setHeader(name, value);
    }
  });

  if (setCookies.length > 0) {
    res.setHeader("Set-Cookie", setCookies);
  }

  if (requestRequiresNoStore(req) || setCookies.length > 0) {
    res.setHeader("Cache-Control", "no-store");
  }

  if (req.method === "HEAD" || !response.body) {
    res.end();
    return;
  }

  const body = Readable.fromWeb(response.body);
  body.on("error", (error) => {
    console.error("[1lv.ca] Response stream failed:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal Server Error");
    } else {
      res.destroy(error);
    }
  });
  body.pipe(res);
}

function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Origin-Agent-Cluster", "?1");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000",
  );
}

async function tryServeStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
    return true;
  }

  if (pathname.endsWith("/")) return false;

  const clientRoot = path.resolve(CLIENT_DIR);
  const relativePath = pathname.replace(/^\/+/, "");
  const requested = path.resolve(CLIENT_DIR, relativePath);

  if (requested !== clientRoot && !requested.startsWith(clientRoot + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return true;
  }

  let stat;
  try {
    stat = await fs.promises.stat(requested);
  } catch {
    return false;
  }

  if (!stat.isFile()) return false;

  const ext = path.extname(requested).toLowerCase();
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": requested.includes(`${path.sep}assets${path.sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  };

  res.writeHead(200, headers);
  if (req.method === "HEAD") {
    res.end();
    return true;
  }

  fs.createReadStream(requested)
    .on("error", (error) => {
      console.error("[1lv.ca] Static file stream failed:", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      } else {
        res.destroy(error);
      }
    })
    .pipe(res);

  return true;
}

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);
  try {
    if (await tryServeStatic(req, res)) return;

    const entry = await getServerEntry();
    const response = await entry.fetch(toWebRequest(req));
    writeWebResponse(req, response, res);
  } catch (error) {
    console.error("[1lv.ca] Request failed:", error);
    if (!res.headersSent) {
      res.writeHead(500, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end("Internal Server Error");
    } else {
      res.destroy(error instanceof Error ? error : undefined);
    }
  }
});

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`[1lv.ca] TanStack server listening on ${HOST}:${PORT}`);
  console.log(`[1lv.ca] Static assets: ${CLIENT_DIR}`);
  console.log(`[1lv.ca] Server entry: ${SERVER_ENTRY}`);
});
