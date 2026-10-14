/**
 * Fail closed if an added migration changes get_1lv_schema_version without
 * updating runtime and deployment prerequisites in the same commit.
 * Deliberately uses Node built-ins so it can run before npm install.
 */
import { readFileSync, readdirSync } from "node:fs";

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
const migrations = readdirSync(new URL("../supabase/migrations/", import.meta.url))
  .filter((filename) => /^\d{14}_.+\.sql$/.test(filename))
  .sort();

if (migrations.length === 0) {
  throw new Error("No versioned Supabase migrations found.");
}

const latest = migrations.at(-1);
const version = latest.slice(0, 14);
const sql = read(`supabase/migrations/${latest}`);
if (!sql.includes(`SELECT '${version}'`)) {
  throw new Error(`Latest migration ${latest} does not expose matching get_1lv_schema_version().`);
}

const required = [
  ["src/routes/api/public/health.ts", `const EXPECTED_SCHEMA_VERSION = "${version}"`],
  [".github/workflows/deploy.yml", `EXPECTED_SCHEMA_VERSION: "${version}"`],
  [".github/workflows/migrate-production-db.yml", `EXPECTED_SCHEMA_VERSION: "${version}"`],
];

for (const [file, marker] of required) {
  if (!read(file).includes(marker)) {
    throw new Error(`Schema version guard failed in ${file}: expected ${version}.`);
  }
}

console.log(`1LV schema version ${version} matches latest migration, health and release workflows.`);
