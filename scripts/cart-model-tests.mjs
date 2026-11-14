import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

// Run the actual production cart model without bundler, browser or database.
// Typescript is already a repository dev dependency; no new packages needed.
const source = readFileSync(resolve("src/lib/cart-model.ts"), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const model = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const {
  CART_LIMIT, cartLineId, restoreCartItems, applyCartChange, normalizeCartVariant,
  isLiveProductId,
} = model;

const product = "a867c8a4-58f5-42ae-8627-2380eb88cc6a";
const item = {
  productId: product, lineId: product, slug: "boots", title: "Work Boots",
  price: 125, image: "/boot.png", vendorSlug: "vendor", qty: 2,
};
assert.equal(isLiveProductId(product), true);
assert.equal(isLiveProductId("DEMO-BOOT"), false);
assert.equal(cartLineId(product, { Size: "XL", Colour: "Black" }),
  cartLineId(product, { Colour: "Black", Size: "XL" }));
assert.deepEqual(normalizeCartVariant({ Size: " XL " }), { Size: "XL" });

const restored = restoreCartItems([
  { ...item, lineId: "attacker-controlled" },
  { ...item, qty: 200 },
  { ...item, price: -50 },
  { ...item, qty: Number.POSITIVE_INFINITY },
  { ...item, title: null },
]);
assert.equal(restored.length, 1);
assert.equal(restored[0].lineId, product, "Do not trust stored line identifiers");
assert.equal(restored[0].qty, 99, "Duplicate quantities are bounded");
assert.deepEqual(restoreCartItems({ malformed: true }), []);
assert.ok(restoreCartItems(Array.from({ length: 200 }, (_, index) =>
  ({ ...item, productId: String(index), lineId: String(index) }))).length <= CART_LIMIT);

let items = [];
items = applyCartChange(items, { kind: "add", item });
items = applyCartChange(items, { kind: "add", item: { ...item, qty: 3 } });
assert.equal(items.length, 1);
assert.equal(items[0].qty, 5);
items = applyCartChange(items, { kind: "set", lineId: product, qty: 3 });
assert.equal(items[0].qty, 3);
items = applyCartChange(items, { kind: "remove", lineId: product });
assert.deepEqual(items, []);
items = applyCartChange([item], { kind: "clear" });
assert.deepEqual(items, []);
const limited = applyCartChange([{ ...item, maxQty: 3 }], {
  kind: "add", item: { ...item, qty: 20 },
});
assert.equal(limited[0].qty, 3, "Available stock is a local UI bound; backend still validates it");
console.log("PASS: 1LV cart hydration, identity, quantity and mutation regressions");
