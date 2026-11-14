import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VENDOR_PLANS, getVendorPlan } from "@/lib/vendor-plans";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

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

export type AdminCustomerSummary = {
  key: string;
  name: string;
  email: string;
  accountType: "registered" | "guest";
  orders: number;
  paidSpend: number;
  firstOrderAt: string;
  lastOrderAt: string;
};

export const listAdminCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCustomerSummary[]> => {
    const db = await adminDb(context);
    const { data: orders, error } = await db
      .from("orders")
      .select("customer_id, customer_email, total, payment_status, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;

    const customerIds = [
      ...new Set(
        (orders ?? [])
          .map((order) => order.customer_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const profileById = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: profiles } = await db
        .from("profiles")
        .select("id, display_name")
        .in("id", customerIds);
      for (const profile of profiles ?? []) {
        if (profile.display_name) profileById.set(profile.id, profile.display_name);
      }
    }

    const grouped = new Map<string, AdminCustomerSummary>();
    for (const order of orders ?? []) {
      const email = String(order.customer_email ?? "").trim().toLowerCase();
      if (!email) continue;
      const key = order.customer_id ? `user:${order.customer_id}` : `guest:${email}`;
      const current = grouped.get(key);
      const createdAt = order.created_at;
      if (!current) {
        grouped.set(key, {
          key,
          name: order.customer_id
            ? profileById.get(order.customer_id) ?? email
            : "Guest customer",
          email,
          accountType: order.customer_id ? "registered" : "guest",
          orders: 1,
          paidSpend: order.payment_status === "paid" ? Number(order.total ?? 0) : 0,
          firstOrderAt: createdAt,
          lastOrderAt: createdAt,
        });
      } else {
        current.orders += 1;
        if (order.payment_status === "paid") current.paidSpend += Number(order.total ?? 0);
        if (createdAt < current.firstOrderAt) current.firstOrderAt = createdAt;
        if (createdAt > current.lastOrderAt) current.lastOrderAt = createdAt;
      }
    }

    return [...grouped.values()].sort(
      (a, b) => new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime(),
    );
  });

export type AdminCommissionSummary = {
  defaultRate: number;
  revenue30d: number;
  totalRevenue: number;
  activeVendors: number;
  vendors: Array<{
    id: string;
    storeName: string;
    plan: string;
    rate: number;
    status: string;
    commission30d: number;
    totalCommission: number;
  }>;
};

export const getAdminCommissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCommissionSummary> => {
    const db = await adminDb(context);
    const [vendorsRes, splitsRes, settingsRes] = await Promise.all([
      db
        .from("vendors")
        .select("id, store_name, subscription_plan, commission_rate, status")
        .order("store_name"),
      db
        .from("vendor_orders" as never)
        .select("vendor_id, commission_amount, created_at"),
      db
        .from("marketplace_settings" as never)
        .select("default_commission_rate")
        .eq("id", true)
        .maybeSingle(),
    ]);

    if (vendorsRes.error) throw vendorsRes.error;
    if (splitsRes.error) throw splitsRes.error;

    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const totals = new Map<string, { total: number; recent: number }>();
    for (const raw of (splitsRes.data ?? []) as unknown as Array<{
      vendor_id: string;
      commission_amount: number;
      created_at: string;
    }>) {
      const current = totals.get(raw.vendor_id) ?? { total: 0, recent: 0 };
      const amount = Number(raw.commission_amount ?? 0);
      current.total += amount;
      if (new Date(raw.created_at).getTime() >= cutoff) current.recent += amount;
      totals.set(raw.vendor_id, current);
    }

    const vendors = (vendorsRes.data ?? []).map((vendor) => {
      const totalsForVendor = totals.get(vendor.id) ?? { total: 0, recent: 0 };
      const plan = getVendorPlan(vendor.subscription_plan);
      return {
        id: vendor.id,
        storeName: vendor.store_name,
        plan: plan?.name ?? vendor.subscription_plan ?? "No plan",
        rate: Number(vendor.commission_rate ?? plan?.commissionRate ?? 0),
        status: vendor.status,
        commission30d: totalsForVendor.recent,
        totalCommission: totalsForVendor.total,
      };
    });

    return {
      defaultRate: Number(
        (settingsRes.data as { default_commission_rate?: number } | null)?.default_commission_rate ??
          VENDOR_PLANS[0].commissionRate,
      ),
      revenue30d: vendors.reduce((sum, vendor) => sum + vendor.commission30d, 0),
      totalRevenue: vendors.reduce((sum, vendor) => sum + vendor.totalCommission, 0),
      activeVendors: vendors.filter((vendor) => vendor.status === "active").length,
      vendors,
    };
  });

export type AdminSubscriptionSummary = {
  vendors: Array<{
    id: string;
    storeName: string;
    plan: string;
    status: string;
    monthlyCad: number | null;
    commissionRate: number | null;
    billingConnected: boolean;
    createdAt: string;
  }>;
  monthlyRecurringCad: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  pastDueSubscriptions: number;
};

