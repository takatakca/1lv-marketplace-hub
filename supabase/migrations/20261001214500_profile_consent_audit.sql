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
