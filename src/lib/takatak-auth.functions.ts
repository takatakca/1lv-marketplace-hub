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
  .inputValidator((data: { phone: string }) => data)
  .handler(async ({ data }): Promise<PhoneActionResult> => {
    const phone = validCanadianPhone(data.phone ?? "");
    if (!phone) {
      return { ok: false, error: "Enter a valid Canadian phone number." };
    }

    const result = await requestTakatakPhoneOtp(phone);
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
  .inputValidator((data: { phone: string; code: string }) => data)
  .handler(async ({ data }): Promise<PhoneLoginResult> => {
    const phone = validCanadianPhone(data.phone ?? "");
    const code = (data.code ?? "").trim();

    if (!phone || !/^\d{6}$/.test(code)) {
      return { ok: false, error: "Enter the 6-digit verification code." };
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

    let loginEmail: string | null = null;
    let expectedUserId: string | null = linkedProfile?.id ?? null;

    if (expectedUserId) {
      const { data, error } =
        await supabaseAdmin.auth.admin.getUserById(expectedUserId);

      if (error || !data.user?.email) {
        return { ok: false, error: "Could not resolve your 1LV account." };
      }

      loginEmail = data.user.email;
    } else {
      loginEmail =
        identity.email ??
        syntheticIdentityEmail(identity.id);
    }

    const displayName = identityDisplayName(identity);
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: loginEmail,
        options: {
          data: {
            ...(displayName ? { display_name: displayName } : {}),
            phone: identity.phone,
            auth_source: "takatak",
          },
        },
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
      await queueCustomerEvent(linkUserId, "customer.updated");
    } catch {
      // The verified login remains valid even if asynchronous master sync
      // cannot be queued on this request.
    }

    return { ok: true, tokenHash };
  });
