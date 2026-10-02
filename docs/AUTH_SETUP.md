# Authentication architecture — 1LV.CA

## Canonical rule

**GROUPE TAKATAK is the master identity, authentication and OTP authority.**

1LV is an independent marketplace. It owns its catalog, vendors, carts,
orders, checkout, Stripe operations, payouts and marketplace rules. It does
not authenticate users independently and it never reads another TAKATAK child
application.

The only allowed cross-system direction is:

**1LV → GROUPE TAKATAK → 1LV**

Never:

**1LV → another child application**

## Sign-in flow

1. The browser submits a Canadian mobile number to a 1LV server function.
2. The 1LV server calls the TAKATAK master API with the server-only
   TAKATAK_1LV_API_KEY.
3. TAKATAK sends and verifies the SMS through its shared Supabase Phone Auth.
4. TAKATAK returns only the verified master identity fields authorized for the
   1LV bridge.
5. 1LV links that master UUID to profiles.takatak_person_id.
6. 1LV creates a short-lived local magic-link token solely to establish the
   1LV Supabase session required by RLS.
7. The browser exchanges that token for the local 1LV session.

The local Supabase session is **not** a second identity authority.

## New account flow

The 1LV signup screen collects:

- full name;
- verified Canadian mobile number;
- acceptance of 1LV terms/privacy;
- optional 1LV marketing consent, off by default.

The OTP bridge is phone-only. An unverified email is never sent to TAKATAK
Phone Auth and never becomes a master identity key. Name and locale may enrich
the verified master identity only after Supabase confirms the exact phone and
Auth user; they are never used to merge identities.

Login and signup are separate operations. Login OTP uses
`shouldCreateUser: false`; only an explicit signup may create a TAKATAK Auth
user. A linked 1LV account cannot complete login until server-side 1LV
Terms/Privacy consent evidence exists.

For a new 1LV local auth user, 1LV uses a synthetic local email derived from
the TAKATAK master identity UUID. A TAKATAK email address is never used as an
implicit local account-merge key.

1LV stores signup consent in `public.profile_consent_events`. Browser roles
cannot read or forge this audit evidence. The table is append-only through the
service-role Data API: no UPDATE or DELETE privilege is granted. Legal
Terms/Privacy revision and optional marketing-consent revision are recorded
separately.

## Authentication methods prohibited inside 1LV

Application code must not call its own Supabase project for:

- signInWithPassword;
- signUp;
- signInWithOAuth;
- signInWithOtp;
- resetPasswordForEmail;
- password updates through updateUser.

The legacy Google/password components are removed. The old password-reset
routes remain only as informational redirects to the verified-phone flow.

Run npm run check:architecture to enforce this boundary. CI and deployment
also run this check automatically.

## Server-only production configuration

1LV requires:

- TAKATAK_MASTER_API_URL;
- TAKATAK_1LV_API_KEY;
- TAKATAK_DRAIN_CRON_SECRET;
- SUPABASE_URL;
- SUPABASE_SERVICE_ROLE_KEY;
- the normal 1LV public Supabase publishable configuration.

None of the master API key, Supabase service-role key, OTP code, session
credential or provider secret may be exposed to the browser or stored in a
TAKATAK event payload.

## Master API contract used by 1LV

- POST /v1/auth/otp/send
- POST /v1/auth/otp/verify
- POST /v1/identity/resolve-person
- POST /v1/identity/resolve-merchant
- POST /v1/events

Successful OTP responses must identify the authority as
takatak_supabase_phone.

## Data isolation

1LV keeps only the local foreign key needed to associate its profile with the
master identity. It does not receive TAKATAK-wide relationship data.

A 1LV vendor/customer cannot discover that the same person uses another
company unless GROUPE TAKATAK explicitly introduces a future permissioned
contract for that exact purpose.

## Production gate

Before production activation:

1. apply the TAKATAK master bridge migration to the exact TAKATAK production
   database;
2. configure TAKATAK Supabase Phone Auth/SMS;
3. configure the same dedicated master API credential on TAKATAK and the 1LV
   server;
4. apply the 1LV migrations only to project odoybkshqszucvoxzjyz;
5. run the Supabase Security Advisor and RLS tests;
6. run one real phone OTP end-to-end;
7. confirm profiles.takatak_person_id links to the returned master identity;
8. verify one outbox event reaches TAKATAK idempotently;
9. verify 1LV checkout/orders remain available even if TAKATAK event delivery
   is temporarily unavailable.

This document supersedes the former direct 1LV password, Google OAuth and
local OTP setup.
