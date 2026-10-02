-- Server-authoritative 1LV signup consent evidence.
-- GROUPE TAKATAK remains identity authority; consent for 1LV legal documents
-- stays owned by 1LV and is never inferred from mutable Auth metadata.

CREATE TABLE public.profile_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  takatak_person_id uuid NOT NULL,
  consent_revision text NOT NULL,
  terms_accepted boolean NOT NULL,
  privacy_accepted boolean NOT NULL,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  marketing_consent_revision text,
  source text NOT NULL DEFAULT '1lv_signup',
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_consent_events_terms_required
    CHECK (terms_accepted),
  CONSTRAINT profile_consent_events_privacy_required
    CHECK (privacy_accepted),
  CONSTRAINT profile_consent_events_revision_required
    CHECK (length(btrim(consent_revision)) > 0),
  CONSTRAINT profile_consent_events_marketing_revision
    CHECK (
      (NOT marketing_opt_in AND marketing_consent_revision IS NULL)
      OR (
        marketing_opt_in
        AND marketing_consent_revision IS NOT NULL
        AND length(btrim(marketing_consent_revision)) > 0
      )
    ),
  CONSTRAINT profile_consent_events_source_required
    CHECK (length(btrim(source)) > 0)
);

CREATE INDEX profile_consent_events_profile_captured_idx
ON public.profile_consent_events(profile_id, captured_at DESC);

CREATE INDEX profile_consent_events_takatak_person_idx
ON public.profile_consent_events(takatak_person_id, captured_at DESC);

ALTER TABLE public.profile_consent_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profile_consent_events
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT ON TABLE public.profile_consent_events
TO service_role;

-- ---------------------------------------------------------------------------
-- GROUPE TAKATAK local-session authority.
--
-- A Supabase user/session existing inside the 1LV project is NOT sufficient.
-- Browser access is authorized only when:
--   1. immutable app_metadata says the session belongs to GROUPE TAKATAK,
--   2. the master UUID matches the deterministic local synthetic email, and
--   3. the session originated from our local magic-link/OTP exchange, never
--      password/OAuth/recovery/direct signup.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_takatak_authorized_session()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $
  WITH claims AS (
    SELECT auth.jwt() AS jwt
  ),
  normalized AS (
    SELECT
      COALESCE(jwt ->> 'email', '') AS email,
      COALESCE(jwt -> 'app_metadata' ->> 'auth_source', '') AS auth_source,
      COALESCE(jwt -> 'app_metadata' ->> 'takatak_person_id', '') AS master_id,
      COALESCE(jwt -> 'amr', '[]'::jsonb) AS amr
    FROM claims
  )
  SELECT
    auth.uid() IS NOT NULL
    AND auth_source = 'takatak'
    AND master_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '20261001214500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;

    AND lower(email) = 'takatak.' || lower(master_id) || '@auth.1lv.ca'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(amr) AS entry
      WHERE entry ->> 'method' IN ('magiclink', 'otp')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(amr) AS entry
      WHERE entry ->> 'method' IN (
        'password',
        'oauth',
        'recovery',
        'invite',
        'sso/saml',
        'email/signup',
        'email_change',
        'anonymous'
      )
    )
  FROM normalized;
$;

REVOKE ALL ON FUNCTION public.is_takatak_authorized_session()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_takatak_authorized_session()
TO authenticated, service_role;

-- A direct local Supabase signup must never bootstrap a usable 1LV profile.
-- The server-side TAKATAK bridge creates auth.users only after phone
-- verification and writes these immutable raw_app_meta_data fields.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $
DECLARE
  master_id text :=
    COALESCE(NEW.raw_app_meta_data ->> 'takatak_person_id', '');
  auth_source text :=
    COALESCE(NEW.raw_app_meta_data ->> 'auth_source', '');
  expected_email text;
BEGIN
  expected_email := 'takatak.' || lower(master_id) || '@auth.1lv.ca';

  IF auth_source <> 'takatak'
     OR master_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '20261001214500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;

     OR lower(COALESCE(NEW.email, '')) <> expected_email THEN
    RAISE EXCEPTION
      '1LV Auth users must be provisioned through GROUPE TAKATAK'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data ->> 'avatar_url'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');

  RETURN NEW;
END;
$;

REVOKE ALL ON FUNCTION public.handle_new_user()
FROM PUBLIC, anon, authenticated;

-- Defense in depth for every browser-accessible public table that already has
-- RLS enabled. Existing permissive policies still define row ownership/roles,
-- while this restrictive policy is AND-ed with them for authenticated users.
DO $
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      'TAKATAK authenticated sessions only',
      target.schema_name,
      target.table_name
    );

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((select public.is_takatak_authorized_session())) WITH CHECK ((select public.is_takatak_authorized_session()))',
      'TAKATAK authenticated sessions only',
      target.schema_name,
      target.table_name
    );
  END LOOP;
END;
$;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '20261001214500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
