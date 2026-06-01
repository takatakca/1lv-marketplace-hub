import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getMyVendor } from "@/services/vendors";
import { createProduct } from "@/services/products";
import { DataTable } from "@/components/DataTable";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

const REQUIRED_COLS = ["title", "price", "inventory_quantity"];
const ALL_COLS = [...REQUIRED_COLS, "short_description", "description", "category_slug", "sku", "supplier_source", "supplier_url", "supplier_product_id"];

const SAMPLE = `title,price,inventory_quantity,category_slug,sku,supplier_source,supplier_url,supplier_product_id
Wireless Headphones,89.99,25,electronics,SKU-001,AliExpress,https://aliexpress.com/item/123,123
Stainless Bottle 750ml,24.50,80,home,SKU-002,CJDropshipping,https://cjdrop.com/item/456,456`;

type Row = Record<string, string>;
type ParseResult = { rows: Row[]; headers: string[]; missing: string[]; errors: string[] };

function parseCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { rows: [], headers: [], missing: REQUIRED_COLS, errors: ["Empty file"] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const missing = REQUIRED_COLS.filter((c) => !headers.includes(c));
  const errors: string[] = [];
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const row: Row = {};
    headers.forEach((h, j) => (row[h] = cells[j] ?? ""));
    if (!row.title) errors.push(`Row ${i}: missing title`);
    if (isNaN(Number(row.price))) errors.push(`Row ${i}: invalid price`);
    rows.push(row);
  }
  return { rows, headers, missing, errors };
}

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const text = await f.text(); setParsed(parseCsv(text));
  };

  const runImport = async () => {
    if (!parsed) return;
    if (demo) { toast.success(`Imported ${parsed.rows.length} drafts (demo)`); setParsed(null); return; }
    if (parsed.missing.length) { toast.error("Missing required columns"); return; }
    const v = await getMyVendor(user!.id);
    if (!v) { toast.error("Complete onboarding first"); return; }
    setImporting(true);
    let ok = 0, fail = 0;
    for (const r of parsed.rows) {
      try {
        await createProduct(v.id, {
          title: r.title,
          short_description: r.short_description || null,
          description: r.description || null,
          category_slug: r.category_slug || null,
          price: Number(r.price) || 0,
          compare_at_price: null, cost: null,
          sku: r.sku || null,
          inventory_quantity: Number(r.inventory_quantity) || 0,
          track_inventory: true,
          supplier_source: r.supplier_source || null,
          supplier_url: r.supplier_url || null,
          supplier_product_id: r.supplier_product_id || null,
          status: "draft",
        });
        ok++;
      } catch { fail++; }
    }
    setImporting(false);
    toast[fail ? "error" : "success"](`Imported ${ok} drafts${fail ? `, ${fail} failed` : ""}`);
    setParsed(null);
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "1lv-products-sample.csv"; a.click();
  };

  return (
    <div>
      <div className="mb-6">
        {demo ? <DemoBanner label="Preview mode" /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Product imports</h1>
        <p className="mt-1 text-sm text-muted-foreground">Bulk-import draft products from CSV</p>
      </div>
      {demo && <PreviewModeNotice />}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-bold text-navy">Upload CSV</h3>
          <p className="mt-1 text-xs text-muted-foreground">Imported as <strong>drafts</strong>. Submit for review after.</p>
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="mt-3 block w-full text-sm" />
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <button onClick={downloadSample} className="rounded-md border border-border px-3 py-1.5 font-semibold">Download sample CSV</button>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-bold text-navy">Required columns</h3>
          <ul className="mt-2 text-xs text-muted-foreground">
            <li><strong>Required:</strong> {REQUIRED_COLS.join(", ")}</li>
            <li className="mt-1"><strong>Optional:</strong> {ALL_COLS.filter((c) => !REQUIRED_COLS.includes(c)).join(", ")}</li>
          </ul>
          <pre className="mt-3 overflow-x-auto rounded-md bg-muted/40 p-3 text-[11px]">{SAMPLE}</pre>
        </div>
      </div>

      {parsed && (
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold text-navy">Preview — {parsed.rows.length} row(s)</h3>
            <button onClick={runImport} disabled={importing || parsed.missing.length > 0}
              className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-electric-foreground disabled:opacity-50">
              {importing ? "Importing…" : `Import ${parsed.rows.length} as drafts`}
            </button>
          </div>
          {parsed.missing.length > 0 && (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              Missing required columns: {parsed.missing.join(", ")}
            </div>
          )}
          {parsed.errors.length > 0 && (
            <div className="mb-3 rounded-md border border-deal/40 bg-deal/5 p-3 text-xs text-deal-foreground">
              <strong>{parsed.errors.length} warning(s):</strong>
              <ul className="mt-1 list-disc pl-5">{parsed.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
          <DataTable
            columns={parsed.headers.slice(0, 6).map((h) => ({ key: h, label: h }))}
            rows={parsed.rows.slice(0, 20).map((r, i) => ({ id: i, ...r }))}
          />
        </div>
      )}
    </div>
  );
}
export const Route = createFileRoute("/vendor/imports")({ component: Page });
