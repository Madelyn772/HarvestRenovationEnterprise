-- Company-wide backup history for the shared portal JSON store.
-- Run after portal-core-bootstrap.sql and portal-shared-data.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.portal_backups (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  record_count JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portal_backups_user_created_idx
  ON public.portal_backups (user_id, created_at DESC);

ALTER TABLE public.portal_shared_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read shared data" ON public.portal_shared_data;
DROP POLICY IF EXISTS "authenticated write shared data" ON public.portal_shared_data;
DROP POLICY IF EXISTS "active read shared data" ON public.portal_shared_data;
DROP POLICY IF EXISTS "active write shared data" ON public.portal_shared_data;

CREATE POLICY "active read shared data" ON public.portal_shared_data
  FOR SELECT TO authenticated
  USING (public.is_active_user());

CREATE POLICY "active write shared data" ON public.portal_shared_data
  FOR ALL TO authenticated
  USING (public.is_active_user())
  WITH CHECK (public.is_active_user());

DROP POLICY IF EXISTS "active team read backups" ON public.portal_backups;
DROP POLICY IF EXISTS "active user insert backups" ON public.portal_backups;
DROP POLICY IF EXISTS "owner or admin delete backups" ON public.portal_backups;

CREATE POLICY "active team read backups" ON public.portal_backups
  FOR SELECT TO authenticated
  USING (public.is_active_user());

CREATE POLICY "active user insert backups" ON public.portal_backups
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_user() AND user_id = auth.uid());

CREATE POLICY "owner or admin delete backups" ON public.portal_backups
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_user());

REVOKE ALL ON public.portal_shared_data FROM anon;
REVOKE ALL ON public.portal_backups FROM anon;
REVOKE ALL ON SEQUENCE public.portal_backups_id_seq FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_shared_data TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.portal_backups TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.portal_backups_id_seq TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_record_count(store_data JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_object_agg(entry.key, jsonb_array_length(entry.value)),
    '{}'::jsonb
  )
  FROM jsonb_each(COALESCE(store_data, '{}'::jsonb)) AS entry
  WHERE jsonb_typeof(entry.value) = 'array';
$$;

CREATE OR REPLACE FUNCTION public.create_portal_backup(
  store_data JSONB,
  force_create BOOLEAN DEFAULT FALSE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  backup_id BIGINT;
BEGIN
  IF caller_id IS NULL OR NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Active authentication required';
  END IF;

  IF NOT force_create AND EXISTS (
    SELECT 1
    FROM public.portal_backups
    WHERE created_at >= NOW() - INTERVAL '60 seconds'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.portal_backups (user_id, data, record_count)
  VALUES (caller_id, store_data, public.portal_record_count(store_data))
  RETURNING id INTO backup_id;

  DELETE FROM public.portal_backups
  WHERE created_at < NOW() - INTERVAL '30 days';

  RETURN backup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_portal_backup(JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_portal_backup(JSONB, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.capture_previous_portal_store()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.create_portal_backup(OLD.data, FALSE);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not capture portal backup: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_previous_portal_store ON public.portal_shared_data;
CREATE TRIGGER capture_previous_portal_store
  BEFORE UPDATE ON public.portal_shared_data
  FOR EACH ROW EXECUTE FUNCTION public.capture_previous_portal_store();

COMMIT;