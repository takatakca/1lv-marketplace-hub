const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const CLIENT_DIR = path.join(__dirname, "dist", "client");
const INDEX_FILE = path.join(CLIENT_DIR, "index.html");

if (!fs.existsSync(INDEX_FILE)) {
  console.error("[1lv.ca] FATAL: index.html not found:");
  console.error(INDEX_FILE);
  process.exit(1);
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
  ".txt": "text/plain; charset=utf-8"
};

function sendFile(filePath, req, res) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();

    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": stat.size
    };

    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      headers["Cache-Control"] =
        "public, max-age=31536000, immutable";
    } else {
      headers["Cache-Control"] = "no-cache";
    }

    res.writeHead(200, headers);

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      "Content-Type": "text/plain; charset=utf-8",
      "Allow": "GET, HEAD"
    });
    res.end("Method Not Allowed");
    return;
  }

  let pathname;

  try {
    pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname
    );
  } catch {
    res.writeHead(400, {
      "Content-Type": "text/plain; charset=utf-8"
    });
    res.end("Bad Request");
    return;
  }

  const relativePath = pathname.replace(/^\/+/, "");
  const clientRoot = path.resolve(CLIENT_DIR);
  const requested = path.resolve(CLIENT_DIR, relativePath);

  if (
    requested !== clientRoot &&
    !requested.startsWith(clientRoot + path.sep)
  ) {
    res.writeHead(403, {
      "Content-Type": "text/plain; charset=utf-8"
    });
    res.end("Forbidden");
    return;
  }

  fs.stat(requested, (err, stat) => {
    if (!err && stat.isFile()) {
      sendFile(requested, req, res);
      return;
    }

    sendFile(INDEX_FILE, req, res);
  });
});

const PORT = Number(process.env.PORT || 3000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[1lv.ca] Running on port ${PORT}`);
  console.log(`[1lv.ca] Serving ${CLIENT_DIR}`);
});