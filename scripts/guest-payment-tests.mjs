import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const js = ts.transpileModule(readFileSync(resolve("src/services/guest-payment.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  saveGuestPaymentContext,
  getGuestPaymentContext,
  clearGuestPaymentToken,
  clearGuestPaymentContext,
} = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

const values = new Map();
globalThis.window = {
  sessionStorage: {
    setItem(key, value) { values.set(key, value); },
    getItem(key) { return values.get(key) ?? null; },
    removeItem(key) { values.delete(key); },
  },
};
const context = {
  orderId: "22222222-2222-4222-8222-222222222222",
  orderNumber: "1LV-TEST-ORDER",
  checkoutKey: "44444444-4444-4444-8444-444444444444",
  token: "signed-short-lived-payment-token",
  createdAt: "2026-10-14T00:00:00.000Z",
};
assert.equal(getGuestPaymentContext(context.orderNumber), null);
saveGuestPaymentContext(context);
assert.deepEqual(getGuestPaymentContext(context.orderNumber), context);
assert.equal(getGuestPaymentContext("DIFFERENT-ORDER"), null);
clearGuestPaymentToken(context.orderNumber);
assert.deepEqual(getGuestPaymentContext(context.orderNumber), { ...context, token: null },
  "Payment capability is discarded but guest receipt lookup still works");
clearGuestPaymentToken(context.orderNumber);
assert.equal(getGuestPaymentContext(context.orderNumber)?.checkoutKey, context.checkoutKey);
values.set("1lv_guest_payment:BAD", JSON.stringify({ ...context, orderNumber: "OTHER" }));
assert.equal(getGuestPaymentContext("BAD"), null, "Never accept mismatched order context");
clearGuestPaymentContext(context.orderNumber);
assert.equal(getGuestPaymentContext(context.orderNumber), null);
delete globalThis.window;
assert.equal(getGuestPaymentContext(context.orderNumber), null);
console.log("PASS: guest order lookup retention, capability cleanup and isolation");
