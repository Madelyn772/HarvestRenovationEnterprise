-- Documenso webhook inbox.
-- The api/documenso-webhook.js serverless function inserts a row here whenever
-- Documenso reports a document as signed/completed. The portal polls this table
-- (see modules/documenso.js) and auto-marks the matching estimate "Approved" or
-- invoice "Paid", then sets processed = true.
--
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.documenso_webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id TEXT,
  status TEXT,
  signer_email TEXT,
  signed_at TIMESTAMPTZ,
  document_title TEXT,
  raw_payload JSONB,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- If the table already exists without the processed column, add it.
ALTER TABLE public.documenso_webhooks
  ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT false;

ALTER TABLE public.documenso_webhooks ENABLE ROW LEVEL SECURITY;

-- The portal (anon key) polls for unprocessed webhooks and marks them processed.
DROP POLICY IF EXISTS "portal read documenso webhooks" ON public.documenso_webhooks;
CREATE POLICY "portal read documenso webhooks" ON public.documenso_webhooks
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "portal update documenso webhooks" ON public.documenso_webhooks;
CREATE POLICY "portal update documenso webhooks" ON public.documenso_webhooks
  FOR UPDATE USING (true) WITH CHECK (true);

-- Inserts come from the serverless webhook handler using the service_role key,
-- which bypasses RLS. This explicit policy is a harmless belt-and-suspenders.
DROP POLICY IF EXISTS "service insert documenso webhooks" ON public.documenso_webhooks;
CREATE POLICY "service insert documenso webhooks" ON public.documenso_webhooks
  FOR INSERT WITH CHECK (true);
