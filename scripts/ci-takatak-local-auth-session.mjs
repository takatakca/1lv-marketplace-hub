import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_LOCAL_URL?.trim() ?? "";
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY?.trim() ?? "";
const serviceRoleKey =
  process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY?.trim() ?? "";

assert.ok(url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:"), "Local Supabase URL required");
assert.ok(anonKey.length > 20, "Local anon key required");
assert.ok(serviceRoleKey.length > 20, "Local service-role key required");

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const publicClient = () =>
  createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const masterId = "11111111-1111-4111-8111-111111111111";
const localEmail = `takatak.${masterId}@auth.1lv.ca`;
const directEmail = "direct-local-auth-bypass@example.invalid";
const fakeMasterId = "33333333-3333-4333-8333-333333333333";
const fakeSyntheticEmail = `takatak.${fakeMasterId}@auth.1lv.ca`;
const password = "CiOnly-1LV-Password-Guard!2026";

function decodePayload(token) {
  const part = token.split(".")[1];
  assert.ok(part, "JWT payload is missing");
  const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function authMethods(payload) {
  return new Set(
    (Array.isArray(payload.amr) ? payload.amr : [])
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object" && typeof entry.method === "string") {
          return entry.method;
        }
        return null;
      })
      .filter(Boolean),
  );
}

async function profileVisible(accessToken, userId) {
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client
    .from("profiles")
    .select("id, display_name")
    .eq("id", userId);

  if (error) {
    throw new Error(`Profile RLS query failed unexpectedly: ${error.message}`);
  }
  return Array.isArray(data) && data.some((row) => row.id === userId);
}


async function hasRole(accessToken, userId, role) {
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("has_role", {
    _user_id: userId,
    _role: role,
  });
  if (error) {
    throw new Error(`has_role RPC failed unexpectedly: ${error.message}`);
  }
  return data === true;
}

async function deleteByEmail(email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    const found = data.users.filter(
      (user) => user.email?.trim().toLowerCase() === email.toLowerCase(),
    );
    for (const user of found) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
      if (deleteError) throw deleteError;
    }
    if (data.users.length < 1000) break;
  }
}

await deleteByEmail(localEmail);
await deleteByEmail(directEmail);
await deleteByEmail(fakeSyntheticEmail);

