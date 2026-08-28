-- Shared company data — Option A "single JSON record" cloud sync.
-- The whole portal data store (clients, leads, estimates, invoices, jobs,
-- calendar, notes, campaigns, documents, trash, checklist, reservedNumbers,
-- activity) is kept as ONE JSON blob in a single shared row (id = 1), so every
-- field is preserved with no column mapping and all team members share it.
--
-- Run this once in Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS public.portal_shared_data (
  id INT PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  CONSTRAINT portal_shared_data_single_row CHECK (id = 1)
);

-- Seed the single shared row.
INSERT INTO public.portal_shared_data (id, data)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.portal_shared_data ENABLE ROW LEVEL SECURITY;

-- Only ACTIVE team members can read or write the shared company data.
-- (public.is_active_user() is defined in portal-core-bootstrap.sql and returns
-- true only when the caller's profile status = 'active'.) This blocks pending
-- and denied accounts — which are still `authenticated` — from reading or
-- overwriting the entire company JSON blob via a direct API call.
DROP POLICY IF EXISTS "authenticated read shared data" ON public.portal_shared_data;
DROP POLICY IF EXISTS "active read shared data" ON public.portal_shared_data;
CREATE POLICY "active read shared data" ON public.portal_shared_data
  FOR SELECT TO authenticated USING (public.is_active_user());

DROP POLICY IF EXISTS "authenticated write shared data" ON public.portal_shared_data;
DROP POLICY IF EXISTS "active write shared data" ON public.portal_shared_data;
CREATE POLICY "active write shared data" ON public.portal_shared_data
  FOR ALL TO authenticated
  USING (public.is_active_user())
  WITH CHECK (public.is_active_user());

-- Enable realtime so teammates see each other's changes live.
-- (Safe to run even if the table is already in the publication.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'portal_shared_data'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.portal_shared_data;
  END IF;
END $$;
