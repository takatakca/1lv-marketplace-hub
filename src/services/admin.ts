import { supabase } from "@/integrations/supabase/client";

// ---------------- Categories ----------------

export async function listCategoriesAdmin() {
  const { data, error } = await supabase.from("categories").select("*").order("position");
  if (error) throw error;
  return data ?? [];
}

export async function upsertCategory(input: {
  slug: string;
  name_en: string;
  name_fr?: string | null;
  parent_slug?: string | null;
  active?: boolean;
  position?: number;
}) {
  const { error } = await supabase.from("categories").upsert(input, { onConflict: "slug" });
  if (error) throw error;
}

export async function deleteCategory(slug: string) {
  const { error } = await supabase.from("categories").delete().eq("slug", slug);
  if (error) throw error;
}

// ---------------- Overview ----------------

export type AdminOverview = {
  gmv: number;
  orderCount: number;
  pendingVendors: number;
  activeVendors: number;
  pendingProducts: number;
  activeProducts: number;
  unpaidVendors: number;
  commissionRevenue: number;
  payoutLiability: number;
  openDisputes: number;
  hasData: boolean;
  recentOrders: Array<{
    order: string;
    customer: string;
    total: number;
    status: string;
    createdAt: string;
    vendor: string;
  }>;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc("get_admin_marketplace_overview" as never);
  if (error) throw error;

  const raw = (data ?? {}) as unknown as Record<string, unknown>;
  const recentRaw = Array.isArray(raw.recentOrders) ? raw.recentOrders : [];

  return {
    gmv: Number(raw.gmv ?? 0),
    orderCount: Number(raw.orderCount ?? 0),
    pendingVendors: Number(raw.pendingVendors ?? 0),
    activeVendors: Number(raw.activeVendors ?? 0),
    pendingProducts: Number(raw.pendingProducts ?? 0),
    activeProducts: Number(raw.activeProducts ?? 0),
    unpaidVendors: Number(raw.unpaidVendors ?? 0),
    commissionRevenue: Number(raw.commissionRevenue ?? 0),
    payoutLiability: Number(raw.payoutLiability ?? 0),
    openDisputes: Number(raw.openDisputes ?? 0),
    hasData: raw.hasData === true,
    recentOrders: recentRaw.map((value) => {
      const order = value as Record<string, unknown>;
      return {
        order: String(order.order ?? ""),
        customer: String(order.customer ?? "—"),
        vendor: String(order.vendor ?? "Marketplace"),
        total: Number(order.total ?? 0),
        status: String(order.status ?? ""),
        createdAt: String(order.createdAt ?? ""),
      };
    }),
  };
}
