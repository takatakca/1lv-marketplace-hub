/**
 * TAKATAK Master Platform HTTP client — SERVER ONLY.
 *
 * TAKATAK_MASTER_API_URL / TAKATAK_MASTER_API_KEY are read inside the
 * functions (never at module scope) and NEVER leave this module.
 * If configuration is missing, nothing throws: callers keep the event queued
 * and the admin console reports "setup required".
 */

import type { TakatakEventType } from "./types";

export type TakatakConfig = { url: string; key: string } | null;

export function takatakConfig(): TakatakConfig {
  const url = process.env["TAKATAK_MASTER_API_URL"];
  const key = process.env["TAKATAK_MASTER_API_KEY"];
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

export function takatakConfigured(): boolean {
  return takatakConfig() !== null;
}

export type SendResult =
  | { ok: true; remoteId: string | null }
  | { ok: false; setupRequired?: boolean; error: string };

async function call(
  path: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<SendResult> {
  const cfg = takatakConfig();
  if (!cfg) return { ok: false, setupRequired: true, error: "TAKATAK integration not configured" };
  try {
    const res = await fetch(`${cfg.url}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.key}`,
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      json = {};
    }
    if (!res.ok) {
      const msg = (json["error"] as string) ?? `TAKATAK responded ${res.status}`;
      return { ok: false, error: msg.slice(0, 500) };
    }
    const remoteId =
      (json["id"] as string) ??
      (json["remote_id"] as string) ??
      ((json["data"] as Record<string, unknown> | undefined)?.["id"] as string) ??
      null;
    return { ok: true, remoteId };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 500) };
  }
}

/** Deliver one normalized integration event. Idempotency key = outbox event id. */
export async function sendTakatakEvent(input: {
  eventId: string;
  eventType: TakatakEventType;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}): Promise<SendResult> {
  return call(
    "/v1/events",
    {
      event_id: input.eventId,
      event_type: input.eventType,
      aggregate_type: input.aggregateType,
      aggregate_id: input.aggregateId,
      source_application: "1lv",
      payload: input.payload,
    },
    input.eventId,
  );
}

/** Ask TAKATAK to resolve (not create) a master person for a normalized customer. */
export async function resolveTakatakCustomer(
  payload: Record<string, unknown>,
): Promise<SendResult> {
  return call("/v1/identity/resolve-person", payload);
}

/** Ask TAKATAK to resolve a master merchant/company for a normalized merchant. */
export async function resolveTakatakMerchant(
  payload: Record<string, unknown>,
): Promise<SendResult> {
  return call("/v1/identity/resolve-merchant", payload);
}
