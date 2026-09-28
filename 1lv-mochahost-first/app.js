const fs = require("fs");
const path = require("path");

const appRoot = __dirname;
const currentFile = path.join(appRoot, "CURRENT");

if (!fs.existsSync(currentFile)) {
  console.error("CURRENT file does not exist.");
  process.exit(1);
}

const release = fs.readFileSync(currentFile, "utf8").trim();

if (!release) {
  console.error("CURRENT release is empty.");
  process.exit(1);
}

const serverFile = path.join(
  appRoot,
  "releases",
  release,
  "server.cjs"
);

if (!fs.existsSync(serverFile)) {
  console.error(`server.cjs not found for release: ${release}`);
  process.exit(1);
}

console.log(`Starting 1lv.ca release: ${release}`);

require(serverFile);