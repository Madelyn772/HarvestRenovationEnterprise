import { state, config, autoNumber, currentUserName } from './state.js';
import { el, showToast, openPrintWindow, escapeHtml } from './dom.js';
import { saveStore } from './store.js';
import { buildEstimateDocHtml, buildInvoiceDocHtml } from './pdf.js';
import { saveDocument, renderDocuments } from './documents.js';
import { renderEstimates } from './estimating.js';
import { renderInvoices, fillInvoiceFromEstimate } from './operations.js';
import { renderDashboard } from './dashboard.js';

// Documenso is "configured" only when the placeholder URLs have been replaced
// with real ones. This keeps the Send flow and webhook polling dormant (no
// failed network calls / console noise) until setup is complete.
function isDocumensoConfigured() {
  const url = config.apiMiddlewareUrl || '';
  return !!url && !/your-|example\.com|your-portal-api-url/i.test(url);
}

// ── Send estimate via Documenso API ──
export async function sendEstimate(estimate) {
  // Auto-advance Draft → Sent
  if (!estimate.status || estimate.status === 'Draft') {
    estimate.status = 'Sent';
    const idx = state.store.estimates.findIndex(e => e.id === estimate.id);
    if (idx >= 0) state.store.estimates[idx] = estimate;
    saveStore('Estimate marked as Sent');
  }

  const clientPhone = el.estimateClientPhone ? el.estimateClientPhone.value : '';
  const clientEmail = estimate.billingEmail || '';

  if (!isDocumensoConfigured()) {
    showToast('Documenso isn\u2019t set up yet, so this estimate was saved and opened for manual sending.', 'info');
    return manualEstimateFallback(estimate);
  }

  showToast('Sending estimate to client for e-signature\u2026', 'info');

  try {
    const response = await fetch(config.apiMiddlewareUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'estimate',
        templateId: config.documensoTemplateId,
        documensoUrl: config.documensoApiUrl,
        clientName: estimate.clientName,
        clientEmail,
        clientPhone,
        documentTitle: `Estimate ${estimate.estimateNumber || estimate.id} \u2014 Harvest Renovation`,
        documentData: {
          estimateNumber: estimate.estimateNumber || estimate.id,
          clientName: estimate.clientName,
          trade: estimate.trade || '',
          estimatedCost: estimate.estimatedCost || 0,
          depositAmount: estimate.depositAmount || 0,
          date: estimate.date || '',
          items: estimate.items || []
        },
        html: buildEstimateDocHtml(estimate)
      })
    });

    const result = await response.json();
    if (result.success) {
      showToast('Estimate sent to client for e-signature. They will receive an email shortly.', 'success');
      renderEstimates();
      renderDashboard();
    } else {
      throw new Error(result.error || 'Failed to send');
    }
  } catch (err) {
    console.error('Documenso send error:', err);
    showToast('Could not send via Documenso. Saved and opened for manual sending instead.', 'error');
    manualEstimateFallback(estimate);
  }
}

function manualEstimateFallback(estimate) {
  const html = buildEstimateDocHtml(estimate);
  saveDocument('estimate', estimate.estimateNumber || estimate.id || autoNumber('EST'), estimate.clientName, estimate.estimatedCost, html, estimate.user || currentUserName());
  renderDocuments();
  renderEstimates();
  openPrintWindow(html);
  if (config.documensoUrl && !/your-/i.test(config.documensoUrl)) window.open(config.documensoUrl, '_blank');
}

