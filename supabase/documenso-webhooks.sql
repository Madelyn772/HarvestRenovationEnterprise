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

-- Only active portal users may read/mark webhooks. The serverless handler inserts
-- with the service_role key, which bypasses RLS — so there is deliberately NO
-- anon INSERT policy. A public INSERT policy would let anyone with the anon key
-- forge a "signed" webhook and auto-approve estimates / sign invoices.
DROP POLICY IF EXISTS "portal read documenso webhooks" ON public.documenso_webhooks;
CREATE POLICY "portal read documenso webhooks" ON public.documenso_webhooks
  FOR SELECT USING (public.is_active_user());

DROP POLICY IF EXISTS "portal update documenso webhooks" ON public.documenso_webhooks;
CREATE POLICY "portal update documenso webhooks" ON public.documenso_webhooks
  FOR UPDATE USING (public.is_active_user()) WITH CHECK (public.is_active_user());

-- Remove any previously-created permissive anon INSERT policy (security fix).
DROP POLICY IF EXISTS "service insert documenso webhooks" ON public.documenso_webhooks;
