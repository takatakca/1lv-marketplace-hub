-- GROUPE TAKATAK is the sole authentication authority for 1LV browser sessions.
-- A valid local Supabase user is not sufficient: every authenticated database
-- request must carry immutable TAKATAK app_metadata and the deterministic
-- synthetic local email created only after TAKATAK phone verification.

CREATE OR REPLACE FUNCTION public.is_takatak_authorized_session()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
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
  ),
  methods AS (
    SELECT
      CASE
        WHEN jsonb_typeof(entry) = 'string' THEN entry #>> '{}'
        WHEN jsonb_typeof(entry) = 'object' THEN entry ->> 'method'
        ELSE NULL
      END AS method
    FROM normalized,
    LATERAL jsonb_array_elements(amr) AS entry
  )
  SELECT
    auth.uid() IS NOT NULL
    AND auth_source = 'takatak'
    AND master_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND lower(email) =
      'takatak.' || lower(master_id) || '@auth.1lv.ca'
    AND EXISTS (
      SELECT 1
      FROM methods
      WHERE method IN ('magiclink', 'otp')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM methods
      WHERE method IN (
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
$$;

REVOKE ALL ON FUNCTION public.is_takatak_authorized_session()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_takatak_authorized_session()
TO authenticated, service_role;

-- Reject direct local Supabase user creation at the auth.users trigger boundary.
-- Server-side TAKATAK provisioning writes immutable raw_app_meta_data first.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  master_id text :=
    COALESCE(NEW.raw_app_meta_data ->> 'takatak_person_id', '');
  auth_source text :=
    COALESCE(NEW.raw_app_meta_data ->> 'auth_source', '');
  expected_email text;
BEGIN
  expected_email :=
    'takatak.' || lower(master_id) || '@auth.1lv.ca';

  IF auth_source <> 'takatak'
     OR master_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
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
$$;

REVOKE ALL ON FUNCTION public.handle_new_user()
FROM PUBLIC, anon, authenticated;

-- Defense in depth for every current public table with RLS enabled.
-- Existing permissive policies continue to define row ownership and roles.
-- This restrictive policy is AND-ed with those rules only for authenticated
-- browser users. anon and service_role behavior is unchanged.
DO $$
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
$$;

-- Final production compatibility marker. The public health endpoint refuses
-- readiness until this exact migration has been applied to the exact 1LV DB.
CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '20261002034500';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
