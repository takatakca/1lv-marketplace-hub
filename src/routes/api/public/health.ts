import { createFileRoute } from "@tanstack/react-router";

import { takatakConfigured } from "@/lib/takatak/client.server";

const EXPECTED_SCHEMA_VERSION = "20261003052000";
const EXPECTED_SUPABASE_PROJECT_REF = "odoybkshqszucvoxzjyz";
const EXPECTED_SUPABASE_HOST =
  `${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`;

function supabaseTargetConfigured() {
  const raw = process.env.SUPABASE_URL?.trim();
  if (!raw) return false;

  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      url.hostname === EXPECTED_SUPABASE_HOST &&
      !url.username &&
      !url.password &&
      (url.pathname === "/" || url.pathname === "") &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

const REQUIRED_RUNTIME_ENV = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CHECKOUT_GUEST_TOKEN_SECRET",
  "STRIPE_PRICE_VENDOR_STARTER_MONTHLY",
  "STRIPE_PRICE_VENDOR_GROWTH_MONTHLY",
  "STRIPE_PRICE_VENDOR_SCALE_MONTHLY",
  "TAKATAK_MASTER_API_URL",
  "TAKATAK_1LV_API_KEY",
  "TAKATAK_DRAIN_CRON_SECRET",
  "INVENTORY_MAINTENANCE_CRON_SECRET",
] as const;

const MIN_32_CHAR_SECRET_ENV = [
  "CHECKOUT_GUEST_TOKEN_SECRET",
  "TAKATAK_DRAIN_CRON_SECRET",
  "INVENTORY_MAINTENANCE_CRON_SECRET",
] as const;

function strongRuntimeSecretsConfigured() {
  return MIN_32_CHAR_SECRET_ENV.every(
    (name) => (process.env[name]?.trim().length ?? 0) >= 32,
  );
}

type DatabaseHealth = "ready" | "skipped" | "unavailable" | "mismatch";

async function checkDatabaseSchema(): Promise<{
  status: DatabaseHealth;
  version?: string;
}> {
  if (
    process.env.HEALTH_SKIP_DATABASE_CHECK === "1" &&
    process.env.GITHUB_ACTIONS === "true"
  ) {
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
        const masterIntegrationReady = takatakConfigured();
        const supabaseTargetReady = supabaseTargetConfigured();
        const releaseRevision =
          process.env.RELEASE_REVISION?.trim().toLowerCase() ?? "";
        const releaseRevisionReady = /^[0-9a-f]{40}$/.test(releaseRevision);

        if (missing.length > 0) {
          console.error(
            "[1lv.ca] Production health check missing runtime configuration:",
            missing.join(", "),
          );
        }

        if (missing.length === 0 && !masterIntegrationReady) {
          console.error(
            "[1lv.ca] TAKATAK integration configuration is invalid.",
          );
        }

        if (missing.length === 0 && !supabaseTargetReady) {
          console.error(
            "[1lv.ca] SUPABASE_URL does not target the fixed 1LV production project.",
          );
        }

        if (!releaseRevisionReady) {
          console.error(
            "[1lv.ca] RELEASE_REVISION is missing or is not a full Git commit SHA.",
          );
        }

        const strongRuntimeSecretsReady =
          strongRuntimeSecretsConfigured();

        if (missing.length === 0 && !strongRuntimeSecretsReady) {
          console.error(
            "[1lv.ca] One or more runtime signing/cron secrets are shorter than 32 characters.",
          );
        }

        const configurationReady =
          missing.length === 0 &&
          masterIntegrationReady &&
          supabaseTargetReady &&
          releaseRevisionReady &&
          strongRuntimeSecretsReady;

        const database = configurationReady
          ? await checkDatabaseSchema()
          : { status: "unavailable" as const };

        const databaseAcceptable =
          database.status === "ready" || database.status === "skipped";
        const ok = configurationReady && databaseAcceptable;

        return new Response(
          JSON.stringify({
            ok,
            service: "1lv.ca",
            runtime: "tanstack-start",
            database: database.status,
            revision: releaseRevision || null,
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
