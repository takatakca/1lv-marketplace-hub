const http = require("http");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { URL, pathToFileURL } = require("url");

const CLIENT_DIR = path.join(__dirname, "dist", "client");
const SERVER_ENTRY = path.join(__dirname, "dist", "server", "server.js");

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

function requestUrl(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProto || "http";
  const host = forwardedHost || req.headers.host || "localhost";
  return `${protocol}://${host}${req.url || "/"}`;
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
