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


export type TakatakVerifiedIdentity = {
  id: string;
  phone: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  locale: string | null;
};

export type TakatakOtpMetadata = {
  email?: string | null;
  fullName?: string | null;
  preferredLanguage?: string | null;
};

export type TakatakOtpResult =
  | { ok: true }
  | { ok: false; setupRequired?: boolean; error: string };

export type TakatakOtpVerifyResult =
  | { ok: true; identity: TakatakVerifiedIdentity }
  | { ok: false; setupRequired?: boolean; error: string };

async function callOtp(
  path: string,
  body: Record<string, unknown>,
): Promise<
  | { ok: true; json: Record<string, unknown> }
  | { ok: false; setupRequired?: boolean; error: string }
> {
  const cfg = takatakConfig();
  if (!cfg) {
    return {
      ok: false,
      setupRequired: true,
      error: "TAKATAK identity service is not configured",
    };
  }

  try {
    const response = await fetch(`${cfg.url}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify(body),
    });

    const raw = await response.text();
    let json: Record<string, unknown> = {};
    try {
      json = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      json = {};
    }

    if (!response.ok) {
      const error =
        typeof json["error"] === "string"
          ? json["error"]
          : `TAKATAK responded ${response.status}`;
      return { ok: false, error: error.slice(0, 300) };
    }

    if (json["authority"] !== "takatak_supabase_phone") {
      return {
        ok: false,
        error: "TAKATAK returned an unexpected authentication authority.",
      };
    }

    return { ok: true, json };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message.slice(0, 300)
          : "TAKATAK identity service is unavailable",
    };
  }
}

export async function requestTakatakPhoneOtp(
  phone: string,
  metadata: TakatakOtpMetadata = {},
): Promise<TakatakOtpResult> {
  const result = await callOtp("/v1/auth/otp/send", {
    phone,
    ...(metadata.email ? { email: metadata.email } : {}),
    ...(metadata.fullName ? { full_name: metadata.fullName } : {}),
    ...(metadata.preferredLanguage
      ? { preferred_language: metadata.preferredLanguage }
      : {}),
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function verifyTakatakPhoneOtp(
  phone: string,
  code: string,
): Promise<TakatakOtpVerifyResult> {
  const result = await callOtp("/v1/auth/otp/verify", { phone, code });
  if (!result.ok) return result;

  const identityRaw = result.json["identity"];
  if (
    !identityRaw ||
    typeof identityRaw !== "object" ||
    Array.isArray(identityRaw)
  ) {
    return { ok: false, error: "TAKATAK returned an invalid identity." };
  }

  const identity = identityRaw as Record<string, unknown>;
  const id = typeof identity["id"] === "string" ? identity["id"] : "";
  const verifiedPhone =
    typeof identity["phone"] === "string" ? identity["phone"] : "";

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    ) ||
    !verifiedPhone
  ) {
    return { ok: false, error: "TAKATAK returned an invalid identity." };
  }

  const optionalString = (key: string): string | null => {
    const value = identity[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  return {
    ok: true,
    identity: {
      id,
      phone: verifiedPhone,
      email: optionalString("email"),
      first_name: optionalString("first_name"),
      last_name: optionalString("last_name"),
      locale: optionalString("locale"),
    },
  };
}
