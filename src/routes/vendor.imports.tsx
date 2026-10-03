import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getMyVendor } from "@/services/vendors";
import { DataTable } from "@/components/DataTable";
import { isDemoMode } from "@/lib/demo-mode";
import { parseCsvRecords } from "@/lib/csv-parser";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";
import {
  createImportJob,
  finalizeImportJob,
  importDraftProductRow,
  insertJobRow,
  listImportJobs,
  type ImportJob,
} from "@/services/imports";

const REQUIRED_COLS = ["title", "price", "inventory_quantity"];
const ALL_COLS = [
  ...REQUIRED_COLS,
  "short_description",
  "description",
  "category_slug",
  "sku",
  "supplier_source",
  "supplier_url",
  "supplier_product_id",
];

const SAMPLE = `title,price,inventory_quantity,category_slug,sku,supplier_source,supplier_url,supplier_product_id
Wireless Headphones,89.99,25,electronics,SKU-001,AliExpress,https://aliexpress.com/item/123,123
Stainless Bottle 750ml,24.50,80,home,SKU-002,CJDropshipping,https://cjdrop.com/item/456,456`;

type Row = Record<string, string>;
type RowIssue = { index: number; errors: string[] };
type ParseResult = {
  rows: Row[];
  headers: string[];
  missing: string[];
  rowIssues: RowIssue[];
};

function validateRow(r: Row): string[] {
  const errs: string[] = [];
  if (!r.title) errs.push("missing title");

  if (!/^[0-9]{1,8}(?:\.[0-9]{1,2})?$/.test(r.price ?? "")) {
    errs.push("invalid price");
  }

  if (!/^[0-9]{1,10}$/.test(r.inventory_quantity ?? "")) {
    errs.push("invalid inventory");
  } else if (Number(r.inventory_quantity) > 2_147_483_647) {
    errs.push("inventory out of range");
  }

  return errs;
}