export const getAdminSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminSubscriptionSummary> => {
    const db = await adminDb(context);
    const { data, error } = await db
      .from("vendors")
      .select(
        "id, store_name, subscription_plan, subscription_status, stripe_subscription_id, commission_rate, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;

    const vendors = (data ?? []).map((vendor) => {
      const plan = getVendorPlan(vendor.subscription_plan);
      return {
        id: vendor.id,
        storeName: vendor.store_name,
        plan: plan?.name ?? vendor.subscription_plan ?? "No plan",
        status: vendor.subscription_status,
        monthlyCad: plan?.monthlyCad ?? null,
        commissionRate:
          vendor.commission_rate == null
            ? plan?.commissionRate ?? null
            : Number(vendor.commission_rate),
        billingConnected: Boolean(vendor.stripe_subscription_id),
        createdAt: vendor.created_at,
      };
    });

    return {
      vendors,
      monthlyRecurringCad: vendors
        .filter((vendor) => vendor.status === "active" || vendor.status === "trialing")
        .reduce((sum, vendor) => sum + (vendor.monthlyCad ?? 0), 0),
      activeSubscriptions: vendors.filter((vendor) => vendor.status === "active").length,
      trialingSubscriptions: vendors.filter((vendor) => vendor.status === "trialing").length,
      pastDueSubscriptions: vendors.filter(
        (vendor) => vendor.status === "past_due" || vendor.status === "unpaid",
      ).length,
    };
  });


export type AdminDashboardSummary = {
  gmv: number;
  orderCount: number;
  pendingVendors: number;
  activeVendors: number;
  pendingProducts: number;
  activeProducts: number;
  unpaidVendors: number;
  openDisputes: number;
  commissionRevenue: number;
  payoutLiability: number;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customerEmail: string | null;
    total: number;
    paymentStatus: string;
    fulfillmentStatus: string;
    createdAt: string;
  }>;
};

export const getAdminDashboardSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDashboardSummary> => {
    const db = await adminDb(context);
    const [
      ordersRes,
      vendorsRes,
      productsRes,
      splitsRes,
      disputesRes,
      recentOrdersRes,
    ] = await Promise.all([
      db.from("orders").select("total, payment_status"),
      db.from("vendors").select("status, subscription_status"),
      db.from("products").select("status"),
      db
        .from("vendor_orders" as never)
        .select("commission_amount, vendor_payout_amount, status"),
      db
        .from("disputes")
        .select("id, status"),
      db
        .from("orders")
        .select("id, order_number, customer_email, total, payment_status, status, created_at")
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    for (const result of [
      ordersRes,
      vendorsRes,
      productsRes,
      splitsRes,
      disputesRes,
      recentOrdersRes,
    ]) {
      if (result.error) throw result.error;
    }

    const orders = (ordersRes.data ?? []) as Array<{
      total: number;
      payment_status: string;
    }>;
    const vendors = (vendorsRes.data ?? []) as Array<{
      status: string;
      subscription_status: string;
    }>;
    const products = (productsRes.data ?? []) as Array<{ status: string }>;
    const splits = (splitsRes.data ?? []) as unknown as Array<{
      commission_amount: number;
      vendor_payout_amount: number;
      status: string;
    }>;
    const disputes = (disputesRes.data ?? []) as Array<{ id: string; status: string }>;
    const recentOrders = (recentOrdersRes.data ?? []) as Array<{
      id: string;
      order_number: string;
      customer_email: string | null;
      total: number;
      payment_status: string;
      status: string;
      created_at: string;
    }>;

    const openDisputeStatuses = new Set([
      "open",
      "under_review",
      "waiting_customer",
      "waiting_vendor",
    ]);

    return {
      gmv: orders
        .filter((order) => order.payment_status === "paid")
        .reduce((sum, order) => sum + Number(order.total ?? 0), 0),
      orderCount: orders.length,
      pendingVendors: vendors.filter((vendor) => vendor.status === "pending").length,
      activeVendors: vendors.filter((vendor) => vendor.status === "active").length,
      pendingProducts: products.filter((product) => product.status === "pending_review").length,
      activeProducts: products.filter((product) => product.status === "active").length,
      unpaidVendors: vendors.filter(
        (vendor) =>
          vendor.subscription_status === "past_due" ||
          vendor.subscription_status === "unpaid",
      ).length,
      openDisputes: disputes.filter((dispute) =>
        openDisputeStatuses.has(dispute.status),
      ).length,
      commissionRevenue: splits.reduce(
        (sum, split) => sum + Number(split.commission_amount ?? 0),
        0,
      ),
      payoutLiability: splits
        .filter(
          (split) =>
            split.status !== "delivered" &&
            split.status !== "cancelled",
        )
        .reduce(
          (sum, split) => sum + Number(split.vendor_payout_amount ?? 0),
          0,
        ),
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        orderNumber: order.order_number,
        customerEmail: order.customer_email,
        total: Number(order.total ?? 0),
        paymentStatus: order.payment_status,
        fulfillmentStatus: order.status,
        createdAt: order.created_at,
      })),
    };
  });
