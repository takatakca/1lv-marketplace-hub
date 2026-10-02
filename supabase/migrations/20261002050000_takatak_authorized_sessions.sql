-- Bind every usable 1LV authenticated session to an explicit server-side
-- authorization grant created only after GROUPE TAKATAK phone verification.
--
-- This closes the remaining local-auth bypass where a direct Supabase
-- magic-link for an existing synthetic user would otherwise have the same AMR
-- method as the bridge-generated local session.

CREATE TABLE public.takatak_authorized_sessions (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  takatak_person_id uuid NOT NULL,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT takatak_authorized_sessions_user_master_unique
    UNIQUE (session_id, user_id, takatak_person_id)
);

CREATE INDEX takatak_authorized_sessions_user_idx
  ON public.takatak_authorized_sessions(user_id, authorized_at DESC);

ALTER TABLE public.takatak_authorized_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.takatak_authorized_sessions
FROM PUBLIC, anon, authenticated, service_role;

GRANT ALL ON TABLE public.takatak_authorized_sessions
TO service_role;

-- Keep the global authenticated-table invariant explicit. Browser roles still
-- have no table privileges; the policy is defense in depth only.
CREATE POLICY "TAKATAK authenticated sessions only"
ON public.takatak_authorized_sessions
AS RESTRICTIVE
FOR ALL
TO authenticated
USING ((select public.is_takatak_authorized_session()))
WITH CHECK ((select public.is_takatak_authorized_session()));

CREATE OR REPLACE FUNCTION public.is_takatak_authorized_session()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $authorized_session$
  WITH claims AS (
    SELECT auth.jwt() AS jwt
  ),
  normalized AS (
    SELECT
      COALESCE(jwt ->> 'sub', '') AS subject_id,
      COALESCE(jwt ->> 'session_id', '') AS session_id,
      COALESCE(jwt ->> 'email', '') AS email,
      COALESCE(jwt -> 'app_metadata' ->> 'auth_source', '') AS auth_source,
      COALESCE(jwt -> 'app_metadata' ->> 'takatak_person_id', '') AS master_id,
      COALESCE(jwt -> 'amr', '[]'::jsonb) AS amr
    FROM claims
  )
  SELECT
    auth.uid() IS NOT NULL
    AND subject_id = auth.uid()::text
    AND auth_source = 'takatak'
    AND master_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
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
    AND EXISTS (
      SELECT 1
      FROM public.takatak_authorized_sessions AS authorized
      WHERE authorized.session_id::text = session_id
        AND authorized.user_id = auth.uid()
        AND authorized.takatak_person_id::text = master_id
        AND authorized.revoked_at IS NULL
    )
  FROM normalized;
$authorized_session$;

REVOKE ALL ON FUNCTION public.is_takatak_authorized_session()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_takatak_authorized_session()
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $schema_version$
  SELECT '20261002050000';
$schema_version$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
