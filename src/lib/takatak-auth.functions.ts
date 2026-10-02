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

const SIGNUP_CONSENT_REVISION = "1lv-terms-privacy-effective-2026-09-30";
const MARKETING_CONSENT_REVISION = "1lv-casl-opt-in-2026-10-01";

type RequestPhoneCodeInput = {
  phone: string;
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

    const fullName = (data.fullName ?? "").trim().slice(0, 200) || null;
    const requestedLanguage = (data.preferredLanguage ?? "").trim().toLowerCase();
    const preferredLanguage = ["en", "fr", "es"].includes(requestedLanguage)
      ? requestedLanguage
      : null;

    const result = await requestTakatakPhoneOtp(phone, {
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

    if (intent === "login" && !expectedUserId) {
      return {
        ok: false,
        error:
          "No 1LV account is linked to this verified identity. Create your 1LV account first.",
      };
    }

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

    if (intent === "signup") {
      const { error: consentError } = await supabaseAdmin
        .from("profile_consent_events")
        .insert({
          profile_id: linkUserId,
          takatak_person_id: identity.id,
          consent_revision: SIGNUP_CONSENT_REVISION,
          terms_accepted: true,
          privacy_accepted: true,
          marketing_opt_in: data.marketingOptIn === true,
          marketing_consent_revision:
            data.marketingOptIn === true ? MARKETING_CONSENT_REVISION : null,
          source: "1lv_signup",
        });

      if (consentError) {
        return {
          ok: false,
          error: "Could not record your 1LV signup consent.",
        };
      }
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
