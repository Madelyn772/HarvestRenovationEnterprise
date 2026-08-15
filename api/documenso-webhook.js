// api/documenso-webhook.js
// Receives webhooks from Documenso when a document is signed/completed and
// records them in Supabase so the portal can auto-mark estimates "Approved"
// and invoices "Paid" (the portal polls the documenso_webhooks table).
//
// Deploy: place in `api/` at the project root (Vercel serverless function at
// /api/documenso-webhook). Point your Documenso webhook at this URL.
//
// Required environment variables (set in your hosting dashboard):
//   SUPABASE_URL          — your Supabase project URL
//   SUPABASE_SERVICE_KEY  — the Supabase service_role key (NEVER the anon key,
//                           and never exposed in the browser)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body || {};
    console.log('Documenso webhook received:', JSON.stringify(payload));

    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from('documenso_webhooks').insert({
        document_id: payload.documentId || payload.id || '',
        status: payload.status || 'COMPLETED',
        signer_email: payload.signerEmail || payload.signer?.email || '',
        signed_at: payload.signedAt || new Date().toISOString(),
        document_title: payload.title || payload.documentTitle || '',
        raw_payload: payload,
        created_at: new Date().toISOString()
      });
    }

    // Always return 200 so Documenso does not retry.
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(200).json({ received: true, error: err.message });
  }
}
