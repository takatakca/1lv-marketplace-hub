import { createServerFn } from "@tanstack/react-start";
import { getOptionalSupabaseUser } from "@/integrations/supabase/optional-auth.server";
import { assertGuestPaymentTokenConfigured, createGuestPaymentToken } from "@/lib/guest-payment-token.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ServerCheckoutItem = {
  productId: string;
  variantId?: string | null;
  quantity: number;
};

export type ServerCheckoutAddress = {
  first_name: string;
  last_name: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  country?: string;
};

export type ServerCheckoutInput = {
  idempotencyKey: string;
  items: ServerCheckoutItem[];
  email: string;
  phone: string;
  shippingAddress: ServerCheckoutAddress;
  billingAddress?: ServerCheckoutAddress;
  promotionCode?: string | null;
};

export type ServerCheckoutResult = {
  order_id: string;
  order_number: string;
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  discount_total: number;
  total: number;
  tax_label: string;
  province: string;
  demo: false;
  reused: boolean;
  guest_payment_token: string | null;
  promotion_code: string | null;
  promotion_savings_total: number;
};

const CANADIAN_PROVINCE_CODES = new Set([
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
]);

const CANADIAN_POSTAL_CODE_RE =
  /^[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTV-Z][0-9][ABCEGHJ-NPRSTV-Z][0-9]$/;

function requiredCheckoutText(
  value: unknown,
  label: string,
  maxLength: number,
) {
  if (typeof value !== "string") {
    throw new Error(`${label} is required.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function normalizeCheckoutAddress(
  value: unknown,
  label: "Shipping" | "Billing",
): ServerCheckoutAddress {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} address is required.`);
  }

  const address = value as Partial<Record<keyof ServerCheckoutAddress, unknown>>;
  const firstName = requiredCheckoutText(
    address.first_name,
    `${label} first name`,
    100,
  );
  const lastName = requiredCheckoutText(
    address.last_name,
    `${label} last name`,
    100,
  );
  const street = requiredCheckoutText(
    address.address,
    `${label} street address`,
    200,
  );
  const city = requiredCheckoutText(address.city, `${label} city`, 100);
  const province = requiredCheckoutText(
    address.province,
    `${label} province`,
    2,
  ).toUpperCase();

  if (!CANADIAN_PROVINCE_CODES.has(province)) {
    throw new Error(`${label} province is invalid.`);
  }

  const postalCompact = requiredCheckoutText(
    address.postal_code,
    `${label} postal code`,
    12,
  )
    .toUpperCase()
    .replace(/[ -]/g, "");

  if (!CANADIAN_POSTAL_CODE_RE.test(postalCompact)) {
    throw new Error(`${label} postal code is invalid.`);
  }

  if (address.country != null) {
    if (typeof address.country !== "string") {
      throw new Error(`${label} country is invalid.`);
    }
    const country = address.country.trim().toUpperCase();
    if (country && !["CA", "CAN", "CANADA"].includes(country)) {
      throw new Error("1LV checkout currently supports Canadian addresses only.");
    }
  }

  return {
    first_name: firstName,
    last_name: lastName,
    address: street,
    city,
    province,
    postal_code: `${postalCompact.slice(0, 3)} ${postalCompact.slice(3)}`,
    country: "Canada",
  };
}

