import { createServerFn } from "@tanstack/react-start";

import {
  requestTakatakPhoneOtp,
  verifyTakatakPhoneOtp,
  type TakatakVerifiedIdentity,
} from "@/lib/takatak/client.server";
import { normalizePhone } from "@/lib/takatak/customer-mapper";

type PhoneActionResult =
  | { ok: true }
  | { ok: false; error: string; setupRequired?: boolean };

type PhoneLoginResult =
  | { ok: true; tokenHash: string }
  | { ok: false; error: string; setupRequired?: boolean };

type AuthIntent = "login" | "signup";

type RequestPhoneCodeInput = {
  phone: string;
  email?: string;
  fullName?: string;
  preferredLanguage?: string;
};

type VerifyPhoneCodeInput = {
  phone: string;
  code: string;
  intent?: AuthIntent;
  termsAccepted?: boolean;
  marketingOptIn?: boolean;
};

function validCanadianPhone(raw: string): string | null {
  const phone = normalizePhone(raw);
  return phone && /^\+1\d{10}$/.test(phone) ? phone : null;
}

function normalizeOptionalEmail(raw: string | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  return email;
}

function syntheticIdentityEmail(identityId: string): string {
  return `takatak.${identityId.toLowerCase()}@auth.1lv.ca`;
}

function identityDisplayName(identity: TakatakVerifiedIdentity): string {
  return [identity.first_name, identity.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export const requestTakatakPhoneLoginCode = createServerFn({
  method: "POST",
})
  .inputValidator((data: RequestPhoneCodeInput) => data)
  .handler(async ({ data }): Promise<PhoneActionResult> => {
    const phone = validCanadianPhone(data.phone ?? "");
    if (!phone) {
      return { ok: false, error: "Enter a valid Canadian phone number." };
    }

    const rawEmail = (data.email ?? "").trim();
    const email = normalizeOptionalEmail(data.email);
    if (rawEmail && !email) {
      return { ok: false, error: "Enter a valid email address." };
    }

    const fullName = (data.fullName ?? "").trim().slice(0, 200) || null;
    const requestedLanguage = (data.preferredLanguage ?? "").trim().toLowerCase();
    const preferredLanguage = ["en", "fr", "es"].includes(requestedLanguage)
      ? requestedLanguage
      : null;

    const result = await requestTakatakPhoneOtp(phone, {
      email,
      fullName,
      preferredLanguage,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        setupRequired: result.setupRequired,
      };
    }

    return { ok: true };
  });

export const verifyTakatakPhoneLoginCode = createServerFn({
  method: "POST",
})
  .inputValidator((data: VerifyPhoneCodeInput) => data)
  .handler(async ({ data }): Promise<PhoneLoginResult> => {
    const phone = validCanadianPhone(data.phone ?? "");
    const code = (data.code ?? "").trim();
    const intent: AuthIntent = data.intent === "signup" ? "signup" : "login";

    if (!phone || !/^\d{6}$/.test(code)) {
      return { ok: false, error: "Enter the 6-digit verification code." };
    }

    if (intent === "signup" && data.termsAccepted !== true) {
      return {
        ok: false,
        error: "Accept the 1LV terms and privacy policy to create an account.",
      };
    }

    const verified = await verifyTakatakPhoneOtp(phone, code);
    if (!verified.ok) {
      return {
        ok: false,
        error: verified.error,
        setupRequired: verified.setupRequired,
      };
    }

    const identity = verified.identity;
    if (identity.phone !== phone) {
      return {
        ok: false,
        error: "Verified identity does not match this phone number.",
      };
    }

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: linkedProfile, error: linkedProfileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, takatak_person_id")
        .eq("takatak_person_id", identity.id)
        .maybeSingle();

    if (linkedProfileError) {
      return { ok: false, error: "Could not resolve your 1LV account." };
    }

    const expectedUserId: string | null = linkedProfile?.id ?? null;
    let loginEmail: string;

    if (expectedUserId) {
      const { data: existingUser, error } =
        await supabaseAdmin.auth.admin.getUserById(expectedUserId);

      if (error || !existingUser.user?.email) {
        return { ok: false, error: "Could not resolve your 1LV account." };
      }

      loginEmail = existingUser.user.email;
    } else {
      // The TAKATAK identity UUID is the cross-application key.
      // A master email must never silently merge into an unrelated 1LV user.
      loginEmail = syntheticIdentityEmail(identity.id);
    }

    const displayName = identityDisplayName(identity);
    const localMetadata: Record<string, string | boolean> = {
      phone: identity.phone,
      auth_source: "takatak",
      takatak_person_id: identity.id,
      ...(displayName ? { display_name: displayName } : {}),
    };

    if (intent === "signup") {
      const acceptedAt = new Date().toISOString();
      localMetadata["terms_accepted_at"] = acceptedAt;
      localMetadata["privacy_accepted_at"] = acceptedAt;
      localMetadata["marketing_opt_in"] = data.marketingOptIn === true;
    }

    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: loginEmail,
        options: { data: localMetadata },
      });

    const tokenHash = linkData.properties?.hashed_token?.trim() ?? "";
    const linkUserId = linkData.user?.id ?? "";

    if (linkError || !tokenHash || !linkUserId) {
      return { ok: false, error: "Could not start your 1LV session." };
    }

    if (expectedUserId && linkUserId !== expectedUserId) {
      return {
        ok: false,
        error: "Your verified identity conflicts with another 1LV account.",
      };
    }

    const { data: currentProfile, error: currentProfileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, takatak_person_id")
        .eq("id", linkUserId)
        .maybeSingle();

    if (currentProfileError || !currentProfile) {
      return { ok: false, error: "Could not link your 1LV profile." };
    }

    if (
      currentProfile.takatak_person_id &&
      currentProfile.takatak_person_id !== identity.id
    ) {
      return {
        ok: false,
        error: "Your 1LV account is linked to another master identity.",
      };
    }

    const profileUpdate: {
      takatak_person_id: string;
      display_name?: string;
      locale?: string;
    } = {
      takatak_person_id: identity.id,
    };

    if (displayName) profileUpdate.display_name = displayName;
    if (identity.locale && ["en", "fr", "es"].includes(identity.locale)) {
      profileUpdate.locale = identity.locale;
    }

    const { error: linkProfileError } = await supabaseAdmin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", linkUserId);

    if (linkProfileError) {
      return {
        ok: false,
        error:
          linkProfileError.code === "23505"
            ? "This TAKATAK identity is already linked to another 1LV account."
            : "Could not link your 1LV profile.",
      };
    }

    try {
      const { queueCustomerEvent } = await import(
        "@/lib/takatak/outbox.server"
      );
      await queueCustomerEvent(
        linkUserId,
        expectedUserId ? "customer.updated" : "customer.created",
      );
    } catch {
      // The verified login remains valid even if asynchronous master sync
      // cannot be queued on this request.
    }

    return { ok: true, tokenHash };
  });