let takatakUserId = null;
let fakeSyntheticUserId = null;
try {
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: localEmail,
      email_confirm: true,
      app_metadata: {
        auth_source: "takatak",
        takatak_person_id: masterId,
      },
      user_metadata: {
        display_name: "CI TAKATAK User",
      },
    });

  assert.equal(createError, null, createError?.message);
  assert.ok(created.user?.id, "TAKATAK local Auth user was not created");
  takatakUserId = created.user.id;

  const { data: link, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: localEmail,
    });
  assert.equal(linkError, null, linkError?.message);

  const tokenHash = link.properties?.hashed_token?.trim() ?? "";
  assert.ok(tokenHash, "Magic-link token hash was not generated");

  const magicClient = publicClient();
  const { data: verified, error: verifyError } =
    await magicClient.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });

  assert.equal(verifyError, null, verifyError?.message);
  assert.ok(verified.session?.access_token, "Magic-link session missing");
  assert.equal(verified.user?.id, takatakUserId);

  const magicPayload = decodePayload(verified.session.access_token);
  const magicMethods = authMethods(magicPayload);
  assert.equal(magicPayload.app_metadata?.auth_source, "takatak");
  assert.equal(magicPayload.app_metadata?.takatak_person_id, masterId);
  assert.equal(String(magicPayload.email ?? "").toLowerCase(), localEmail);
  assert.ok(
    magicMethods.has("magiclink") || magicMethods.has("otp"),
    `Unexpected magic-link AMR: ${JSON.stringify([...magicMethods])}`,
  );

  const magicSessionId =
    typeof magicPayload.session_id === "string" ? magicPayload.session_id : "";
  assert.match(
    magicSessionId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "Magic-link session_id missing",
  );

  // A valid synthetic email + immutable app_metadata + magic-link AMR is not
  // enough. Until the trusted TAKATAK bridge records this exact session_id,
  // direct local Supabase Auth must remain unusable.
  assert.equal(
    await profileVisible(verified.session.access_token, takatakUserId),
    false,
    "Direct magic-link session must be denied before TAKATAK session grant",
  );
  assert.equal(
    await hasRole(verified.session.access_token, takatakUserId, "customer"),
    false,
    "Direct magic-link session must not reach SECURITY DEFINER role helpers before grant",
  );

  const { error: grantError } = await admin
    .from("takatak_authorized_sessions")
    .insert({
      session_id: magicSessionId,
      user_id: takatakUserId,
      takatak_person_id: masterId,
    });
  assert.equal(grantError, null, grantError?.message);

  assert.equal(
    await profileVisible(verified.session.access_token, takatakUserId),
    true,
    "Server-granted TAKATAK magic-link session must pass restrictive RLS",
  );
  assert.equal(
    await hasRole(verified.session.access_token, takatakUserId, "customer"),
    true,
    "Server-granted TAKATAK session must be allowed to use private role helper",
  );

  const { data: refreshed, error: refreshError } =
    await magicClient.auth.refreshSession({
      refresh_token: verified.session.refresh_token,
    });
  assert.equal(refreshError, null, refreshError?.message);
  assert.ok(refreshed.session?.access_token, "Refreshed session missing");
  const refreshedPayload = decodePayload(refreshed.session.access_token);
  assert.equal(
    refreshedPayload.session_id,
    magicSessionId,
    "Refresh must preserve the authorized Supabase session_id",
  );
  assert.equal(
    await profileVisible(refreshed.session.access_token, takatakUserId),
    true,
    "Refreshed granted TAKATAK session must remain authorized",
  );

  const { error: passwordSetError } =
    await admin.auth.admin.updateUserById(takatakUserId, { password });
  assert.equal(passwordSetError, null, passwordSetError?.message);

  const passwordClient = publicClient();
  const { data: passwordLogin, error: passwordLoginError } =
    await passwordClient.auth.signInWithPassword({
      email: localEmail,
      password,
    });
  assert.equal(passwordLoginError, null, passwordLoginError?.message);
  assert.ok(passwordLogin.session?.access_token, "Password session missing");

  const passwordMethods = authMethods(
    decodePayload(passwordLogin.session.access_token),
  );
  assert.ok(
    passwordMethods.has("password"),
    `Expected password AMR, got: ${JSON.stringify([...passwordMethods])}`,
  );
  assert.equal(
    await profileVisible(passwordLogin.session.access_token, takatakUserId),
    false,
    "Direct local password session must be denied by restrictive RLS",
  );
  assert.equal(
    await hasRole(passwordLogin.session.access_token, takatakUserId, "customer"),
    false,
    "Direct password session must also be denied by SECURITY DEFINER helpers",
  );

  const directClient = publicClient();
  const { data: directSignup, error: directSignupError } =
    await directClient.auth.signUp({
      email: directEmail,
      password,
    });
  assert.ok(
    directSignupError || !directSignup.user,
    "Direct local Supabase signup must remain disabled",
  );

  // A service-side/local user that merely LOOKS like a TAKATAK synthetic
  // account is still unauthorized unless immutable app_metadata binds it to
  // the verified GROUPE TAKATAK master identity.
  const { data: fakeCreated, error: fakeCreateError } =
    await admin.auth.admin.createUser({
      email: fakeSyntheticEmail,
      email_confirm: true,
    });
  assert.equal(fakeCreateError, null, fakeCreateError?.message);
  assert.ok(fakeCreated.user?.id, "Fake synthetic local user was not created");
  fakeSyntheticUserId = fakeCreated.user.id;

  const { data: fakeLink, error: fakeLinkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: fakeSyntheticEmail,
    });
  assert.equal(fakeLinkError, null, fakeLinkError?.message);
  const fakeTokenHash = fakeLink.properties?.hashed_token?.trim() ?? "";
  assert.ok(fakeTokenHash, "Fake synthetic magic-link token hash missing");

  const fakeClient = publicClient();
  const { data: fakeVerified, error: fakeVerifyError } =
    await fakeClient.auth.verifyOtp({
      type: "magiclink",
      token_hash: fakeTokenHash,
    });
  assert.equal(fakeVerifyError, null, fakeVerifyError?.message);
  assert.ok(fakeVerified.session?.access_token, "Fake synthetic session missing");
  assert.equal(
    await profileVisible(
      fakeVerified.session.access_token,
      fakeSyntheticUserId,
    ),
    false,
    "Synthetic email without immutable TAKATAK app_metadata must be denied",
  );

  console.log("TAKATAK local Auth / real JWT / RLS integration: PASS");
} finally {
  if (takatakUserId) {
    await admin.auth.admin.deleteUser(takatakUserId);
  }
  if (fakeSyntheticUserId) {
    await admin.auth.admin.deleteUser(fakeSyntheticUserId);
  }
  await deleteByEmail(directEmail);
  await deleteByEmail(fakeSyntheticEmail);
}