function validateCheckoutInput(data: ServerCheckoutInput): ServerCheckoutInput {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid checkout request.");
  }

  if (
    typeof data.idempotencyKey !== "string" ||
    !UUID_RE.test(data.idempotencyKey)
  ) {
    throw new Error("Invalid checkout session.");
  }

  if (
    !Array.isArray(data.items) ||
    data.items.length === 0 ||
    data.items.length > 100
  ) {
    throw new Error("Your cart is empty or too large.");
  }

  const items = data.items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Invalid product in cart.");
    }
    if (
      typeof item.productId !== "string" ||
      !UUID_RE.test(item.productId)
    ) {
      throw new Error("Invalid product in cart.");
    }
    if (
      item.variantId != null &&
      (typeof item.variantId !== "string" || !UUID_RE.test(item.variantId))
    ) {
      throw new Error("Invalid product variant in cart.");
    }
    if (
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 99
    ) {
      throw new Error("Invalid product quantity.");
    }
    return {
      productId: item.productId,
      variantId: item.variantId ?? null,
      quantity: item.quantity,
    };
  });

  if (typeof data.email !== "string") {
    throw new Error("A valid customer email address is required.");
  }
  const checkoutEmail = data.email.trim().toLowerCase();
  if (
    checkoutEmail.length < 5 ||
    checkoutEmail.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkoutEmail) ||
    checkoutEmail.endsWith("@auth.1lv.ca")
  ) {
    throw new Error("A valid customer email address is required.");
  }

  if (typeof data.phone !== "string" || data.phone.trim().length > 40) {
    throw new Error("Customer phone is invalid.");
  }

  const shippingAddress = normalizeCheckoutAddress(
    data.shippingAddress,
    "Shipping",
  );
  const billingAddress =
    data.billingAddress == null
      ? undefined
      : normalizeCheckoutAddress(data.billingAddress, "Billing");

  let promotionCode: string | null | undefined = data.promotionCode;
  if (promotionCode != null) {
    if (
      typeof promotionCode !== "string" ||
      !/^[A-Za-z0-9_-]{3,32}$/.test(promotionCode.trim())
    ) {
      throw new Error("Invalid promotion code.");
    }
    promotionCode = promotionCode.trim().toUpperCase();
  }

  if (JSON.stringify(data).length > 50_000) {
    throw new Error("Checkout request is too large.");
  }

  return {
    ...data,
    items,
    email: checkoutEmail,
    phone: data.phone.trim(),
    shippingAddress,
    billingAddress,
    promotionCode,
  };
}

export const createMarketplaceOrder = createServerFn({ method: "POST" })
  .inputValidator(validateCheckoutInput)
  .handler(async ({ data }): Promise<ServerCheckoutResult> => {
    const user = await getOptionalSupabaseUser();
    const userId = user?.id ?? null;
    // The local Supabase email is a synthetic TAKATAK RLS transport identity.
    // Receipt/contact email is always the address explicitly supplied at checkout.
    const customerEmail = data.email.trim().toLowerCase();

    if (!userId) {
      assertGuestPaymentTokenConfigured();
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: result, error } = await supabaseAdmin.rpc(
      "create_marketplace_order_locked",
      {
        _customer_id: userId,
        _customer_email: customerEmail,
        _customer_phone: data.phone,
        _shipping_address: data.shippingAddress,
        _billing_address: data.billingAddress ?? null,
        _items: data.items.map((item) => ({
          product_id: item.productId,
          variant_id: item.variantId ?? null,
          quantity: item.quantity,
        })),
        _idempotency_key: data.idempotencyKey,
        _promotion_code: data.promotionCode?.trim().toUpperCase() || null,
      },
    );

    if (error) {
      const message = error.message || "Could not create order.";
      const safeMessage =
        /inventory|available|quantity|address|email|province|checkout/i.test(message)
          ? message
          : "Checkout could not be completed.";
      throw new Error(safeMessage);
    }

    const order = result as unknown as Omit<
      ServerCheckoutResult,
      "guest_payment_token"
    > | null;

    if (!order?.order_id || !UUID_RE.test(order.order_id) || !order.order_number) {
      throw new Error("Checkout did not return a valid order.");
    }

    const guestPaymentToken = userId
      ? null
      : await createGuestPaymentToken(order.order_id);

    try {
      const { queueOrderEvent } = await import(
        "@/lib/takatak/outbox.server"
      );
      // order.created is the single synchronization entrypoint: it queues the
      // signed-in or guest customer projection plus relationship references.
      await queueOrderEvent(order.order_id, "order.created");
    } catch (syncError) {
      console.warn("TAKATAK checkout sync was queued incompletely:", syncError);
    }

    return {
      ...order,
      guest_payment_token: guestPaymentToken,
    };
  });
