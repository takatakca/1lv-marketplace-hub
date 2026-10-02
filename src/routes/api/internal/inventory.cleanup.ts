import { createFileRoute } from "@tanstack/react-router";

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
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

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data, error } = await supabaseAdmin.rpc(
          "release_expired_inventory_reservations" as never,
          { _limit: 250 } as never,
        );

        if (error) {
          console.error(
            "[1lv.ca] Inventory maintenance failed:",
            error.message,
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

        const released = Number(data ?? 0);
        if (!Number.isInteger(released) || released < 0) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Inventory maintenance returned an invalid result.",
            }),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              },
            },
          );
        }

        return new Response(
          JSON.stringify({ ok: true, released }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          },
        );
      },
    },
  },
});
