import { createFileRoute } from "@tanstack/react-router";

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_TIMEOUT_MS = 20_000;
const CLEANUP_LIMIT = 50;

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

async function stripeRequest(
  path: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Stripe is not configured.");

  const response = await fetch(`${STRIPE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(STRIPE_TIMEOUT_MS),
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      json.error &&
      typeof json.error === "object" &&
      !Array.isArray(json.error) &&
      typeof (json.error as Record<string, unknown>).message === "string"
        ? String((json.error as Record<string, unknown>).message)
        : "Stripe request failed.";
    throw new Error(message);
  }
  return json;
}

export const Route = createFileRoute("/api/internal/inventory/cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env.INVENTORY_MAINTENANCE_CRON_SECRET?.trim();

        if (!expected || expected.length < 32) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Inventory maintenance is not configured.",
            }),
            {
              status: 503,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              },
            },
          );
        }

        const authorization = request.headers.get("authorization") ?? "";
        if (!authorization.startsWith("Bearer ")) {
          return new Response(
            JSON.stringify({ ok: false, error: "Unauthorized." }),
            {
              status: 401,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              },
            },
          );
        }

        const received = authorization.slice(7).trim();
        if (!safeEqual(received, expected)) {
          return new Response(
            JSON.stringify({ ok: false, error: "Unauthorized." }),
            {
              status: 401,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              },
            },
          );
        }

        if (!process.env.STRIPE_SECRET_KEY?.trim()) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Stripe inventory cleanup is not configured.",
            }),
            {
              status: 503,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
                "Retry-After": "300",
              },
            },
          );
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const now = new Date().toISOString();
        const { data: expired, error: readError } = await supabaseAdmin
          .from("orders")
          .select(
            "id, order_number, stripe_payment_intent_id, inventory_reserved_until, inventory_released_at, inventory_committed_at, payment_status",
          )
          .not("inventory_reserved_until", "is", null)
          .lte("inventory_reserved_until", now)
          .is("inventory_released_at", null)
          .is("inventory_committed_at", null)
          .in("payment_status", ["unpaid", "failed"])
          .order("inventory_reserved_until", { ascending: true })
          .limit(CLEANUP_LIMIT);

        if (readError) {
          console.error(
            "[1lv.ca] Inventory maintenance query failed:",
            readError.message,
          );
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Inventory maintenance failed.",
            }),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
                "Retry-After": "300",
              },
            },
          );
        }

        let released = 0;
        let blocked = 0;
        const rows = expired ?? [];

        for (const order of rows) {
          const paymentIntentId = order.stripe_payment_intent_id;
          let safeToRelease = !paymentIntentId;

          if (paymentIntentId) {
            try {
              const intent = await stripeRequest(
                `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
              );
              const intentId =
                typeof intent.id === "string" ? intent.id : "";
              const status =
                typeof intent.status === "string" ? intent.status : "";
              const metadata =
                intent.metadata &&
                typeof intent.metadata === "object" &&
                !Array.isArray(intent.metadata)
                  ? (intent.metadata as Record<string, unknown>)
                  : {};
              const stripeOrderId =
                typeof metadata["order_id"] === "string"
                  ? String(metadata["order_id"])
                  : "";

              if (
                intentId !== paymentIntentId ||
                stripeOrderId !== order.id
              ) {
                blocked += 1;
                console.error(
                  "[1lv.ca] Expired checkout Stripe binding mismatch:",
                  order.id,
                );
                continue;
              }

              if (status === "canceled") {
                safeToRelease = true;
              } else if (status === "succeeded") {
                blocked += 1;
                console.error(
                  "[1lv.ca] Expired checkout already succeeded in Stripe:",
                  order.id,
                );
                continue;
              } else {
                const canceled = await stripeRequest(
                  `/payment_intents/${encodeURIComponent(paymentIntentId)}/cancel`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body: new URLSearchParams({
                      cancellation_reason: "abandoned",
                    }).toString(),
                  },
                );
                safeToRelease =
                  canceled.id === paymentIntentId &&
                  canceled.status === "canceled";
              }
            } catch (error) {
              blocked += 1;
              console.error(
                "[1lv.ca] Could not make expired checkout non-payable:",
                order.id,
                error instanceof Error ? error.message : error,
              );
              continue;
            }
          }

          if (!safeToRelease) {
            blocked += 1;
            continue;
          }

          const { data: didRelease, error: releaseError } =
            await supabaseAdmin.rpc(
              "release_order_inventory" as never,
              {
                _order_id: order.id,
                _expected_payment_intent_id: paymentIntentId ?? null,
              } as never,
            );

          if (releaseError) {
            blocked += 1;
            console.error(
              "[1lv.ca] Inventory release failed:",
              order.id,
              releaseError.message,
            );
            continue;
          }

          if (didRelease === true) {
            released += 1;
          } else {
            blocked += 1;
            console.error(
              "[1lv.ca] Inventory release compare-and-release rejected stale state:",
              order.id,
            );
          }
        }

        const ok = blocked === 0;
        return new Response(
          JSON.stringify({
            ok,
            scanned: rows.length,
            released,
            blocked,
          }),
          {
            status: ok ? 200 : 409,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              ...(ok ? {} : { "Retry-After": "300" }),
            },
          },
        );
      },
    },
  },
});