// ── Send invoice via Documenso API ──
export async function sendInvoice(invoice) {
  // Auto-advance Draft → Sent
  if (!invoice.status || invoice.status === 'Draft') {
    invoice.status = 'Sent';
    const idx = state.store.invoices.findIndex(i => i.id === invoice.id);
    if (idx >= 0) state.store.invoices[idx] = invoice;
    saveStore('Invoice marked as Sent');
  }

  const clientEmail = invoice.email || '';

  if (!isDocumensoConfigured()) {
    showToast('Documenso isn\u2019t set up yet, so this invoice was saved and opened for manual sending.', 'info');
    return manualInvoiceFallback(invoice);
  }

  showToast('Sending invoice to client for e-signature\u2026', 'info');

  try {
    const response = await fetch(config.apiMiddlewareUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'invoice',
        templateId: config.documensoTemplateId,
        documensoUrl: config.documensoApiUrl,
        clientName: invoice.clientName,
        clientEmail,
        clientPhone: invoice.phone || '',
        documentTitle: `Invoice ${invoice.invoiceNumber || invoice.id} \u2014 Harvest Renovation`,
        documentData: {
          invoiceNumber: invoice.invoiceNumber || invoice.id,
          clientName: invoice.clientName,
          total: invoice.total || 0,
          date: invoice.date || '',
          items: invoice.items || []
        },
        html: buildInvoiceDocHtml(invoice)
      })
    });

    const result = await response.json();
    if (result.success) {
      showToast('Invoice sent to client. They will receive an email shortly.', 'success');
      renderInvoices();
      renderDashboard();
    } else {
      throw new Error(result.error || 'Failed to send');
    }
  } catch (err) {
    console.error('Documenso send error:', err);
    showToast('Could not send via Documenso. Saved and opened for manual sending instead.', 'error');
    manualInvoiceFallback(invoice);
  }
}

function manualInvoiceFallback(invoice) {
  const html = buildInvoiceDocHtml(invoice);
  saveDocument('invoice', invoice.invoiceNumber || invoice.id || autoNumber('INV'), invoice.clientName, invoice.total, html, invoice.user || currentUserName());
  renderDocuments();
  renderInvoices();
  openPrintWindow(html);
  if (config.documensoUrl && !/your-/i.test(config.documensoUrl)) window.open(config.documensoUrl, '_blank');
}

// ── Status update helpers (used by the estimate/invoice list buttons) ──
const DECLINE_REASONS = [
  'Too expensive / went with cheaper bid',
  'Went with another contractor',
  'Decided not to do the project',
  'Timing — postponed / not ready',
  'No response / went silent',
  'Financing fell through',
  'Other'
];

// Small modal asking for a decline reason. Optional but encouraged: skipping or
// closing resolves with 'Unspecified'. Calls onDone(reason, otherText).
function promptDeclineReason(onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const optionsHtml = DECLINE_REASONS.map((r, i) => `
    <label class="decline-opt">
      <input type="radio" name="declineReason" value="${escapeHtml(r)}"${i === 0 ? ' checked' : ''} />
      <span>${escapeHtml(r)}</span>
    </label>`).join('');
  overlay.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="Decline reason">
      <div class="modal-head">
        <h3>Why was this estimate declined?</h3>
        <button type="button" class="modal-close" aria-label="Close">×</button>
      </div>
      <div class="decline-options">${optionsHtml}</div>
      <label class="decline-other-wrap is-hidden"><span>Tell us more</span><input type="text" class="decline-other" placeholder="Add a short note (optional)" /></label>
      <div class="modal-actions">
        <button type="button" class="ghost-btn decline-skip">Skip</button>
        <button type="button" class="danger-btn decline-confirm">Mark Declined</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const otherWrap = overlay.querySelector('.decline-other-wrap');
  const otherInput = overlay.querySelector('.decline-other');
  const selected = () => overlay.querySelector('input[name="declineReason"]:checked')?.value || 'Unspecified';
  const syncOther = () => {
    const isOther = selected() === 'Other';
    otherWrap.classList.toggle('is-hidden', !isOther);
    if (isOther) otherInput.focus();
  };
  overlay.querySelectorAll('input[name="declineReason"]').forEach(r => r.addEventListener('change', syncOther));

  let done = false;
  const finish = (reason, other) => {
    if (done) return;
    done = true;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    onDone(reason, other);
  };
  function onKey(e) { if (e.key === 'Escape') finish('Unspecified', ''); }
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.decline-confirm').addEventListener('click', () => {
    const reason = selected();
    finish(reason, reason === 'Other' ? (otherInput.value || '').trim() : '');
  });
  overlay.querySelector('.decline-skip').addEventListener('click', () => finish('Unspecified', ''));
  overlay.querySelector('.modal-close').addEventListener('click', () => finish('Unspecified', ''));
  overlay.addEventListener('click', e => { if (e.target === overlay) finish('Unspecified', ''); });
}

