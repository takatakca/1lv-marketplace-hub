-- GROUPE TAKATAK is the sole authority for the cross-application identity link.
-- Browser roles may read/edit normal 1LV profile fields, but they may never
-- read, insert or mutate profiles.takatak_person_id.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_takatak_person_id_uuid;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_takatak_person_id_uuid
  CHECK (
    takatak_person_id IS NULL
    OR takatak_person_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );

REVOKE SELECT, INSERT, UPDATE ON TABLE public.profiles
FROM anon, authenticated;

GRANT SELECT (
  id,
  display_name,
  avatar_url,
  locale,
  country,
  created_at,
  updated_at
) ON public.profiles TO anon, authenticated;

GRANT INSERT (
  id,
  display_name,
  avatar_url,
  locale,
  country
) ON public.profiles TO authenticated;

GRANT UPDATE (
  display_name,
  avatar_url,
  locale,
  country
) ON public.profiles TO authenticated;

GRANT ALL ON TABLE public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.protect_takatak_profile_identity_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  trusted boolean;
BEGIN
  trusted :=
    session_user IN ('postgres', 'supabase_admin')
    OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role';

  IF NOT trusted THEN
    IF TG_OP = 'INSERT' AND NEW.takatak_person_id IS NOT NULL THEN
      RAISE EXCEPTION 'TAKATAK master identity link is server-managed'
        USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.takatak_person_id IS DISTINCT FROM OLD.takatak_person_id THEN
      RAISE EXCEPTION 'TAKATAK master identity link is server-managed'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_takatak_identity
ON public.profiles;

CREATE TRIGGER profiles_protect_takatak_identity
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_takatak_profile_identity_link();

CREATE OR REPLACE FUNCTION public.get_1lv_schema_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT '20261001202000';
$$;

REVOKE ALL ON FUNCTION public.get_1lv_schema_version()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_1lv_schema_version()
TO service_role;
