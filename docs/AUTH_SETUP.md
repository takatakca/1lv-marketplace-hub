# Authentication setup — 1LV.CA

This project uses **Supabase Auth** (via Lovable Cloud). The app supports:

- Email + password
- Google OAuth (one-tap "Continue with Google")
- Phone / SMS OTP (Canadian +1 numbers)
- Password reset via email link

The UI gracefully handles providers that are not yet enabled — users see a
clear "not configured" notice instead of a broken state.

---

## 1. Email + password
Enabled by default. No setup needed.

Recommended hardening in **Cloud → Users → Auth Settings**:

- Turn on **Confirm email** (default ON).
- Turn on **Password HIBP check** (rejects leaked passwords).
- Set minimum password length to **8+**.

The app already enforces:

- Strength meter on signup
- `minLength=8` on the field
- Toast errors on weak passwords

---

## 2. Google OAuth

The "Continue with Google" buttons on `/login` and `/signup` call
`supabase.auth.signInWithOAuth({ provider: "google" })`.

**Enable Google in Cloud:**

1. Open **Cloud → Users → Auth Settings → Sign-in methods**.
2. Toggle **Google** ON.
3. Lovable Cloud ships with **managed Google credentials** — no key needed
   for development / preview.
4. (Optional) Add **your own** Google OAuth Client ID + Secret for production
   branding. In Google Cloud Console:
   - Create an **OAuth 2.0 Client ID** (Web application).
   - Authorized JavaScript origins:
     - `https://onelovevision.lovable.app`
     - `https://1lv.ca` (when the custom domain is live)
     - `http://localhost:8080` (local dev)
   - Authorized redirect URI (copy from Cloud's Google settings — it looks like):
     `https://odoybkshqszucvoxzjyz.supabase.co/auth/v1/callback`

**Redirect after sign-in:** The app passes
`redirectTo: ${window.location.origin}/account` (or `/role-select` from
signup). Make sure these are in **Cloud → Users → URL configuration →
Redirect URLs**:

- `https://onelovevision.lovable.app/account`
- `https://onelovevision.lovable.app/role-select`
- `https://1lv.ca/account`
- `https://1lv.ca/role-select`
- preview/dev wildcards as needed

---

## 3. Phone / SMS OTP

The "Phone (SMS)" tab on `/login` calls
`supabase.auth.signInWithOtp({ phone })` and then
`supabase.auth.verifyOtp({ phone, token, type: "sms" })`.

**Enable phone auth in Cloud:**

1. Open **Cloud → Users → Auth Settings → Sign-in methods**.
2. Toggle **Phone** ON.
3. Choose an SMS provider and enter its credentials:
   - **Twilio** (recommended for Canada): Account SID, Auth Token, Message
     Service SID, and a Twilio number that can SMS Canada.
   - or **MessageBird**, **Vonage**, **Textlocal**.
4. Save.

**Format:** the app formats Canadian numbers as `+1XXXXXXXXXX` automatically.
10-digit input or 11-digit `1XXXXXXXXXX` is accepted.

**Cost note:** SMS is **not free**. Twilio charges per message; Canadian
A2P/long-code is usually a few cents per OTP. Set Twilio spend limits.

Until phone is enabled, the UI shows: *"Phone OTP not configured yet. See
docs/AUTH_SETUP.md."*

---

## 4. Password reset

- Public route `/forgot-password` calls
  `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`.
- Public route `/reset-password` calls `supabase.auth.updateUser({ password })`.

Make sure `<origin>/reset-password` is in the Redirect URLs list above for
every domain you use.

---

## 5. Account-type step

After signup the user lands on `/role-select`:

- "Shop as customer" → `/account`
- "Sell as vendor" → `/vendor/onboarding`

The vendor role is granted later by the existing `vendor.onboarding` flow
(creates the `vendors` row + role).

---

## 6. Local / preview / production URLs

| Environment | Origin |
| --- | --- |
| Local dev | `http://localhost:8080` |
| Lovable preview | `https://id-preview--deec4249-153f-4f4a-8a40-79e457dc6c83.lovable.app` |
| Published | `https://onelovevision.lovable.app` |
| Production custom domain | `https://1lv.ca` |

Add **every** origin you actually use to:

- **Cloud → Users → URL configuration → Site URL** (canonical production)
- **Cloud → Users → URL configuration → Redirect URLs** (all of them)

If Google sign-in opens then redirects to an error page, 99% of the time the
fix is "add this exact origin to Redirect URLs."

---

## 7. What still requires Cloud dashboard configuration

- ✅ Code is ready
- ⚠️ Enable **Google** provider in Cloud (one toggle)
- ⚠️ Enable **Phone** provider + SMS credentials in Cloud (Twilio recommended)
- ⚠️ Add production redirect URLs once `1lv.ca` is live
- ⚠️ Optional: HIBP password check, MFA enforcement

Nothing in this list breaks the app if skipped — the UI degrades gracefully.
