import { createFileRoute } from "@tanstack/react-router";

const REQUIRED_RUNTIME_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CHECKOUT_GUEST_TOKEN_SECRET",
  "STRIPE_PRICE_VENDOR_STARTER_MONTHLY",
  "STRIPE_PRICE_VENDOR_GROWTH_MONTHLY",
  "STRIPE_PRICE_VENDOR_SCALE_MONTHLY",
  "TAKATAK_MASTER_API_URL",
  "TAKATAK_MASTER_API_KEY",
  "TAKATAK_DRAIN_CRON_SECRET",
] as const;

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const missing = REQUIRED_RUNTIME_ENV.filter(
          (name) => !process.env[name]?.trim(),
        );

        if (missing.length > 0) {
          console.error(
            "[1lv.ca] Production health check missing runtime configuration:",
            missing.join(", "),
          );
        }

        const ok = missing.length === 0;

        return new Response(
          JSON.stringify({
            ok,
            service: "1lv.ca",
            runtime: "tanstack-start",
          }),
          {
            status: ok ? 200 : 503,
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
