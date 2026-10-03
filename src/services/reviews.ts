import { supabase } from "@/integrations/supabase/client";

export type ProductReview = {
  id: string;
  product_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  verified_purchase: boolean;
  created_at: string;
};

export type ProductReviewSummary = {
  product_id: string;
  rating_average: number;
  review_count: number;
  rating_distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
};

export async function listPublicProductReviews(
  productId: string,
  limit = 20,
  offset = 0,
): Promise<ProductReview[]> {
  const { data, error } = await supabase.rpc(
    "list_public_product_reviews" as never,
    {
      _product_id: productId,
      _limit: limit,
      _offset: offset,
    } as never,
  );
  if (error) throw error;
  return (data ?? []) as unknown as ProductReview[];
}

export async function getPublicProductReviewSummary(
  productId: string,
): Promise<ProductReviewSummary> {
  const { data, error } = await supabase.rpc(
    "get_public_product_review_summary" as never,
    { _product_id: productId } as never,
  );
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  const raw = (row ?? {}) as unknown as {
    product_id?: string;
    rating_average?: number | string;
    review_count?: number | string;
    rating_distribution?: ProductReviewSummary["rating_distribution"];
  };

  return {
    product_id: raw.product_id ?? productId,
    rating_average: Number(raw.rating_average ?? 0),
    review_count: Number(raw.review_count ?? 0),
    rating_distribution: raw.rating_distribution ?? {
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0,
    },
  };
}

export async function submitVerifiedProductReview(input: {
  orderItemId: string;
  rating: number;
  title?: string | null;
  body?: string | null;
}) {
  const { data, error } = await supabase.rpc(
    "submit_verified_product_review" as never,
    {
      _order_item_id: input.orderItemId,
      _rating: input.rating,
      _title: input.title?.trim() || null,
      _body: input.body?.trim() || null,
    } as never,
  );
  if (error) throw error;

  const result = (data ?? {}) as unknown as {
    ok?: boolean;
    review_id?: string;
    product_id?: string;
    status?: string;
    verified_purchase?: boolean;
  };

  if (
    result.ok !== true ||
    typeof result.review_id !== "string" ||
    result.verified_purchase !== true
  ) {
    throw new Error("Verified review submission returned an invalid result.");
  }

  return result;
}
