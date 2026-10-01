import { createFileRoute } from "@tanstack/react-router";

const EXPECTED_SCHEMA_VERSION = "20261001043000";

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

type DatabaseHealth = "ready" | "skipped" | "unavailable" | "mismatch";

async function checkDatabaseSchema(): Promise<{
  status: DatabaseHealth;
  version?: string;
}> {
  if (process.env.HEALTH_SKIP_DATABASE_CHECK === "1") {
    return { status: "skipped" };
  }

  try {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await supabaseAdmin.rpc(
      "get_1lv_schema_version" as never,
    );

    if (error) {
      console.error("[1lv.ca] Database health check failed:", error.message);
      return { status: "unavailable" };
    }

    const version = typeof data === "string" ? data : String(data ?? "");
    if (version !== EXPECTED_SCHEMA_VERSION) {
      console.error(
        "[1lv.ca] Database schema mismatch:",
        version || "missing",
        "expected",
        EXPECTED_SCHEMA_VERSION,
      );
      return { status: "mismatch", version };
    }

    return { status: "ready", version };
  } catch (error) {
    console.error("[1lv.ca] Database health check exception:", error);
    return { status: "unavailable" };
  }
}

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

        const database =
          missing.length === 0
            ? await checkDatabaseSchema()
            : { status: "unavailable" as const };

        const databaseAcceptable =
          database.status === "ready" || database.status === "skipped";
        const ok = missing.length === 0 && databaseAcceptable;

        return new Response(
          JSON.stringify({
            ok,
            service: "1lv.ca",
            runtime: "tanstack-start",
            database: database.status,
            schemaVersion: database.version,
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
