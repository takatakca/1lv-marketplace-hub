import { supabase } from "@/integrations/supabase/client";

export type PublicPromotion = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: "percent" | "fixed" | "free_shipping";
  discount_value: number;
  max_discount: number | null;
  min_order: number;
  starts_at: string | null;
  ends_at: string | null;
  first_order_only: boolean;
  stackable: boolean;
  priority: number;
};

export async function listPublicPromotions(): Promise<PublicPromotion[]> {
  const { data, error } = await supabase
    .from("public_promotions" as never)
    .select("*")
    .order("priority", { ascending: false })
    .order("ends_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("Could not load public promotions", error);
    return [];
  }

  return (data ?? []) as unknown as PublicPromotion[];
}

export function describePromotion(promotion: PublicPromotion) {
  if (promotion.discount_type === "free_shipping") return "Free shipping";
  if (promotion.discount_type === "percent") {
    const cap = promotion.max_discount
      ? ` · up to $${Number(promotion.max_discount).toFixed(2)}`
      : "";
    return `${Number(promotion.discount_value)}% off${cap}`;
  }
  return `$${Number(promotion.discount_value).toFixed(2)} off`;
}
