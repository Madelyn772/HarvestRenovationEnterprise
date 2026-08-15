import { money, num, formatDate, currentUserName, autoNumber, BRAND, BRAND_LOGO_PATH } from './state.js';
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

// Shared, branded estimate/invoice document modeled on the Harvest Renovation
// letterhead (black + gold, wheat mark, bill-to, line items, terms, signature).
export function buildBrandedDocHtml(opts) {
  const {
    kind = 'ESTIMATE', number = '', date = '', status = '',
    bill = {}, rows = [], scope = '', comments = '',
    balanceLabel = 'BALANCE DUE', balance = 0,
    depositPercent = 0, depositAmount = 0
  } = opts;
  const kindLabel = escapeHtml(kind);
  const billLines = [bill.name, bill.address, bill.phone, bill.email].filter(Boolean)
    .map(line => `<div>${escapeHtml(line)}</div>`).join('') || '<div class="muted">—</div>';
  const scopeBlock = scope ? `<div class="item-row scope"><div class="desc">${escapeHtml(scope)}</div><div class="amt"></div></div>` : '';
  const itemRows = rows.map(r => `<div class="item-row"><div class="desc">${escapeHtml(r.desc || '')}</div><div class="amt">${r.amount == null ? '' : money.format(num(r.amount))}</div></div>`).join('');
  const dep = num(depositPercent) || 30;
  const depAmountText = num(depositAmount) ? ` (${money.format(num(depositAmount))})` : '';
  const statusBadge = (status && status.toLowerCase() !== 'draft')
    ? `<span class="status">${escapeHtml(status)}</span>`
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
    .meta .head{display:grid;grid-template-columns:1fr 1fr;background:#0f0c08}
    .meta .head span{padding:7px 12px;font-size:11px;letter-spacing:.1em;color:#caa05a;text-transform:uppercase}
    .meta .head span:last-child{text-align:right}
    .meta .val{display:grid;grid-template-columns:1fr 1fr}
    .meta .val span{padding:9px 12px;font-size:14px;font-weight:700;color:#181410}
    .meta .val span:last-child{text-align:right}
    .billto{padding:0 26px}
    .billto .band{background:#0f0c08;color:#caa05a;font-size:12px;letter-spacing:.14em;text-transform:uppercase;padding:7px 12px;margin-top:18px}
    .billto .body{padding:12px;border:1px solid #eadfce;border-top:none}
    .billto .body div{font-size:13px;line-height:1.6;color:#2c2419}
    .items{padding:0 26px;margin-top:18px}
    .items .ihead{display:grid;grid-template-columns:1fr 150px;background:#0f0c08}
    .items .ihead span{padding:8px 12px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#caa05a}
    .items .ihead span:last-child{text-align:right}
    .items .ibody{border:1px solid #eadfce;border-top:none;min-height:300px}
    .item-row{display:grid;grid-template-columns:1fr 150px;border-bottom:1px solid #f0e8da}
    .item-row .desc{padding:11px 12px;font-size:13px;color:#2c2419;white-space:pre-wrap}
    .item-row .amt{padding:11px 12px;font-size:13px;font-weight:600;text-align:right;color:#2c2419}
    .item-row.scope .desc{color:#181410}
    .foot{display:grid;grid-template-columns:1fr 270px;gap:0;padding:18px 26px 4px}
    .thanks{font-size:26px;font-weight:800;color:#caa05a;letter-spacing:.04em;text-align:center;margin:8px 0 14px}
    .term{font-size:11px;color:#6b5d46;line-height:1.5;margin-bottom:8px}
    .qnote{font-size:11px;color:#6b5d46;font-style:italic;text-align:center;margin-top:14px;line-height:1.6}
    .qnote a{color:#9a7530}
    .balance{display:flex;justify-content:space-between;align-items:center;background:#f6ead2;border:1px solid #d8b878;border-radius:6px;padding:11px 14px}
    .balance span{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#5b4a2c}
    .balance strong{font-size:18px;color:#181410}
    .box{border:1px solid #eadfce;border-radius:6px;margin-top:12px;min-height:64px;padding:9px 12px}
    .box .lbl{font-size:12px;font-weight:700;color:#181410;margin-bottom:6px}
    .box .val{font-size:12px;color:#2c2419;white-space:pre-wrap}
    .sigline{border-bottom:1px solid #b9a888;margin-top:26px}
    .verse{background:#0f0c08;color:#caa05a;text-align:center;font-size:12px;letter-spacing:.02em;padding:12px 20px;margin-top:18px}
    @media print{.bar{display:none}body{background:#fff}.sheet{margin:0 auto;width:auto;box-shadow:none}@page{margin:0}}
  </style></head>
  <body>
    <div class="bar"><button onclick="window.print()">Print / Save as PDF</button><button class="ghost" onclick="window.close()">Close</button></div>
    <div class="sheet">
      <div class="top">
        <div class="brand"><img class="brand-logo" src="${BRAND_LOGO_PATH}" alt="${escapeHtml(BRAND.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="brand-fallback" style="display:none">${brandWheatSvg()}<span class="bname">${escapeHtml(BRAND.name)}</span></span></div>
        <div class="title"><strong>${kindLabel}</strong>${statusBadge}</div>
      </div>
      <div class="contact">
        <div class="lines">
          <div>${escapeHtml(BRAND.contact)}</div>
          <div>${escapeHtml(BRAND.phone)}</div>
          <div>${escapeHtml(BRAND.website)}</div>
          <div>${escapeHtml(BRAND.email)}</div>
        </div>
        <div class="meta">
          <div class="head"><span>${kindLabel} No.</span><span>Date</span></div>
          <div class="val"><span>${escapeHtml(number || '—')}</span><span>${escapeHtml(formatDate(date) || '—')}</span></div>
        </div>
      </div>
      <div class="billto">
        <div class="band">Bill To</div>
        <div class="body">${billLines}</div>
      </div>
      <div class="items">
        <div class="ihead"><span>Description</span><span>Amount</span></div>
        <div class="ibody">${scopeBlock}${itemRows}</div>
      </div>
      <div class="foot">
        <div class="foot-left">
          <div class="thanks">${escapeHtml(BRAND.thankYou)}</div>
          <div class="term"><strong>${dep}% Upfront:</strong> A deposit of ${dep}%${depAmountText} is required upfront to cover material costs.</div>
          <div class="term"><strong>Price Adjustments:</strong> Any additional requests or modifications beyond the agreed-upon scope will result in a price adjustment.</div>
          <div class="qnote">For questions concerning this ${kind.toLowerCase()}, please contact<br/>${escapeHtml(BRAND.contact)}, ${escapeHtml(BRAND.phone)}, ${escapeHtml(BRAND.email)}<br/><a href="https://${escapeHtml(BRAND.website)}">${escapeHtml(BRAND.website)}</a></div>
        </div>
        <div class="foot-right">
          <div class="balance"><span>${escapeHtml(balanceLabel)}</span><strong>${money.format(num(balance))}</strong></div>
          <div class="box"><div class="lbl">Comments</div><div class="val">${escapeHtml(comments || '')}</div></div>
          <div class="box"><div class="lbl">Signature</div><div class="sigline"></div></div>
        </div>
      </div>
      <div class="verse">${escapeHtml(BRAND.verse)}</div>
    </div>
    <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
  </body></html>`;
}

export function buildEstimateDocHtml(estimate) {
  const rows = [];
  const materialTotal = num(estimate.materialCost) + num(estimate.materialMarkup);
  const laborTotal = num(estimate.laborBase) + num(estimate.laborMarkup);
  if (materialTotal) rows.push({ desc: 'Materials (cost + markup)', amount: materialTotal });
  if (laborTotal) rows.push({ desc: `Labor${estimate.trade ? ' — ' + estimate.trade : ''}`, amount: laborTotal });
  if (num(estimate.finalPay)) rows.push({ desc: 'Final markup', amount: num(estimate.finalPay) });
  if (!rows.length) rows.push({ desc: estimate.trade || 'Project scope', amount: num(estimate.estimatedCost) });
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
    depositAmount: num(estimate.depositAmount)
  });
}

export function printEstimate(estimate) {
  const html = buildEstimateDocHtml(estimate);
  saveDocument('estimate', estimate.estimateNumber || estimate.id || autoNumber('EST'), estimate.clientName, estimate.estimatedCost, html, estimate.user || currentUserName());
  renderDocuments();
  openPrintWindow(html);
}

export function buildInvoiceDocHtml(invoice) {
  const rows = (invoice.items || []).map(item => ({ desc: item.description || '', amount: num(item.amount) }));
  return buildBrandedDocHtml({
    kind: 'INVOICE',
    number: invoice.invoiceNumber || '',
    date: invoice.date,
    status: invoice.status,
    bill: { name: invoice.clientName, address: invoice.address, phone: invoice.phone, email: invoice.email },
    rows,
    balanceLabel: 'BALANCE DUE',
    balance: num(invoice.total)
  });
}

export function printInvoice(invoice) {
  const html = buildInvoiceDocHtml(invoice);
  saveDocument('invoice', invoice.invoiceNumber || invoice.id || autoNumber('INV'), invoice.clientName, invoice.total, html, invoice.user || currentUserName());
  renderDocuments();
  openPrintWindow(html);
}
