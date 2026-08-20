import { money, num, formatDate, currentUserName, autoNumber, BRAND, BRAND_LOGO_PATH, DEFAULT_ESTIMATE_TERMS, DEFAULT_INVOICE_TERMS } from './state.js';
import { escapeHtml, openPrintWindow } from './dom.js';
import { saveDocument, renderDocuments } from './documents.js';

export function brandWheatSvg() {
  return `<svg class="wheat" width="46" height="56" viewBox="0 0 46 56" xmlns="http://www.w3.org/2000/svg" aria-label="Harvest Renovation">
    <path d="M23 54 V21" stroke="#caa05a" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <path d="M23 40 C13 36 11 30 12 23" stroke="#caa05a" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <path d="M23 40 C33 36 35 30 34 23" stroke="#caa05a" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <g fill="#d8ab63">
      <ellipse cx="23" cy="8" rx="3.1" ry="5.4"/>
      <ellipse cx="17.5" cy="13.5" rx="3.1" ry="5.4" transform="rotate(-30 17.5 13.5)"/>
      <ellipse cx="28.5" cy="13.5" rx="3.1" ry="5.4" transform="rotate(30 28.5 13.5)"/>
      <ellipse cx="16.5" cy="20" rx="3.1" ry="5.4" transform="rotate(-30 16.5 20)"/>
      <ellipse cx="29.5" cy="20" rx="3.1" ry="5.4" transform="rotate(30 29.5 20)"/>
      <ellipse cx="16.8" cy="26.5" rx="3" ry="5.2" transform="rotate(-30 16.8 26.5)"/>
      <ellipse cx="29.2" cy="26.5" rx="3" ry="5.2" transform="rotate(30 29.2 26.5)"/>
    </g>
  </svg>`;
}

// Render a scope string: bullet lines (- or *) become a <ul>, else plain text.
function scopeToHtml(scope) {
  if (!scope) return '';
  const lines = String(scope).split('\n').map(l => l.trim()).filter(Boolean);
  const hasBullets = lines.some(l => /^[-*]\s+/.test(l));
  if (hasBullets) {
    const lis = lines.map(l => `<li>${escapeHtml(l.replace(/^[-*]\s+/, ''))}</li>`).join('');
    return `<ul class="scope-list">${lis}</ul>`;
  }
  return escapeHtml(scope);
}

