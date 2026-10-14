import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
const source = readFileSync(resolve("src/lib/payment-status.ts"), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { getPaymentPresentation } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const cases = [
  ["demo",true,false,true,"paid",false,false,false,/Demo/],
  ["loading",false,true,true,"paid",false,false,false,/Checking/],
  ["unverified",false,false,false,"paid",false,false,true,/unavailable/],
  ["paid",false,false,true,"paid",true,false,false,/received/],
  ["pending",false,false,true,"pending",false,true,true,/pending/],
  ["failed",false,false,true,"failed",false,true,true,/failed/],
  ["refunded",false,false,true,"refunded",false,false,false,/refunded/],
  ["expired",false,false,true,"expired",false,false,false,/no longer payable/],
  ["cancelled",false,false,true,"cancelled",false,false,false,/no longer payable/],
  ["unknown",false,false,true,"processing",false,false,true,/requires verification/],
  ["empty",false,false,true,null,false,false,true,/requires verification/],
];
for (const [name,demo,loading,orderFound,paymentStatus,paid,retry,poll,heading] of cases) {
  const v=getPaymentPresentation({demo,loading,orderFound,paymentStatus});
  assert.equal(v.verifiedPaid,paid,name);
  assert.equal(v.canRetry,retry,name);
  assert.equal(v.shouldPoll,poll,name);
  assert.match(v.heading,heading,name);
}
console.log("PASS: 11 payment status presentation cases");
