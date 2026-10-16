import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const modelSource = readFileSync(new URL("../src/lib/cart-model.ts", import.meta.url),"utf8");
const jsModel=ts.transpileModule(modelSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const modelUrl="data:text/javascript;base64,"+Buffer.from(jsModel).toString("base64");
const helperSource=readFileSync(new URL("../src/lib/cart-merge-intent.ts", import.meta.url),"utf8")
  .replace('from "@/lib/cart-model"', `from "${modelUrl}"`);
const js=ts.transpileModule(helperSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const m=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const user="88888888-8888-4888-8888-888888888888",key="99999999-9999-4999-8999-999999999999";
const product="77777777-7777-4777-8777-777777777777";
const item={lineId:product,productId:product,slug:"hat",title:"Hat",vendorSlug:"shop",image:"",price:40,qty:2};
const original=m.makeGuestMergeAttempt(user,[item],key);
assert.deepEqual(m.parseGuestMergeAttempt(JSON.parse(JSON.stringify(original))),original);
assert.equal(m.mergePayload(original)[0].quantity,2);
assert.equal(m.parseGuestMergeAttempt({...original,accountId:"another-user"}),null);
assert.equal(m.parseGuestMergeAttempt({...original,mergeId:"not-a-uuid"}),null);
assert.equal(m.parseGuestMergeAttempt({...original,lines:[{...original.lines[0],qty:200}]}),null);
assert.equal(m.parseGuestMergeAttempt({...original,lines:[original.lines[0],original.lines[0]]}),null);
assert.deepEqual(m.remainingGuestLines([{...item,qty:4}],original),[{...item,qty:2}],
  "Later guest additions remain after the original attempt is acknowledged");
assert.deepEqual(m.remainingGuestLines([item],original),[],
  "Original guest intention is consumed after successful RPC");
assert.equal(m.makeGuestMergeAttempt(user,[],key).lines.length,0);
console.log("PASS: idempotent guest merge journal, account guard and quantity reconciliation");
