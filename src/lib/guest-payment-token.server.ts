const TOKEN_TTL_SECONDS = 24 * 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function tokenSecret() {
  const secret =
    process.env.CHECKOUT_GUEST_TOKEN_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error(
      "Missing CHECKOUT_GUEST_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return secret;
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(tokenSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return bytesToHex(signature);
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export async function createGuestPaymentToken(orderId: string) {
  if (!UUID_RE.test(orderId)) throw new Error("Invalid guest order id");
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${orderId}.${expiresAt}`;
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function verifyGuestPaymentToken(
  token: string | null | undefined,
  orderId: string,
) {
  if (!token || !UUID_RE.test(orderId)) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [tokenOrderId, expiryRaw, suppliedSignature] = parts;
  if (tokenOrderId !== orderId || !suppliedSignature) return false;

  const expiresAt = Number(expiryRaw);
  if (!Number.isSafeInteger(expiresAt)) return false;
  if (expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const payload = `${tokenOrderId}.${expiresAt}`;
  const expectedSignature = await sign(payload);
  return constantTimeEqual(expectedSignature, suppliedSignature);
}
