import assert from "node:assert/strict";
import { parseCsvRecords } from "../src/lib/csv-parser.ts";

assert.deepEqual(
  parseCsvRecords("title,description\nBottle,\"Large, steel bottle\"\n"),
  [
    ["title", "description"],
    ["Bottle", "Large, steel bottle"],
  ],
);

assert.deepEqual(
  parseCsvRecords('title,description\r\n\"Say \"\"Hi\"\"\" ,\"Line 1\nLine 2\"\r\n'),
  [
    ["title", "description"],
    ['Say "Hi" ', "Line 1\nLine 2"],
  ],
);

assert.deepEqual(
  parseCsvRecords("\uFEFFtitle,price\nWidget,12.50"),
  [
    ["title", "price"],
    ["Widget", "12.50"],
  ],
);

assert.throws(
  () => parseCsvRecords('title,description\nWidget,\"broken'),
  /Unclosed quoted CSV field/,
);

console.log("CSV parser regression tests: PASS");
