import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PromotionInput = {
  code: string;
  name: string;
  description?: string | null;
  discountType: "percent" | "fixed" | "free_shipping";
  discountValue: number;
  maxDiscount?: number | null;
  minOrder: number;
  active: boolean;
  publiclyListed: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  globalUsageLimit?: number | null;
  perCustomerLimit?: number | null;
  firstOrderOnly: boolean;
};

async function adminDb(context: {
  supabase: SupabaseClient<Database>;
  userId: string;
}) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || data !== true) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function normalize(input: PromotionInput) {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new Error("Promotion code must be 3–32 characters.");
  if (name.length < 2 || name.length > 120) throw new Error("Promotion name must be 2–120 characters.");
  if (input.discountType === "percent" && (input.discountValue <= 0 || input.discountValue > 100)) throw new Error("Percent discount must be between 0 and 100.");
  if (input.discountType === "fixed" && input.discountValue <= 0) throw new Error("Fixed discount must be greater than 0.");
  if (input.discountType === "free_shipping" && input.discountValue !== 0) throw new Error("Free shipping value must be 0.");
  if (input.minOrder < 0) throw new Error("Minimum order cannot be negative.");
  if (input.maxDiscount != null && input.maxDiscount <= 0) throw new Error("Maximum discount must be positive.");
  if (input.globalUsageLimit != null && input.globalUsageLimit < 1) throw new Error("Usage limit must be positive.");
  if (input.perCustomerLimit != null && input.perCustomerLimit < 1) throw new Error("Customer limit must be positive.");
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) throw new Error("Promotion end must be after its start.");
  return {
    code,
    name,
    description: input.description?.trim() || null,
    discount_type: input.discountType,
    discount_value: input.discountType === "free_shipping" ? 0 : input.discountValue,
    max_discount: input.maxDiscount ?? null,
    min_order: input.minOrder,
    active: input.active,
    publicly_listed: input.publiclyListed,
    starts_at: input.startsAt || null,
    ends_at: input.endsAt || null,
    global_usage_limit: input.globalUsageLimit ?? null,
    per_customer_limit: input.perCustomerLimit ?? null,
    first_order_only: input.firstOrderOnly,
  };
}

export const listAdminPromotions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb(context);
    const { data, error } = await db.from("promotions" as never).select("*, promotion_redemptions(id,status)").order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createPromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: PromotionInput) => data)
  .handler(async ({ data, context }) => {
    const db = await adminDb(context);
    const { data: created, error } = await db.from("promotions" as never).insert({ ...normalize(data), created_by: context.userId } as never).select("id, code").single();
    if (error) {
      if (error.code === "23505") throw new Error("Promotion code already exists.");
      throw new Error(error.message);
    }
    return created;
  });

export const setPromotionActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { promotionId: string; active: boolean }) => data)
  .handler(async ({ data, context }) => {
    const db = await adminDb(context);
    if (!/^[0-9a-f-]{36}$/i.test(data.promotionId)) throw new Error("Invalid promotion.");
    const { error } = await db.from("promotions" as never).update({ active: data.active } as never).eq("id", data.promotionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
