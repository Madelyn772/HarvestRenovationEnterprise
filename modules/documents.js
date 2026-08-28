import { state, money, num, uid, currentUserName, sortDateDesc, formatDate, formatDateTime, objectFromForm } from './state.js';
import { el, escapeHtml, emptyHtml, openPrintWindow, showToast } from './dom.js';
import { upsertArray, saveStore, addActivity } from './store.js';
import { softDelete } from './trash.js';

export function saveDocument(type, number, clientName, total, html, preparedBy) {
  const kindLabel = type === 'invoice' ? 'Invoice' : type === 'contract' ? 'Contract' : 'Estimate';
  const title = `${kindLabel} ${number || ''}`.trim();
  const existing = state.store.documents.find(doc => doc.type === type && doc.number === number);
  const payload = {
    id: existing?.id || uid('DOC'),
    type,
    number: number || '',
    title,
    clientName: clientName || '',
    total: num(total),
    html,
    preparedBy: (preparedBy || existing?.preparedBy || currentUserName() || '').trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  upsertArray('documents', payload, 'id');
  saveStore('Document saved');
}

export function renderDocuments() {
  const filter = state.filters.documentType || 'all';
  const items = [...state.store.documents]
    .filter(doc => filter === 'all' || doc.type === filter)
    .sort((a, b) => sortDateDesc(a.updatedAt || a.createdAt, b.updatedAt || b.createdAt));
  el.documentList.innerHTML = items.length ? items.map(doc => {
    const badge = doc.type === 'invoice' ? 'Invoice' : (doc.type === 'estimate' ? 'Estimate' : (doc.type === 'contract' ? 'Contract' : 'Document'));
    const sourceTag = doc.uploaded ? '<span class="doc-source-tag">Uploaded</span>' : '';
    const preparedBy = doc.preparedBy ? `${doc.uploaded ? 'Added' : 'Prepared'} by ${doc.preparedBy}` : `${doc.uploaded ? 'Added' : 'Prepared'} by —`;
    const stamp = formatDateTime(doc.createdAt || doc.updatedAt);
    const info = escapeHtml(`${preparedBy}${stamp ? ` • ${stamp}` : ''}${doc.uploaded && doc.fileName ? ` • ${doc.fileName}` : ''}`);
    const openLabel = doc.uploaded ? 'Open' : 'Open / Print';
    return `<div class="stack-item doc-item"><div class="split-head"><div><h4>${escapeHtml(doc.title || badge)} ${sourceTag}</h4><p class="muted">${escapeHtml(badge)} • ${escapeHtml(doc.clientName || 'Client')} • ${escapeHtml(formatDate(doc.date || doc.updatedAt || doc.createdAt))}</p></div><div class="doc-head-right"><span class="doc-info" tabindex="0" role="img" aria-label="${info}" title="${info}">i</span><strong>${money.format(num(doc.total))}</strong></div></div><div class="form-actions"><button class="primary-btn doc-open" data-doc-id="${doc.id}">${openLabel}</button><button class="ghost-btn doc-download" data-doc-id="${doc.id}">Download</button><button class="danger-btn doc-delete" data-doc-id="${doc.id}">Delete</button></div></div>`;
  }).join('') : emptyHtml('No saved documents yet. Print an estimate or invoice, or upload a past document, to save it here.');
  el.documentList.querySelectorAll('.doc-open').forEach(btn => btn.addEventListener('click', () => {
    const doc = state.store.documents.find(item => item.id === btn.dataset.docId);
    if (!doc) return;
    if (doc.uploaded) openUploadedDocument(doc);
    else openPrintWindow(doc.html);
  }));
  el.documentList.querySelectorAll('.doc-download').forEach(btn => btn.addEventListener('click', () => {
    const doc = state.store.documents.find(item => item.id === btn.dataset.docId);
    if (!doc) return;
    if (doc.uploaded) downloadUploadedDocument(doc);
    else downloadDocument(doc);
  }));
  el.documentList.querySelectorAll('.doc-delete').forEach(btn => btn.addEventListener('click', () => softDelete('documents', btn.dataset.docId)));
}

export function downloadDocument(doc) {
  const blob = new Blob([doc.html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = String(doc.title || 'document').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  link.href = url;
  link.download = `${safeName || 'document'}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ===== Uploaded (legacy) documents =====
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB — keep browser storage safe.

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = String(dataUrl).split(',');
  const mime = (meta.match(/:(.*?);/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64 || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function openUploadedDocument(doc) {
  try {
    const url = URL.createObjectURL(dataUrlToBlob(doc.fileData));
    const win = window.open(url, '_blank');
    if (!win) showToast('Popup blocked. Please allow popups to open the file.', 'error');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    showToast('Could not open this file.', 'error');
  }
}

export function downloadUploadedDocument(doc) {
  try {
    const url = URL.createObjectURL(dataUrlToBlob(doc.fileData));
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.fileName || `${doc.title || 'document'}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    showToast('Could not download this file.', 'error');
  }
}

export function handleDocumentUpload(event) {
  event.preventDefault();
  const form = el.uploadDocForm;
  const file = el.uploadDocFile?.files?.[0];
  if (!file) {
    showToast('Choose a file to upload.', 'error');
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    showToast('That file is too large for browser storage. Please upload a file under 2 MB (compress the PDF or use a photo).', 'error');
    return;
  }
  const data = objectFromForm(form);
  const type = ['estimate', 'invoice', 'contract', 'other'].includes(data.type) ? data.type : 'other';
  const reader = new FileReader();
  reader.onload = () => {
    const number = (data.number || '').trim();
    const kindLabel = type === 'invoice' ? 'Invoice' : (type === 'contract' ? 'Contract' : (type === 'estimate' ? 'Estimate' : 'Document'));
    const payload = {
      id: uid('DOC'),
      type,
      uploaded: true,
      number,
      title: `${kindLabel} ${number || file.name}`.trim(),
      clientName: (data.clientName || '').trim(),
      total: num(data.total),
      date: data.date || '',
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileData: String(reader.result),
      preparedBy: currentUserName(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.store.documents.unshift(payload);
    // Persist immediately; if storage is full, roll back so existing data is safe.
    if (!saveStore('Document uploaded')) {
      state.store.documents = state.store.documents.filter(doc => doc.id !== payload.id);
      showToast('Not enough browser storage to save this file, so it was not uploaded. Try a smaller file or remove old documents.', 'error');
      return;
    }
    addActivity(`Uploaded ${type} document ${number || file.name}.`, 'Documents');
    saveStore();
    form.reset();
    renderDocuments();
    renderReservedNumbers();
    showToast('Document uploaded.', 'success');
  };
  reader.onerror = () => showToast('Could not read that file.', 'error');
  reader.readAsDataURL(file);
}

// ===== Reserved estimate/invoice number registry =====
export function renderReservedNumbers() {
  if (!el.reservedNumberList) return;
  const reserved = state.store.reservedNumbers || [];
  // Numbers reserved by hand (removable).
  const manualEntries = reserved.map(item => ({
    id: item.id,
    type: item.type === 'invoice' ? 'invoice' : 'estimate',
    number: String(item.number || '').trim(),
    note: item.note || '',
    source: 'manual',
    createdAt: item.createdAt
  }));
  // Numbers pulled automatically from uploaded estimate/invoice documents (read-only here).
  const uploadKeys = new Set();
  const uploadEntries = (state.store.documents || [])
    .filter(doc => doc.uploaded && (doc.type === 'estimate' || doc.type === 'invoice') && String(doc.number || '').trim())
    .map(doc => {
      const number = String(doc.number).trim();
      uploadKeys.add(`${doc.type}::${number.toLowerCase()}`);
      return {
        type: doc.type,
        number,
        note: doc.fileName ? `From uploaded file: ${doc.fileName}` : 'From uploaded document',
        source: 'upload',
        createdAt: doc.createdAt
      };
    });
  // Avoid showing a manual row and an upload row for the same number.
  const combined = uploadEntries.concat(
    manualEntries.filter(entry => !uploadKeys.has(`${entry.type}::${entry.number.toLowerCase()}`))
  ).sort((a, b) => sortDateDesc(a.createdAt, b.createdAt));

  // The registry is only relevant once outside/legacy documents are involved:
  // in-app estimates/invoices already can't duplicate. Show it only when there
  // are reserved numbers (from an upload or added by hand).
  if (el.reservedNumberCard) el.reservedNumberCard.classList.toggle('hidden', !combined.length);

  el.reservedNumberList.innerHTML = combined.length ? combined.map(item => {
    const label = item.type === 'invoice' ? 'Invoice' : 'Estimate';
    const control = item.source === 'manual'
      ? `<button type="button" class="ghost-btn danger-ghost reserved-remove" data-id="${escapeHtml(item.id)}">Remove</button>`
      : '<span class="doc-source-tag">Uploaded</span>';
    return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(item.number)}</h4><p class="muted">${escapeHtml(label)}${item.note ? ' • ' + escapeHtml(item.note) : ''}</p></div>${control}</div></div>`;
  }).join('') : emptyHtml('No reserved numbers yet.');
  el.reservedNumberList.querySelectorAll('.reserved-remove').forEach(btn => btn.addEventListener('click', () => removeReservedNumber(btn.dataset.id)));
}

export function handleReservedNumberAdd(event) {
  event.preventDefault();
  const data = objectFromForm(el.reservedNumberForm);
  const type = data.type === 'invoice' ? 'invoice' : 'estimate';
  const number = (data.number || '').trim();
  if (!number) {
    showToast('Enter a number to reserve.', 'error');
    return;
  }
  if (!Array.isArray(state.store.reservedNumbers)) state.store.reservedNumbers = [];
  const exists = state.store.reservedNumbers.some(row => row.type === type && String(row.number || '').trim().toLowerCase() === number.toLowerCase());
  if (exists) {
    showToast('That number is already registered.', 'info');
    return;
  }
  state.store.reservedNumbers.unshift({ id: uid('RNUM'), type, number, note: (data.note || '').trim(), createdAt: new Date().toISOString() });
  addActivity(`Reserved ${type} number ${number}.`, 'Documents');
  saveStore('Number reserved');
  el.reservedNumberForm.reset();
  renderReservedNumbers();
  showToast('Number reserved.', 'success');
}

export function removeReservedNumber(id) {
  state.store.reservedNumbers = (state.store.reservedNumbers || []).filter(row => row.id !== id);
  saveStore('Number removed');
  renderReservedNumbers();
  showToast('Reserved number removed.', 'success');
}