function parseCsv(text: string): ParseResult {
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    return { rows: [], headers: [], missing: REQUIRED_COLS, rowIssues: [] };
  }

  const headers = (records[0] ?? []).map((h) => h.trim());
  const duplicateHeaders = headers.filter(
    (header, index) => header && headers.indexOf(header) !== index,
  );
  if (duplicateHeaders.length > 0) {
    throw new Error(
      `Duplicate CSV column(s): ${Array.from(new Set(duplicateHeaders)).join(", ")}`,
    );
  }

  const missing = REQUIRED_COLS.filter((c) => !headers.includes(c));
  const rowIssues: RowIssue[] = [];
  const rows: Row[] = [];

  for (let i = 1; i < records.length; i++) {
    const cells = records[i] ?? [];
    const row: Row = {};
    headers.forEach((h, j) => {
      if (h) row[h] = (cells[j] ?? "").trim();
    });

    const errs = validateRow(row);
    if (cells.length > headers.length) {
      errs.push("too many columns");
    }
    if (errs.length) rowIssues.push({ index: i, errors: errs });
    rows.push(row);
  }

  return { rows, headers, missing, rowIssues };
}

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [jobs, setJobs] = useState<ImportJob[]>([]);

  useEffect(() => {
    if (demo) return;
    listImportJobs(20).then(setJobs).catch(() => setJobs([]));
  }, [demo, importing]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      const text = await f.text();
      const next = parseCsv(text);
      setFilename(f.name);
      setParsed(next);
    } catch (error) {
      setFilename(null);
      setParsed(null);
      e.target.value = "";
      toast.error(
        error instanceof Error ? error.message : "Could not parse CSV file",
      );
    }
  };

  const runImport = async () => {
    if (!parsed) return;
    if (parsed.missing.length) {
      toast.error("Missing required columns");
      return;
    }
    if (demo) {
      toast.success(`Imported ${parsed.rows.length} drafts (demo)`);
      setParsed(null);
      setFilename(null);
      return;
    }
    const v = await getMyVendor(user!.id);
    if (!v) {
      toast.error("Complete onboarding first");
      return;
    }
    setImporting(true);

    const badIdx = new Set(parsed.rowIssues.map((r) => r.index));
    const validRows = parsed.rows
      .map((row, index) => ({ row, rowIndex: index + 1 }))
      .filter(({ rowIndex }) => !badIdx.has(rowIndex));

    let job: ImportJob | null = null;
    try {
      job = await createImportJob({
        vendor_id: v.id,
        owner_id: user!.id,
        provider_type: "csv",
        source_filename: filename,
        total_rows: parsed.rows.length,
      });
    } catch (e) {
      toast.error("Could not create import job: " + (e as Error).message);
      setImporting(false);
      return;
    }

    let ok = 0;
    let fail = parsed.rowIssues.length;

    // Log invalid rows with their original CSV row index.
    for (const issue of parsed.rowIssues) {
      try {
        await insertJobRow({
          job_id: job.id,
          row_index: issue.index,
          row_status: "failed",
          raw: parsed.rows[issue.index - 1] ?? {},
          errors: issue.errors,
        });
      } catch (auditError) {
        console.error(
          "[1lv.ca] Could not persist invalid import-row audit:",
          auditError instanceof Error ? auditError.message : auditError,
        );
      }
    }

    for (const { row: r, rowIndex } of validRows) {
      try {
        await importDraftProductRow({
          jobId: job.id,
          rowIndex,
          raw: r,
          product: {
            title: r.title,
            short_description: r.short_description || null,
            description: r.description || null,
            category_slug: r.category_slug || null,
            price: Number(r.price),
            sku: r.sku || null,
            inventory_quantity: Number(r.inventory_quantity),
            supplier_source: r.supplier_source || null,
            supplier_url: r.supplier_url || null,
            supplier_product_id: r.supplier_product_id || null,
          },
        });

        ok++;
      } catch (e) {
        fail++;
        try {
          await insertJobRow({
            job_id: job.id,
            row_index: rowIndex,
            row_status: "failed",
            raw: r,
            errors: [(e as Error).message],
          });
        } catch (auditError) {
          console.error(
            "[1lv.ca] Could not persist failed import-row audit:",
            auditError instanceof Error ? auditError.message : auditError,
          );
        }
      }
    }

    await finalizeImportJob(job.id, {
      status: fail === 0 ? "completed" : ok === 0 ? "failed" : "partial",
      success_rows: ok,
      failed_rows: fail,
    }).catch(() => {});

    setImporting(false);
    setParsed(null);
    setFilename(null);
    toast[fail ? "error" : "success"](
      `Imported ${ok} draft${ok === 1 ? "" : "s"}${fail ? `, ${fail} failed` : ""}`,
    );
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "1lv-products-sample.csv";
    a.click();
  };

  const validCount = parsed ? parsed.rows.length - parsed.rowIssues.length : 0;

  return (
    <div>
      <div className="mb-6">
        {demo ? <DemoBanner label="Preview mode" /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Product imports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import products as drafts. Only admin approval activates them.
        </p>
      </div>
      {demo && <PreviewModeNotice />}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-bold text-navy">Upload CSV</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Imported as <strong>drafts</strong>. Submit for review after.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="mt-3 block w-full text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <button
              onClick={downloadSample}
              className="rounded-md border border-border px-3 py-1.5 font-semibold"
            >
              Download sample CSV
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-bold text-navy">Required columns</h3>
          <ul className="mt-2 text-xs text-muted-foreground">
            <li>
              <strong>Required:</strong> {REQUIRED_COLS.join(", ")}
            </li>
            <li className="mt-1">
              <strong>Optional:</strong>{" "}
              {ALL_COLS.filter((c) => !REQUIRED_COLS.includes(c)).join(", ")}
            </li>
          </ul>
          <pre className="mt-3 overflow-x-auto rounded-md bg-muted/40 p-3 text-[11px]">
            {SAMPLE}
          </pre>
        </div>
      </div>

      {parsed && (
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold text-navy">
              Preview — {parsed.rows.length} row(s) · {validCount} valid ·{" "}
              {parsed.rowIssues.length} invalid
            </h3>
            <button
              onClick={runImport}
              disabled={importing || parsed.missing.length > 0 || validCount === 0}
              className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-electric-foreground disabled:opacity-50"
            >
              {importing ? "Importing…" : `Import ${validCount} as drafts`}
            </button>
          </div>
          {parsed.missing.length > 0 && (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              Missing required columns: {parsed.missing.join(", ")}
            </div>
          )}
          {parsed.rowIssues.length > 0 && (
            <div className="mb-3 rounded-md border border-deal/40 bg-deal/5 p-3 text-xs text-deal-foreground">
              <strong>{parsed.rowIssues.length} row(s) with errors:</strong>
              <ul className="mt-1 list-disc pl-5">
                {parsed.rowIssues.slice(0, 8).map((e) => (
                  <li key={e.index}>
                    Row {e.index}: {e.errors.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DataTable
            columns={parsed.headers.slice(0, 6).map((h) => ({ key: h, label: h }))}
            rows={parsed.rows.slice(0, 20).map((r, i) => ({ id: i, ...r }))}
          />
        </div>
      )}

      {!demo && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-navy">Import history</h2>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <DataTable
              columns={[
                { key: "created_at", label: "Date", render: (r) => new Date(r.created_at as string).toLocaleString() },
                { key: "source_filename", label: "File" },
                { key: "provider_type", label: "Source" },
                { key: "total_rows", label: "Rows" },
                { key: "success_rows", label: "OK" },
                { key: "failed_rows", label: "Failed" },
                {
                  key: "status",
                  label: "Status",
                  render: (r) => {
                    const s = r.status as string;
                    const cls =
                      s === "completed"
                        ? "bg-success/10 text-success"
                        : s === "failed"
                          ? "bg-destructive/10 text-destructive"
                          : s === "partial"
                            ? "bg-deal/10 text-deal"
                            : "bg-muted text-muted-foreground";
                    return (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
                        {s}
                      </span>
                    );
                  },
                },
              ]}
              rows={jobs as unknown as Record<string, unknown>[]}
            />
          )}
        </div>
      )}
    </div>
  );
}
export const Route = createFileRoute("/vendor/imports")({ component: Page });
