import { state, money, num, uid, autoNumber, todayISO, sortDateDesc } from './state.js';
import { el, escapeHtml, emptyHtml, deleteBtn, showToast, openPrintWindow } from './dom.js';
import { addActivity, saveStore } from './store.js';
import { renderAll } from './navigation.js';
import { buildReceiptDocHtml } from './pdf.js';
import { saveDocument, renderDocuments } from './documents.js';

function invoiceBalance(invoice) {
  const total = num(invoice.total != null ? invoice.total : (invoice.items || []).reduce((s, it) => s + num(it && it.amount), 0));
  const paid = (invoice.payments || []).reduce((s, p) => s + num(p && p.amount), 0);
  return { total, paid, balance: total - paid };
}

function createReceipt(invoice, amount, method, date, type, balanceRemaining, previouslyPaid, note) {
  const receipt = {
    id: uid('RCT'),
    receiptNumber: autoNumber('RCT'),
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber || invoice.id,
    clientId: invoice.clientId || '',
    clientName: invoice.clientName || '',
    amountReceived: num(amount),
    paymentMethod: method || 'Check',
    paymentDate: date || todayISO(),
    paymentType: type || 'Progress',
    previouslyPaid: num(previouslyPaid),
    balanceRemaining: num(balanceRemaining),
    total: num(invoice.total),
    notes: (note || '').trim(),
    issuedBy: state.profile?.full_name || '',
    createdAt: new Date().toISOString()
  };
  state.store.receipts.unshift(receipt);
  const html = buildReceiptDocHtml(receipt);
  saveDocument('receipt', receipt.receiptNumber, receipt.clientName, receipt.amountReceived, html, receipt.issuedBy);
  return { receipt, html };
}

// Record a payment on an invoice and ALWAYS issue a numbered receipt.
export function recordPayment(invoiceId, { amount, method, date, type, note } = {}) {
  const invoice = state.store.invoices.find(i => i.id === invoiceId);
  if (!invoice) return null;
  const amt = num(amount);
  if (amt <= 0) { showToast('Enter a payment amount greater than 0.', 'error'); return null; }
  const before = invoiceBalance(invoice);
  invoice.payments = invoice.payments || [];
  const typeNote = type ? `${type} payment` : '';
  invoice.payments.push({ id: uid('PAY'), date: date || todayISO(), amount: amt, method: method || 'Check', reference: '', note: [typeNote, (note || '').trim()].filter(Boolean).join(' — ') });
  const after = invoiceBalance(invoice);
  if (after.total > 0 && after.balance <= 0.01) { invoice.status = 'Paid'; invoice.paidAt = new Date().toISOString(); }
  else if (after.paid > 0 && after.paid < after.total && invoice.status !== 'Draft') invoice.status = 'Partial';
  const { html } = createReceipt(invoice, amt, method, date, type, after.balance, before.paid, note);
  addActivity(`Recorded ${money.format(amt)} payment on ${invoice.invoiceNumber || invoice.id}.`, 'Billing');
  saveStore('Payment recorded');
  renderAll();
  openPrintWindow(html);
  showToast('Payment recorded — receipt generated and saved to Documents.', 'success');
  return invoice.id;
}

// Mark an invoice paid without auto-generating a receipt (offer it on demand).
export function markPaid(invoiceId, { method = 'Check', date } = {}) {
  const invoice = state.store.invoices.find(i => i.id === invoiceId);
  if (!invoice) return null;
  const { balance } = invoiceBalance(invoice);
  if (balance > 0.01) {
    invoice.payments = invoice.payments || [];
    invoice.payments.push({ id: uid('PAY'), date: date || todayISO(), amount: balance, method, reference: '', note: 'Marked paid' });
  }
  invoice.status = 'Paid';
  invoice.paidAt = new Date().toISOString();
  addActivity(`Marked ${invoice.invoiceNumber || invoice.id} paid.`, 'Billing');
  saveStore('Invoice marked paid');
  renderAll();
  showToast('Invoice marked paid. Use "Generate Receipt" to issue a receipt.', 'success');
  return invoice.id;
}

// On-demand receipt for a paid invoice (full amount).
export function generateReceiptForInvoice(invoiceId) {
  const invoice = state.store.invoices.find(i => i.id === invoiceId);
  if (!invoice) return;
  const { total, paid, balance } = invoiceBalance(invoice);
  const { html } = createReceipt(invoice, paid, 'Check', todayISO(), balance <= 0.01 ? 'Full' : 'Progress', balance, 0);
  saveStore('Receipt generated');
  renderAll();
  openPrintWindow(html);
  showToast('Receipt generated and saved to Documents.', 'success');
}

export function openPaymentDialog(invoiceId) {
  const invoice = state.store.invoices.find(i => i.id === invoiceId);
  if (!invoice) return;
  const dlg = document.getElementById('recordPaymentDialog');
  if (!dlg) return;
  const { balance } = invoiceBalance(invoice);
  dlg.dataset.invoiceId = invoice.id;
  const form = dlg.querySelector('form');
  form.amount.value = (balance > 0 ? balance : 0).toFixed(2);
  form.method.value = 'Check';
  form.type.value = balance <= 0.01 ? 'Final' : 'Progress';
  form.date.value = todayISO();
  dlg.showModal();
}

export function handlePaymentDialogSubmit(event) {
  event.preventDefault();
  const dlg = document.getElementById('recordPaymentDialog');
  if (!dlg) return;
  const invoiceId = dlg.dataset.invoiceId;
  const form = dlg.querySelector('form');
  dlg.close();
  recordPayment(invoiceId, { amount: form.amount.value, method: form.method.value, date: form.date.value, type: form.type.value, note: form.note ? form.note.value : '' });
}

export function renderReceipts() {
  const wrap = document.getElementById('receiptList');
  if (!wrap) return;
  const items = [...state.store.receipts].sort((a, b) => sortDateDesc(a.createdAt, b.createdAt));
  wrap.innerHTML = items.length ? items.map(r => {
    return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(r.receiptNumber || r.id)}</h4><p>${escapeHtml(r.clientName || '')} • Invoice ${escapeHtml(r.invoiceNumber || '')} • ${escapeHtml(r.paymentType || '')}</p></div><strong>${money.format(num(r.amountReceived))}</strong></div><div class="form-actions"><button class="ghost-btn receipt-print" data-receipt-id="${r.id}">Print</button>${deleteBtn('receipts', r.id)}</div></div>`;
  }).join('') : emptyHtml('No receipts yet. Record a payment to issue one.');
  wrap.querySelectorAll('.receipt-print').forEach(b => b.addEventListener('click', () => {
    const r = state.store.receipts.find(x => x.id === b.dataset.receiptId);
    if (r) openPrintWindow(buildReceiptDocHtml(r));
  }));
}
