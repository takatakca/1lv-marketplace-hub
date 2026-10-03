import { supabase } from "@/integrations/supabase/client";

/**
 * SECURITY: The frontend NEVER reads or writes `credentials_encrypted`.
 * Credential storage will be handled server-side (edge function) once
 * live supplier APIs are enabled. This module only handles CSV imports
 * and job metadata visible to the vendor/admin.
 */

export type ProviderType = "csv" | "aliexpress_manual" | "cjdropshipping" | "custom_api";
export type IntegrationStatus = "setup_required" | "active" | "disabled" | "error";
export type JobStatus = "pending" | "processing" | "completed" | "failed" | "partial";
export type RowStatus = "pending" | "imported" | "failed" | "skipped";

export type SupplierIntegration = {
  id: string;
  vendor_id: string | null;
  owner_id: string;
  provider_type: ProviderType;
  provider_name: string;
  status: IntegrationStatus;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ImportJob = {
  id: string;
  vendor_id: string | null;
  owner_id: string;
  integration_id: string | null;
  provider_type: string;
  source_filename: string | null;
  file_url: string | null;
  status: JobStatus;
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  errors: unknown;
  created_at: string;
};

export type ImportJobRow = {
  id: string;
  job_id: string;
  row_index: number;
  row_status: RowStatus;
  raw: Record<string, string>;
  errors: unknown;
  product_id: string | null;
};

const SAFE_INTEGRATION_COLS =
  "id, vendor_id, owner_id, provider_type, provider_name, status, settings, created_at, updated_at";

export async function listIntegrations(): Promise<SupplierIntegration[]> {
  const { data, error } = await supabase
    .from("supplier_integrations")
    .select(SAFE_INTEGRATION_COLS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SupplierIntegration[];
}

export async function createIntegration(input: {
  vendor_id: string | null;
  owner_id: string;
  provider_type: ProviderType;
  provider_name: string;
  settings?: Record<string, unknown>;
}) {
  const { data, error } = await supabase
    .from("supplier_integrations")
    .insert({ ...input, settings: (input.settings ?? {}) as never, status: "setup_required" })
    .select(SAFE_INTEGRATION_COLS)
    .single();
  if (error) throw error;
  return data as unknown as SupplierIntegration;
}

export async function updateIntegrationStatus(id: string, status: IntegrationStatus) {
  const { error } = await supabase.from("supplier_integrations").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteIntegration(id: string) {
  const { error } = await supabase.from("supplier_integrations").delete().eq("id", id);
  if (error) throw error;
}

export async function listImportJobs(limit = 50): Promise<ImportJob[]> {
  const { data, error } = await supabase
    .from("product_import_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ImportJob[];
}

export async function createImportJob(input: {
  vendor_id: string | null;
  owner_id: string;
  provider_type: ProviderType;
  source_filename: string | null;
  total_rows: number;
}) {
  const { data, error } = await supabase
    .from("product_import_jobs")
    .insert({ ...input, status: "processing" })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as ImportJob;
}

export type FinalizeImportJobResult = {
  jobId: string;
  status: JobStatus;
  totalRows: number;
  successRows: number;
  failedRows: number;
};

export async function finalizeImportJob(
  id: string,
): Promise<FinalizeImportJobResult> {
  const { data, error } = await supabase.rpc(
    "finalize_product_import_job" as never,
    { _job_id: id } as never,
  );
  if (error) throw error;

  const result = (data ?? {}) as unknown as {
    ok?: boolean;
    job_id?: string;
    status?: JobStatus;
    total_rows?: number;
    success_rows?: number;
    failed_rows?: number;
  };

  if (
    result.ok !== true ||
    result.job_id !== id ||
    !["completed", "failed", "partial"].includes(String(result.status)) ||
    !Number.isInteger(result.total_rows) ||
    !Number.isInteger(result.success_rows) ||
    !Number.isInteger(result.failed_rows)
  ) {
    throw new Error("Import finalization returned an invalid result.");
  }

  return {
    jobId: result.job_id,
    status: result.status as JobStatus,
    totalRows: result.total_rows as number,
    successRows: result.success_rows as number,
    failedRows: result.failed_rows as number,
  };
}

export async function importDraftProductRow(input: {
  jobId: string;
  rowIndex: number;
  raw: Record<string, string>;
  product: {
    title: string;
    short_description?: string | null;
    description?: string | null;
    category_slug?: string | null;
    price: number;
    sku?: string | null;
    inventory_quantity: number;
    supplier_source?: string | null;
    supplier_url?: string | null;
    supplier_product_id?: string | null;
  };
}) {
  const { data, error } = await supabase.rpc(
    "import_product_draft_row" as never,
    {
      _job_id: input.jobId,
      _row_index: input.rowIndex,
      _raw: input.raw,
      _product: input.product,
    } as never,
  );
  if (error) throw error;

  const result = (data ?? {}) as unknown as {
    ok?: boolean;
    product_id?: string;
    row_index?: number;
  };
  if (
    result.ok !== true ||
    typeof result.product_id !== "string" ||
    result.row_index !== input.rowIndex
  ) {
    throw new Error("Atomic product import returned an invalid result.");
  }
  return {
    productId: result.product_id,
    rowIndex: result.row_index,
  };
}

export async function insertJobRow(input: {
  job_id: string;
  row_index: number;
  row_status: RowStatus;
  raw: Record<string, string>;
  errors?: unknown;
  product_id?: string | null;
}) {
  const { error } = await supabase.from("product_import_job_rows").insert({
    job_id: input.job_id,
    row_index: input.row_index,
    row_status: input.row_status,
    raw: input.raw as never,
    errors: (input.errors ?? []) as never,
    product_id: input.product_id ?? null,
  });
  if (error) throw error;
}

export async function listJobRows(jobId: string): Promise<ImportJobRow[]> {
  const { data, error } = await supabase
    .from("product_import_job_rows")
    .select("*")
    .eq("job_id", jobId)
    .order("row_index");
  if (error) throw error;
  return (data ?? []) as unknown as ImportJobRow[];
}
