import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

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
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; error: string; setupRequired?: boolean };

type AuthIntent = "login" | "signup";

const SIGNUP_CONSENT_REVISION = "1lv-terms-privacy-effective-2026-09-30";
const MARKETING_CONSENT_REVISION = "1lv-casl-opt-in-2026-10-01";

type RequestPhoneCodeInput = {
  phone: string;
  intent?: AuthIntent;
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

function takatakAppMetadata(identityId: string) {
  return {
    auth_source: "takatak",
    takatak_person_id: identityId,
  };
}

function appMetadataMatchesIdentity(
  metadata: Record<string, unknown> | null | undefined,
  identityId: string,
): boolean {
  return (
    metadata?.["auth_source"] === "takatak" &&
    metadata?.["takatak_person_id"] === identityId
  );
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

    const intent: AuthIntent = data.intent === "signup" ? "signup" : "login";

    const fullName = (data.fullName ?? "").trim().slice(0, 200) || null;
    const requestedLanguage = (data.preferredLanguage ?? "").trim().toLowerCase();
    const preferredLanguage = ["en", "fr", "es"].includes(requestedLanguage)
      ? requestedLanguage
      : null;

    const result = await requestTakatakPhoneOtp(
      phone,
      {
        fullName,
        preferredLanguage,
      },
      intent,
    );
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

    if (intent === "login" && expectedUserId) {
      const { data: consent, error: consentReadError } = await supabaseAdmin
        .from("profile_consent_events")
        .select("id")
        .eq("profile_id", expectedUserId)
        .eq("takatak_person_id", identity.id)
        .eq("terms_accepted", true)
        .eq("privacy_accepted", true)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (consentReadError) {
        return {
          ok: false,
          error: "Could not verify your 1LV account setup.",
        };
      }

      if (!consent) {
        return {
          ok: false,
          error:
            "Your verified identity is linked to 1LV, but account setup is incomplete. Use Create an account to accept the current terms and finish setup.",
        };
      }
    }

    const loginEmail = syntheticIdentityEmail(identity.id);
    const displayName = identityDisplayName(identity);
    const localMetadata: Record<string, string | boolean> = {
      phone: identity.phone,
      ...(displayName ? { display_name: displayName } : {}),
    };

    if (intent === "signup") {
      const acceptedAt = new Date().toISOString();
      localMetadata["terms_accepted_at"] = acceptedAt;
      localMetadata["privacy_accepted_at"] = acceptedAt;
      localMetadata["marketing_opt_in"] = data.marketingOptIn === true;
    }

    const immutableAppMetadata = takatakAppMetadata(identity.id);
    let createdUserId: string | null = null;

    if (expectedUserId) {
      const { data: existingUser, error: existingUserError } =
        await supabaseAdmin.auth.admin.getUserById(expectedUserId);

      if (existingUserError || !existingUser.user) {
        return { ok: false, error: "Could not resolve your 1LV account." };
      }

      const existingAppMetadata =
        (existingUser.user.app_metadata ?? {}) as Record<string, unknown>;
      const existingMasterId = existingAppMetadata["takatak_person_id"];
      const existingAuthSource = existingAppMetadata["auth_source"];

      if (
        (typeof existingMasterId === "string" &&
          existingMasterId !== identity.id) ||
        (typeof existingAuthSource === "string" &&
          existingAuthSource !== "takatak")
      ) {
        return {
          ok: false,
          error: "Your 1LV account is linked to another authentication authority.",
        };
      }

      const { data: promotedUser, error: promoteError } =
        await supabaseAdmin.auth.admin.updateUserById(expectedUserId, {
          email: loginEmail,
          email_confirm: true,
          app_metadata: {
            ...existingAppMetadata,
            ...immutableAppMetadata,
          },
          user_metadata: {
            ...(existingUser.user.user_metadata ?? {}),
            ...localMetadata,
          },
        });

      if (
        promoteError ||
        !promotedUser.user ||
        promotedUser.user.id !== expectedUserId ||
        promotedUser.user.email?.trim().toLowerCase() !==
          loginEmail.toLowerCase() ||
        !appMetadataMatchesIdentity(
          promotedUser.user.app_metadata as Record<string, unknown>,
          identity.id,
        )
      ) {
        return {
          ok: false,
          error: "Could not bind your local 1LV session to GROUPE TAKATAK.",
        };
      }
    } else {
      // Create the local 1LV Auth user explicitly only after GROUPE TAKATAK
      // verified the phone. The immutable authorization marker is stored in
      // app_metadata, which browser users cannot edit.
      const { data: createdUser, error: createUserError } =
        await supabaseAdmin.auth.admin.createUser({
          email: loginEmail,
          email_confirm: true,
          app_metadata: immutableAppMetadata,
          user_metadata: localMetadata,
        });

      if (createUserError) {
        const duplicateCodes = new Set(["email_exists", "user_already_exists"]);
        if (!duplicateCodes.has(createUserError.code ?? "")) {
          return {
            ok: false,
            error: "Could not safely initialize your 1LV account.",
          };
        }

        // A duplicate can be a legitimate retry/race, but the deterministic
        // synthetic email must already belong to THIS exact TAKATAK identity.
        const targetEmail = loginEmail.toLowerCase();
        let existingUser:
          | {
              id: string;
              email?: string;
              email_confirmed_at?: string | null;
              app_metadata?: Record<string, unknown>;
            }
          | null = null;

        for (let page = 1; page <= 100; page += 1) {
          const { data: listed, error: listError } =
            await supabaseAdmin.auth.admin.listUsers({
              page,
              perPage: 1000,
            });

          if (listError) {
            return {
              ok: false,
              error: "Could not safely resolve your existing 1LV account.",
            };
          }

          existingUser =
            listed.users.find(
              (user) => user.email?.trim().toLowerCase() === targetEmail,
            ) ?? null;

          if (existingUser || listed.users.length < 1000) break;
        }

        if (
          !existingUser ||
          !existingUser.email_confirmed_at ||
          !appMetadataMatchesIdentity(existingUser.app_metadata, identity.id)
        ) {
          return {
            ok: false,
            error: "Could not safely resolve your existing 1LV account.",
          };
        }

        createdUserId = existingUser.id;
      } else if (
        createdUser.user?.id &&
        createdUser.user.email?.trim().toLowerCase() ===
          loginEmail.toLowerCase() &&
        appMetadataMatchesIdentity(
          createdUser.user.app_metadata as Record<string, unknown>,
          identity.id,
        )
      ) {
        createdUserId = createdUser.user.id;
      } else {
        return {
          ok: false,
          error: "Could not safely initialize your 1LV account.",
        };
      }
    }

    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: loginEmail,
      });

    const tokenHash = linkData.properties?.hashed_token?.trim() ?? "";
    const linkUserId = linkData.user?.id ?? "";
    const linkEmail = linkData.user?.email?.trim().toLowerCase() ?? "";
    const linkAppMetadata =
      (linkData.user?.app_metadata ?? {}) as Record<string, unknown>;

    if (
      linkError ||
      !tokenHash ||
      !linkUserId ||
      linkEmail !== loginEmail.toLowerCase() ||
      !appMetadataMatchesIdentity(linkAppMetadata, identity.id)
    ) {
      return { ok: false, error: "Could not start your 1LV session." };
    }

    if (expectedUserId && linkUserId !== expectedUserId) {
      return {
        ok: false,
        error: "Your verified identity conflicts with another 1LV account.",
      };
    }

    if (createdUserId && linkUserId !== createdUserId) {
      return {
        ok: false,
        error: "Could not safely initialize your 1LV account.",
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

    // Exchange the one-time local magic-link on the trusted server. The
    // browser never performs the bootstrap exchange directly, which lets 1LV
    // record the exact Supabase session_id that was created only after TAKATAK
    // phone verification succeeded.
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabasePublishableKey) {
      return {
        ok: false,
        error: "Local 1LV session service is not configured.",
        setupRequired: true,
      };
    }

    const exchangeClient = createClient(
      supabaseUrl,
      supabasePublishableKey,
      {
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: localAuth, error: localAuthError } =
      await exchangeClient.auth.verifyOtp({
        type: "magiclink",
        token_hash: tokenHash,
      });

    const localSession = localAuth.session;
    if (
      localAuthError ||
      !localSession?.access_token ||
      !localSession.refresh_token
    ) {
      return {
        ok: false,
        error: "Could not establish your verified 1LV session.",
      };
    }

    const { data: claimData, error: claimError } =
      await exchangeClient.auth.getClaims(localSession.access_token);
    const claims =
      (claimData?.claims ?? {}) as Record<string, unknown>;
    const sessionId =
      typeof claims["session_id"] === "string"
        ? claims["session_id"]
        : "";
    const sessionUserId =
      typeof claims["sub"] === "string" ? claims["sub"] : "";
    const sessionEmail =
      typeof claims["email"] === "string"
        ? claims["email"].trim().toLowerCase()
        : "";
    const sessionAppMetadata =
      claims["app_metadata"] &&
      typeof claims["app_metadata"] === "object" &&
      !Array.isArray(claims["app_metadata"])
        ? (claims["app_metadata"] as Record<string, unknown>)
        : {};
    const authMethods = new Set(
      (Array.isArray(claims["amr"]) ? claims["amr"] : [])
        .map((entry) =>
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? (entry as Record<string, unknown>)["method"]
            : null,
        )
        .filter((method): method is string => typeof method === "string"),
    );

    if (
      claimError ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        sessionId,
      ) ||
      sessionUserId !== linkUserId ||
      sessionEmail !== loginEmail.toLowerCase() ||
      !appMetadataMatchesIdentity(sessionAppMetadata, identity.id) ||
      (!authMethods.has("magiclink") && !authMethods.has("otp")) ||
      authMethods.has("password") ||
      authMethods.has("oauth") ||
      authMethods.has("recovery")
    ) {
      await exchangeClient.auth.signOut();
      return {
        ok: false,
        error: "Could not validate your verified 1LV session.",
      };
    }

    const { error: grantError } = await supabaseAdmin
      .from("takatak_authorized_sessions" as never)
      .insert({
        session_id: sessionId,
        user_id: linkUserId,
        takatak_person_id: identity.id,
      } as never);

    if (grantError) {
      await exchangeClient.auth.signOut();
      return {
        ok: false,
        error: "Could not authorize your verified 1LV session.",
      };
    }

    return {
      ok: true,
      accessToken: localSession.access_token,
      refreshToken: localSession.refresh_token,
    };
  });
