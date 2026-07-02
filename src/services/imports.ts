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
    .insert({ ...input, settings: input.settings ?? {}, status: "setup_required" })
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

export async function finalizeImportJob(
  id: string,
  patch: { status: JobStatus; success_rows: number; failed_rows: number; errors?: unknown },
) {
  const { error } = await supabase.from("product_import_jobs").update(patch).eq("id", id);
  if (error) throw error;
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
    ...input,
    errors: input.errors ?? [],
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