export function updateEstimateStatus(estimateId, newStatus) {
  const estimate = state.store.estimates.find(item => item.id === estimateId);
  if (!estimate) return;

  // Declining asks for a reason first (optional). The status only changes once
  // the modal resolves (via confirm, skip, close, or Escape → 'Unspecified').
  if (newStatus === 'Declined') {
    promptDeclineReason((reason, otherText) => {
      estimate.status = 'Declined';
      estimate.declineReason = reason || 'Unspecified';
      estimate.declineReasonOther = reason === 'Other' ? (otherText || '') : '';
      saveStore('Estimate marked as Declined');
      renderEstimates();
      renderDashboard();
      const shown = reason === 'Other' && otherText ? otherText : reason;
      showToast(`Estimate ${estimate.estimateNumber || estimate.id} declined${shown && shown !== 'Unspecified' ? ' — ' + shown : ''}.`, 'success');
    });
    return;
  }

  estimate.status = newStatus;
  // Reopening (or any non-declined status) clears the decline reason.
  if (newStatus !== 'Declined') {
    delete estimate.declineReason;
    delete estimate.declineReasonOther;
  }
  saveStore(`Estimate marked as ${newStatus}`);
  renderEstimates();
  renderDashboard();
  if (newStatus === 'Approved') {
    // Pre-fill an invoice from the approved estimate and switch to Invoicing —
    // but DO NOT save it. The user reviews, adds details, and clicks Save Invoice.
    fillInvoiceFromEstimate(estimateId, { switchView: true });
    showToast('Estimate approved. Invoice pre-filled — review and add details before saving.', 'info');
    return;
  }
  showToast(`Estimate ${estimate.estimateNumber || estimate.id} marked as ${newStatus}.`, 'success');
}

export function updateInvoiceStatus(invoiceId, newStatus) {
  const invoice = state.store.invoices.find(item => item.id === invoiceId);
  if (!invoice) return;
  invoice.status = newStatus;
  saveStore(`Invoice marked as ${newStatus}`);
  renderInvoices();
  renderDashboard();
  showToast(`Invoice ${invoice.invoiceNumber || invoice.id} marked as ${newStatus}.`, 'success');
}

// ── Documenso webhook polling (auto-mark Approved/Paid when the client signs) ──
async function pollDocumensoWebhooks() {
  try {
    if (!state.supabase || !config.supabaseUrl) return;

    const { data, error } = await state.supabase
      .from('documenso_webhooks')
      .select('*')
      .eq('processed', false)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error || !data || !data.length) return;

    for (const webhook of data) {
      const title = webhook.document_title || '';
      const docId = webhook.document_id || '';

      const estimate = state.store.estimates.find(e =>
        (e.estimateNumber && title.includes(e.estimateNumber)) || docId === e.documensoDocId
      );
      if (estimate && estimate.status === 'Sent') {
        estimate.status = 'Approved';
        estimate.signedAt = webhook.signed_at;
        estimate.signedBy = webhook.signer_email;
        saveStore('Estimate auto-approved via Documenso');
        renderEstimates();
        renderDashboard();
        showToast(`Estimate ${estimate.estimateNumber || estimate.id} signed \u2014 auto-marked Approved!`, 'success');
      }

      const invoice = state.store.invoices.find(i =>
        (i.invoiceNumber && title.includes(i.invoiceNumber)) || docId === i.documensoDocId
      );
      if (invoice && invoice.status === 'Sent') {
        invoice.status = 'Paid';
        invoice.paidAt = webhook.signed_at;
        saveStore('Invoice auto-marked Paid via Documenso');
        renderInvoices();
        renderDashboard();
        showToast(`Invoice ${invoice.invoiceNumber || invoice.id} signed \u2014 auto-marked Paid!`, 'success');
      }

      await state.supabase.from('documenso_webhooks').update({ processed: true }).eq('id', webhook.id);
    }
  } catch (err) {
    console.error('Webhook poll error:', err);
  }
}

// Only poll once Documenso is actually configured, to avoid noise before setup.
export function startDocumensoPolling() {
  if (!isDocumensoConfigured()) return;
  pollDocumensoWebhooks();
  setInterval(pollDocumensoWebhooks, 30000);
}