// Shared, branded estimate/invoice document modeled on the Harvest Renovation
// letterhead (black + gold, wheat mark, bill-to, line items, terms, signature).
export function buildBrandedDocHtml(opts) {
  const {
    kind = 'ESTIMATE', number = '', date = '', status = '',
    bill = {}, rows = [], scope = '', comments = '',
    balanceLabel = 'BALANCE DUE', balance = 0, balanceColor = '',
    depositPercent = 0, depositAmount = 0,
    validUntil = '', dueDate = '', preparedBy = '',
    subtotal = null, taxPercent = 0, taxAmount = 0, permitsFees = 0,
    paymentsReceived = 0, paymentsRows = [],
    terms = '', signatureBlockEnabled = false
  } = opts;
  const kindLabel = escapeHtml(kind);
  const billLines = [bill.name, bill.address, bill.phone, bill.email].filter(Boolean)
    .map(line => `<div>${escapeHtml(line)}</div>`).join('') || '<div class="muted">—</div>';
  const scopeBlock = scope ? `<div class="item-row scope"><div class="desc">${scopeToHtml(scope)}</div><div class="amt"></div></div>` : '';
  const itemRows = rows.map(r => {
    const descHtml = r.descHtml != null ? r.descHtml : escapeHtml(r.desc || '');
    return `<div class="item-row"><div class="desc">${descHtml}${r.subHtml || ''}</div><div class="amt">${r.amount == null ? '' : money.format(num(r.amount))}</div></div>`;
  }).join('');
  const depPct = num(depositPercent);
  const dep = depPct || 30;
  const depAmountText = num(depositAmount) ? ` (${money.format(num(depositAmount))})` : '';
  const statusBadge = (status && status.toLowerCase() !== 'draft')
    ? `<span class="status">${escapeHtml(status)}</span>`
    : '';
  const metaRows = [[`${kindLabel} No.`, escapeHtml(number || '—')], ['Date', escapeHtml(formatDate(date) || '—')]];
  if (validUntil) metaRows.push(['Valid until', escapeHtml(formatDate(validUntil))]);
  if (dueDate) metaRows.push(['Due date', escapeHtml(formatDate(dueDate))]);
  if (preparedBy) metaRows.push(['Prepared by', escapeHtml(preparedBy)]);
  const metaHtml = metaRows.map(([l, v]) => `<div class="mrow"><span class="ml">${l}</span><span class="mv">${v}</span></div>`).join('');
  const summaryRows = [];
  if (subtotal != null) summaryRows.push(['Subtotal', money.format(num(subtotal))]);
  if (num(taxAmount) > 0) summaryRows.push([`Tax (${num(taxPercent)}%)`, money.format(num(taxAmount))]);
  if (num(permitsFees) > 0) summaryRows.push(['Permits & fees', money.format(num(permitsFees))]);
  if (num(paymentsReceived) > 0) summaryRows.push(['Payments received', '−' + money.format(num(paymentsReceived))]);
  const summaryHtml = summaryRows.map(([l, v]) => `<div class="sumrow"><span>${escapeHtml(l)}</span><span>${v}</span></div>`).join('');
  const payTable = (paymentsRows && paymentsRows.length)
    ? `<div class="items paytable"><div class="ihead pay"><span>Date</span><span>Amount</span><span>Method</span><span>Reference</span></div><div class="ibody">${paymentsRows.map(p => `<div class="item-row pay"><div>${escapeHtml(formatDate(p.date) || '—')}</div><div>${money.format(num(p.amount))}</div><div>${escapeHtml(p.method || '')}</div><div>${escapeHtml(p.reference || '')}</div></div>`).join('')}</div></div>`
    : '';
  const termsBlock = terms ? `<div class="terms"><div class="band">Terms &amp; Conditions</div><div class="tbody">${escapeHtml(terms)}</div></div>` : '';
  const sigsBlock = signatureBlockEnabled ? `<div class="sigs">
    <div class="sig"><div class="sigline"></div><div class="siglabel">Client signature</div></div>
    <div class="sig"><div class="sigline"></div><div class="siglabel">Date</div></div>
    <div class="sig"><div class="sigline"></div><div class="siglabel">Contractor signature (Harvest Renovation)</div></div>
    <div class="sig"><div class="sigline"></div><div class="siglabel">Date</div></div>
  </div>` : '';
  const hasComments = (comments || '').trim().length > 0;
  const isPaidInvoice = kind === 'INVOICE' && num(balance) <= 0.01;
  const effBalanceLabel = isPaidInvoice ? 'PAID IN FULL' : balanceLabel;
  const effBalanceColor = isPaidInvoice ? '#2e7d32' : balanceColor;
  const paymentInstructions = (kind === 'INVOICE' && num(balance) > 0.01)
    ? `<div class="terms"><div class="band">Payment Instructions</div><div class="tbody">Make checks payable to: ${escapeHtml(BRAND.name)}\nFor ACH, Zelle, or card payments, contact ${escapeHtml(BRAND.phone)} or ${escapeHtml(BRAND.email)}\nPlease include invoice #${escapeHtml(number)} on your payment.</div></div>`
    : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
  ${(typeof document !== 'undefined' && document.baseURI) ? `<base href="${escapeHtml(document.baseURI)}">` : ''}
  <title>${kindLabel} ${escapeHtml(number)} — Harvest Renovation</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#f1ece3;color:#181410;font-family:Inter,Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .bar{position:sticky;top:0;display:flex;gap:10px;justify-content:center;padding:14px;background:#181410}
    .bar button{font:600 14px Inter,Arial,sans-serif;padding:10px 18px;border-radius:10px;border:1px solid #caa05a;background:#caa05a;color:#181410;cursor:pointer}
    .bar button.ghost{background:transparent;color:#e9d8b6}
    .sheet{width:760px;max-width:96vw;margin:22px auto;background:#fff;box-shadow:0 18px 50px rgba(0,0,0,.18)}
    .top{display:flex;align-items:center;justify-content:space-between;gap:18px;background:#0f0c08;color:#fff;padding:22px 26px}
    .brand{display:flex;align-items:center;gap:14px}
    .brand .bname{font-weight:800;font-size:20px;letter-spacing:.3px;color:#f4e9d4}
    .brand .btag{font-size:11px;color:#caa05a;letter-spacing:.18em;text-transform:uppercase;margin-top:3px}
    .brand-logo{height:84px;width:auto;display:block}
    .brand-fallback{align-items:center;gap:14px}
    .brand-fallback .bname{font-weight:800;font-size:20px;color:#f4e9d4}
    .title{text-align:right;line-height:1.02}
    .title strong{display:block;font-size:38px;font-weight:800;letter-spacing:1px;color:#fff}
    .title .status{display:inline-block;margin-top:6px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#0f0c08;background:#caa05a;border-radius:999px;padding:3px 10px}
    .contact{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:14px 26px;border-bottom:1px solid #eadfce}
    .contact .lines div{font-size:13px;color:#7a6a4f;line-height:1.55}
    .contact .lines a{color:#7a6a4f;text-decoration:none}
    .meta{border:1px solid #0f0c08;min-width:240px;border-radius:6px;overflow:hidden}
    .meta .mrow{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #eadfce}
    .meta .mrow:last-child{border-bottom:none}
    .meta .ml{padding:7px 12px;font-size:11px;letter-spacing:.08em;color:#fff;background:#0f0c08;text-transform:uppercase}
    .meta .mv{padding:7px 12px;font-size:13px;font-weight:700;color:#181410;text-align:right}
    .billto{padding:0 26px}
    .billto .band{background:#0f0c08;color:#caa05a;font-size:12px;letter-spacing:.14em;text-transform:uppercase;padding:7px 12px;margin-top:18px}
    .billto .body{padding:12px;border:1px solid #eadfce;border-top:none}
    .billto .body div{font-size:13px;line-height:1.6;color:#2c2419}
    .items{padding:0 26px;margin-top:18px}
    .items .ihead{display:grid;grid-template-columns:1fr 150px;background:#0f0c08}
    .items .ihead span{padding:8px 12px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#caa05a}
    .items .ihead span:last-child{text-align:right}
    .items .ibody{border:1px solid #eadfce;border-top:none;min-height:240px}
    .items.paytable{margin-top:14px}
    .items.paytable .ibody{min-height:0}
    .items .ihead.pay{grid-template-columns:1fr 1fr 1fr 1.4fr}
    .items .ihead.pay span:last-child{text-align:left}
    .item-row{display:grid;grid-template-columns:1fr 150px;border-bottom:1px solid #f0e8da}
    .item-row.pay{grid-template-columns:1fr 1fr 1fr 1.4fr}
    .item-row.pay div{padding:9px 12px;font-size:12px;color:#2c2419}
    .item-row .desc{padding:11px 12px;font-size:13px;color:#2c2419;white-space:pre-wrap}
    .item-row .amt{padding:11px 12px;font-size:13px;font-weight:600;text-align:right;color:#2c2419}
    .item-row.scope .desc{color:#181410}
    .line-sub{font-size:11px;color:#8a7a5e;margin-top:2px}
    .scope-list{margin:0;padding-left:18px}
    .scope-list li{font-size:13px;color:#2c2419;line-height:1.5}
    .foot{display:grid;grid-template-columns:1fr 270px;gap:0;padding:18px 26px 4px}
    .thanks{font-size:26px;font-weight:800;color:#caa05a;letter-spacing:.04em;text-align:center;margin:8px 0 14px}
    .term{font-size:11px;color:#6b5d46;line-height:1.5;margin-bottom:8px}
    .qnote{font-size:11px;color:#6b5d46;font-style:italic;text-align:center;margin-top:14px;line-height:1.6}
    .qnote a{color:#9a7530}
    .sumrow{display:flex;justify-content:space-between;font-size:12px;color:#2c2419;padding:4px 2px;border-bottom:1px solid #f0e8da}
    .balance{display:flex;justify-content:space-between;align-items:center;background:#f6ead2;border:1px solid #d8b878;border-radius:6px;padding:11px 14px;margin-top:8px}
    .balance span{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#5b4a2c}
    .balance strong{font-size:18px;color:#181410}
    .box{border:1px solid #eadfce;border-radius:6px;margin-top:12px;min-height:64px;padding:9px 12px}
    .box .lbl{font-size:12px;font-weight:700;color:#181410;margin-bottom:6px}
    .box .val{font-size:12px;color:#2c2419;white-space:pre-wrap}
    .terms{padding:0 26px;margin-top:16px}
    .terms .band{background:#0f0c08;color:#caa05a;font-size:12px;letter-spacing:.14em;text-transform:uppercase;padding:7px 12px}
    .terms .tbody{border:1px solid #eadfce;border-top:none;padding:12px;font-size:11px;color:#6b5d46;line-height:1.6;white-space:pre-wrap}
    .sigs{display:grid;grid-template-columns:1fr 200px 1fr 200px;gap:24px;padding:22px 26px 8px}
    .sigs .siglabel{font-size:11px;color:#6b5d46;margin-top:6px;text-transform:uppercase;letter-spacing:.08em}
    .sigs .sigline{border-bottom:1px solid #b9a888;height:32px}
    .verse{background:#0f0c08;color:#caa05a;text-align:center;font-size:12px;letter-spacing:.02em;padding:12px 20px;margin-top:18px}
    @media print{.bar{display:none}body{background:#fff}.sheet{margin:0 auto;width:auto;box-shadow:none}@page{margin:0}}
  </style></head>
  <body>
    <div class="bar"><button onclick="window.print()">Print / Save as PDF</button><button class="ghost" onclick="window.close()">Close</button></div>
    <div class="sheet">
      <div class="top">
        <div class="brand"><span class="brand-fallback" style="display:flex">${brandWheatSvg()}<span class="bname">${escapeHtml(BRAND.name)}</span></span><img class="brand-logo" src="${BRAND_LOGO_PATH}" alt="${escapeHtml(BRAND.name)}" style="display:none" onload="this.style.display='block';this.previousElementSibling.style.display='none';" onerror="this.style.display='none';" /></div>
        <div class="title"><strong>${kindLabel}</strong>${statusBadge}</div>
      </div>
      <div class="contact">
        <div class="lines">
          <div>${escapeHtml(BRAND.contact)}</div>
          <div>${escapeHtml(BRAND.phone)}</div>
          <div>${escapeHtml(BRAND.website)}</div>
          <div>${escapeHtml(BRAND.email)}</div>
        </div>
        <div class="meta">${metaHtml}</div>
      </div>
      <div class="billto">
        <div class="band">Bill To</div>
        <div class="body">${billLines}</div>
      </div>
      <div class="items">
        <div class="ihead"><span>Description</span><span>Amount</span></div>
        <div class="ibody">${scopeBlock}${itemRows}</div>
      </div>
      ${payTable}
      <div class="foot">
        <div class="foot-left">
          <div class="thanks">${escapeHtml(BRAND.thankYou)}</div>
          ${kind === 'ESTIMATE' && depPct > 0 ? `<div class="term"><strong>${dep}% Upfront:</strong> A deposit of ${dep}%${depAmountText} is required upfront to cover material costs.</div>` : ''}
          <div class="qnote">For questions concerning this ${kind.toLowerCase()}, please contact<br/>${escapeHtml(BRAND.contact)}, ${escapeHtml(BRAND.phone)}, ${escapeHtml(BRAND.email)}<br/><a href="https://${escapeHtml(BRAND.website)}">${escapeHtml(BRAND.website)}</a></div>
        </div>
        <div class="foot-right">
          ${summaryHtml}
          <div class="balance"><span>${escapeHtml(effBalanceLabel)}</span><strong${effBalanceColor ? ` style="color:${effBalanceColor}"` : ''}>${money.format(num(balance))}</strong></div>
          ${hasComments ? `<div class="box"><div class="lbl">Comments</div><div class="val">${escapeHtml(comments)}</div></div>` : ''}
        </div>
      </div>
      ${paymentInstructions}
      ${termsBlock}
      ${sigsBlock}
      <div class="verse">${escapeHtml(BRAND.verse)}</div>
    </div>
    <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
  </body></html>`;
}

export function buildEstimateDocHtml(estimate) {
  const items = estimate.items || [];
  let rows;
  if (items.length) {
    rows = items.map(it => {
      const cat = it.category && it.category !== 'Other' ? ` · ${it.category}` : '';
      const q = num(it.quantity);
      const subHtml = q > 1 ? `<div class="line-sub">${q} ${escapeHtml(it.unit || '')} × ${money.format(num(it.unitPrice))}</div>` : '';
      return { descHtml: `${escapeHtml(it.description || '')}${escapeHtml(cat)}`, subHtml, amount: num(it.amount != null ? it.amount : q * num(it.unitPrice)) };
    });
  } else {
    rows = [];
    const materialTotal = num(estimate.materialCost) + num(estimate.materialMarkup);
    const laborTotal = num(estimate.laborBase) + num(estimate.laborMarkup);
    if (materialTotal) rows.push({ desc: 'Materials (cost + markup)', amount: materialTotal });
    if (laborTotal) rows.push({ desc: `Labor${estimate.trade ? ' — ' + estimate.trade : ''}`, amount: laborTotal });
    if (num(estimate.finalPay)) rows.push({ desc: 'Final markup', amount: num(estimate.finalPay) });
    if (!rows.length) rows.push({ desc: estimate.trade || 'Project scope', amount: num(estimate.estimatedCost) });
  }
  return buildBrandedDocHtml({
    kind: 'ESTIMATE',
    number: estimate.estimateNumber || '',
    date: estimate.date,
    status: estimate.status,
    bill: {
      name: estimate.billingName || estimate.clientName,
      address: estimate.billingAddress,
      phone: estimate.billingPhone,
      email: estimate.billingEmail
    },
    scope: estimate.scope,
    comments: estimate.comments,
    rows,
    balanceLabel: 'BALANCE DUE',
    balance: num(estimate.estimatedCost),
    depositPercent: num(estimate.depositPercent),
    depositAmount: num(estimate.depositAmount),
    validUntil: estimate.validUntil || '',
    preparedBy: estimate.user || currentUserName(),
    subtotal: estimate.subtotal != null ? num(estimate.subtotal) : num(estimate.estimatedCost),
    taxPercent: num(estimate.taxPercent),
    taxAmount: num(estimate.taxAmount),
    permitsFees: num(estimate.permitsFees),
    terms: estimate.termsAndConditions || DEFAULT_ESTIMATE_TERMS,
    signatureBlockEnabled: estimate.signatureBlockEnabled !== false
  });
}

export function printEstimate(estimate) {
  const html = buildEstimateDocHtml(estimate);
  saveDocument('estimate', estimate.estimateNumber || estimate.id || autoNumber('EST'), estimate.clientName, estimate.estimatedCost, html, estimate.user || currentUserName());
  renderDocuments();
  openPrintWindow(html);
}

export function buildInvoiceDocHtml(invoice) {
  const items = invoice.items || [];
  const rows = items.map(item => {
    const q = num(item.quantity);
    const subHtml = q > 1 ? `<div class="line-sub">${q} ${escapeHtml(item.unit || '')} × ${money.format(num(item.unitPrice))}</div>` : '';
    return { descHtml: escapeHtml(item.description || ''), subHtml, amount: num(item.amount != null ? item.amount : q * num(item.unitPrice)) };
  });
  const total = num(invoice.total != null ? invoice.total : items.reduce((s, it) => s + num(it.amount), 0));
  const payments = invoice.payments || [];
  const paid = payments.reduce((s, p) => s + num(p.amount), 0);
  const balance = total - paid;
  return buildBrandedDocHtml({
    kind: 'INVOICE',
    number: invoice.invoiceNumber || '',
    date: invoice.date,
    dueDate: invoice.dueDate || '',
    status: invoice.status,
    bill: { name: invoice.clientName, address: invoice.address, phone: invoice.phone, email: invoice.email },
    rows,
    balanceLabel: 'BALANCE DUE',
    balance,
    balanceColor: balance > 0.01 ? '#c62828' : '#2e7d32',
    preparedBy: invoice.user || currentUserName(),
    subtotal: total,
    paymentsReceived: paid,
    paymentsRows: payments,
    terms: invoice.terms || DEFAULT_INVOICE_TERMS,
    signatureBlockEnabled: true
  });
}

export function printInvoice(invoice) {
  const html = buildInvoiceDocHtml(invoice);
  saveDocument('invoice', invoice.invoiceNumber || invoice.id || autoNumber('INV'), invoice.clientName, invoice.total, html, invoice.user || currentUserName());
  renderDocuments();
  openPrintWindow(html);
}

export function buildChangeOrderDocHtml(co) {
  const rows = (co.items || []).map(it => ({ desc: it.description || '', amount: num(it.amount) }));
  return buildBrandedDocHtml({
    kind: 'CHANGE ORDER',
    number: co.changeOrderNumber || '',
    date: co.date,
    status: co.status,
    bill: { name: co.clientName },
    rows,
    scope: co.description || '',
    comments: `Parent estimate: ${co.parentEstimateNumber || ''}\nNew contract total: ${money.format(num(co.newRunningTotal))}`,
    balanceLabel: 'CHANGE ORDER TOTAL',
    balance: num(co.deltaAmount),
    subtotal: num(co.deltaAmount),
    preparedBy: co.owner || currentUserName(),
    signatureBlockEnabled: true
  });
}

export function buildReceiptDocHtml(receipt) {
  const paidToDate = num(receipt.previouslyPaid) + num(receipt.amountReceived);
  const statusLabel = num(receipt.balanceRemaining) <= 0.01 ? 'PAID IN FULL' : `${receipt.paymentType || 'Progress'} Payment`;
  return buildBrandedDocHtml({
    kind: 'PAYMENT RECEIPT',
    number: receipt.receiptNumber || '',
    date: receipt.paymentDate,
    status: statusLabel,
    bill: { name: receipt.clientName },
    rows: [{ desc: `Payment received — ${receipt.paymentMethod || 'Check'} (${receipt.paymentType || 'Progress'})`, amount: num(receipt.amountReceived) }],
    comments: `Payment for Invoice ${receipt.invoiceNumber || ''}\nMethod: ${receipt.paymentMethod || 'Check'}  •  Type: ${receipt.paymentType || 'Progress'}`,
    balanceLabel: 'BALANCE REMAINING',
    balance: num(receipt.balanceRemaining),
    subtotal: num(receipt.total),
    paymentsReceived: paidToDate,
    preparedBy: receipt.issuedBy || currentUserName(),
    signatureBlockEnabled: false
  });
}
