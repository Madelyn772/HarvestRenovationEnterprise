// api/send-document.js
// Serverless function that holds the Documenso API key securely and forwards
// document-sending requests from the portal to Documenso.
//
// Deploy: place this in an `api/` folder at the project root. On Vercel it is
// auto-deployed as a serverless function at /api/send-document.
//
// Required environment variables (set in your hosting dashboard, NOT in code):
//   DOCUMENSO_API_KEY  — the API token generated in Documenso
//   DOCUMENSO_URL      — your Documenso base URL (e.g. https://harvest-documenso.up.railway.app)

const DOCUMENSO_API_KEY = process.env.DOCUMENSO_API_KEY;
const DOCUMENSO_URL = process.env.DOCUMENSO_URL || 'https://your-documenso-url.up.railway.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      type,          // 'estimate' or 'invoice'
      templateId,    // Documenso template ID
      clientName,
      clientEmail,
      clientPhone,
      documentTitle,
      documentData,
      html           // branded HTML (kept for the portal's own storage/fallback)
    } = req.body || {};

    if (!clientEmail && !clientPhone) {
      return res.status(400).json({ error: 'Client email or phone is required' });
    }
    if (!DOCUMENSO_API_KEY) {
      return res.status(500).json({ error: 'DOCUMENSO_API_KEY not configured' });
    }

    // Step 1 — create a document from the template
    const createRes = await fetch(`${DOCUMENSO_URL}/api/v2/document`, {
      method: 'POST',
      headers: {
        Authorization: DOCUMENSO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        templateId: parseInt(templateId, 10),
        title: documentTitle || 'Document for signature',
        recipients: [
          {
            email: clientEmail || 'noreply@harvestrenovation.net',
            name: clientName || 'Client',
            role: 'Client'
          }
        ],
        meta: documentData || {},
        externalId: documentData?.estimateNumber || documentData?.invoiceNumber || ''
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error('Documenso create error:', errText);
      return res.status(createRes.status).json({ error: `Documenso error: ${errText}` });
    }

    const docResult = await createRes.json();

    // Step 2 — send the document for signature (Documenso emails the client)
    const sendRes = await fetch(`${DOCUMENSO_URL}/api/v2/document/${docResult.id}/send`, {
      method: 'POST',
      headers: {
        Authorization: DOCUMENSO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sendEmail: true })
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      console.error('Documenso send error:', errText);
      return res.json({
        success: true,
        documentId: docResult.id,
        warning: 'Document created but send failed. Check the Documenso dashboard.'
      });
    }

    return res.json({
      success: true,
      documentId: docResult.id,
      recipientEmail: clientEmail,
      message: 'Document sent for signature via Documenso'
    });
  } catch (err) {
    console.error('API middleware error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
