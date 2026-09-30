import { createFileRoute } from "@tanstack/react-router";

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

// The generated route tree is refreshed by the Vite/TanStack build after this
// file is discovered. Cast only the path literal so pre-build tsc can validate
// the handler without requiring a committed edit to routeTree.gen.ts.
export const Route = createFileRoute("/api/internal/takatak/drain" as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.TAKATAK_DRAIN_CRON_SECRET?.trim();
        if (!expected || expected.length < 32) {
          return new Response(
            JSON.stringify({ ok: false, error: "TAKATAK drain is not configured." }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        }

        const authorization = request.headers.get("authorization") ?? "";
        if (!authorization.startsWith("Bearer ")) {
          return new Response(
            JSON.stringify({ ok: false, error: "Unauthorized." }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        const received = authorization.slice(7).trim();
        if (!safeEqual(received, expected)) {
          return new Response(
            JSON.stringify({ ok: false, error: "Unauthorized." }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        const { drainTakatakOutbox } = await import("@/lib/takatak/outbox.server");
        const result = await drainTakatakOutbox(50);

        if (!result.ok && result.setupRequired) {
          return new Response(JSON.stringify(result), {
            status: 503,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              "Retry-After": "300",
            },
          });
        }

        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 500,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
