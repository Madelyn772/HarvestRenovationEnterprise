import { money, num, formatDate, currentUserName, autoNumber, BRAND, BRAND_LOGO_PATH, DEFAULT_ESTIMATE_TERMS, DEFAULT_INVOICE_TERMS, DEFAULT_CONTRACT_TERMS } from './state.js';
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
  return lines.map(line => `<div class="scope-line">${escapeHtml(line)}</div>`).join('');
}

function termsToHtml(terms) {
  const items = String(terms || '').split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^(?:\d+[.)]|[-*])\s+/, ''));
  return `<ul class="terms-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function documentDate(value) {
  const text = String(value || '').trim();
  return formatDate(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text);
}

function contractMobilePdfScript(pdfFilename, mobileShareText) {
  return `<script>
    function mobilePdfExportRequired() {
      return window.matchMedia('(max-width:780px)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    }
    function appleMobilePrintRequired() {
      return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }
    var preparedMobilePdf = null;
    var preparedMobilePdfPromise = null;
    async function prepareContinuousPdf() {
      if (preparedMobilePdf) return preparedMobilePdf;
      if (preparedMobilePdfPromise) return preparedMobilePdfPromise;
      var sheet = document.querySelector('.sheet');
      var button = document.querySelector('.bar button');
      if (!sheet) return;
      var originalLabel = button ? button.textContent : '';
      preparedMobilePdfPromise = (async function () {
        if (button) { button.disabled = true; button.textContent = 'Creating PDF…'; }
        var modules = await Promise.all([
          import('https://esm.sh/html2canvas@1.4.1'),
          import('https://esm.sh/jspdf@2.5.2')
        ]);
        var html2canvas = modules[0].default;
        var Pdf = modules[1].jsPDF;
        document.documentElement.classList.add('measure-print', 'desktop-print');
        await Promise.all(Array.from(sheet.querySelectorAll('img')).map(function (image) {
          return image.complete ? Promise.resolve() : new Promise(function (resolve) {
            var timeout = setTimeout(resolve, 3000);
            function finish() { clearTimeout(timeout); resolve(); }
            image.addEventListener('load', finish, { once: true });
            image.addEventListener('error', finish, { once: true });
          });
        }));
        await new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); });
        var canvas = await Promise.race([
          html2canvas(sheet, {
            backgroundColor: '#ffffff',
            logging: false,
            scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
            useCORS: false,
            windowWidth: 816
          }),
          new Promise(function (_, reject) {
            setTimeout(function () { reject(new Error('PDF rendering timed out')); }, 20000);
          })
        ]);
        var pageWidth = 612;
        var contentWidth = 540;
        var contentHeight = canvas.height * contentWidth / canvas.width;
        var pageHeight = Math.min(14400, Math.ceil(contentHeight + 72));
        var fittedHeight = Math.min(contentHeight, pageHeight - 72);
        var pdf = new Pdf({ orientation: 'portrait', unit: 'pt', format: [pageWidth, pageHeight], compress: true });
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 36, 36, contentWidth, fittedHeight, undefined, 'FAST');
        var blob = pdf.output('blob');
        var url = URL.createObjectURL(blob);
        preparedMobilePdf = {
          file: new File([blob], ${JSON.stringify(pdfFilename)}, { type: 'application/pdf' }),
          url: url,
          filename: ${JSON.stringify(pdfFilename)},
          size: blob.size,
          pages: pdf.getNumberOfPages()
        };
        return preparedMobilePdf;
      })();
      try {
        return await preparedMobilePdfPromise;
      } finally {
        document.documentElement.classList.remove('measure-print', 'desktop-print');
        if (button) { button.disabled = false; button.textContent = originalLabel; }
        if (!preparedMobilePdf) preparedMobilePdfPromise = null;
      }
    }
    async function downloadContinuousPdf() {
      try {
        var prepared = await prepareContinuousPdf();
        if (!prepared) return;
        window.location.href = prepared.url;
        return { filename: prepared.filename, size: prepared.size, pages: prepared.pages, opened: true };
      } catch (error) {
        console.error('Mobile PDF generation failed', error);
        alert('Unable to create the PDF file. Check your connection and try again.');
      }
    }
    async function shareAppleMobilePdf() {
      try {
        var prepared = preparedMobilePdf || await prepareContinuousPdf();
        if (!prepared) return;
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [prepared.file] }))) {
          await navigator.share({
            files: [prepared.file],
            title: prepared.filename,
            text: ${JSON.stringify(mobileShareText)}
          });
          return;
        }
        window.location.href = prepared.url;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
        console.error('Apple PDF sharing failed', error);
        alert('Unable to open the PDF. Please try again.');
      }
    }
    function printContinuousPdf() {
      if (appleMobilePrintRequired()) return shareAppleMobilePdf();
      if (mobilePdfExportRequired()) return downloadContinuousPdf();
      var sheet = document.querySelector('.sheet');
      if (!sheet) return window.print();
      document.documentElement.classList.add('measure-print', 'continuous-print');
      requestAnimationFrame(function () {
        var pageHeight = Math.min(200, Math.ceil((sheet.scrollHeight / 96 + 1) * 100) / 100);
        var pageStyle = document.createElement('style');
        pageStyle.textContent = '@media print{@page{size:8.5in ' + pageHeight + 'in;margin:0}}';
        document.head.appendChild(pageStyle);
        document.documentElement.classList.remove('measure-print');
        window.addEventListener('afterprint', function () {
          pageStyle.remove();
          document.documentElement.classList.remove('continuous-print');
        }, { once: true });
        window.print();
      });
    }
    window.addEventListener('load', function () {
      if (appleMobilePrintRequired()) prepareContinuousPdf().catch(function (error) {
        console.error('Apple PDF preparation failed', error);
      });
    }, { once: true });
  </script>`;
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
    subtotal = null, taxPercent = 0, taxAmount = 0, permitsFees = 0, finalPay = 0,
    paymentsReceived = 0, paymentsRows = [],
    paymentScheduleRows = [], terms = '', signatureBlockEnabled = false, commercialJob = false, itemizedMode = true
  } = opts;
  const kindLabel = escapeHtml(kind.charAt(0) + kind.slice(1).toLowerCase());
  const shareDocumentLabel = kind === 'INVOICE' ? 'Invoice' : 'Estimate';
  const pdfFilename = ['ESTIMATE', 'INVOICE'].includes(kind)
    ? `Harvest Renovation - ${shareDocumentLabel} - ${String(bill.name || 'Client').trim() || 'Client'}- ${String(number || shareDocumentLabel).trim() || shareDocumentLabel}`
      .replace(/[\\/:*?"<>|]+/g, '-') + '.pdf'
    : `${String(kind || 'document').toLowerCase()}-${String(number || 'document')}`
      .replace(/[^a-z0-9._-]+/gi, '-') + '.pdf';
  const billedFirstName = String(bill.name || '').trim().split(/\s+/)[0] || 'there';
  const shareSenderName = String(currentUserName() || preparedBy || BRAND.contact || 'Harvest Renovation').trim();
  const mobileShareText = ['ESTIMATE', 'INVOICE'].includes(kind)
    ? `Hi ${billedFirstName},\n\nYour ${shareDocumentLabel.toLowerCase()} is ready! I’ve attached it for you to review.\n\nIf you have any questions, would like to make any adjustments, or want to go over any of the details, please feel free to reach out. We’re happy to work with you and make sure everything fits what you have in mind.\n\nWe’d love the opportunity to bring your project to life and look forward to working with you!\n\nBest regards,\n${shareSenderName}\nHarvest Renovation`
    : '';
  const billLines = [bill.name, bill.address, bill.phone, bill.email].filter(Boolean)
    .map(line => `<div>${escapeHtml(line)}</div>`).join('') || '<div class="muted">—</div>';
  const scopeText = String(scope || '').trim();
  const scopeRow = (kind === 'ESTIMATE' || kind === 'INVOICE') && scopeText
    ? !itemizedMode
      ? `<div class="item-row lump-sum scope"><div class="desc">${scopeToHtml(scopeText)}</div></div>`
      : commercialJob
      ? `<div class="item-row commercial scope"><div class="desc">${scopeToHtml(scopeText)}</div><div class="qty"></div><div class="unit"></div><div class="price"></div><div class="amt"></div></div>`
      : `<div class="item-row scope"><div class="desc">${scopeToHtml(scopeText)}</div><div class="amt"></div></div>`
    : '';
  const itemRows = rows.map(r => {
    const descHtml = r.descHtml != null ? r.descHtml : escapeHtml(r.desc || '');
    if (!itemizedMode) {
      return `<div class="item-row lump-sum"><div class="desc">${descHtml}${r.subHtml || ''}</div></div>`;
    }
    if (commercialJob) {
      return `<div class="item-row commercial"><div class="desc">${descHtml}</div><div class="qty">${escapeHtml(r.quantity == null ? '' : String(r.quantity))}</div><div class="unit">${escapeHtml(r.unit || '')}</div><div class="price">${money.format(num(r.unitPrice))}</div><div class="amt">${r.amount == null ? '' : money.format(num(r.amount))}</div></div>`;
    }
    return `<div class="item-row"><div class="desc">${descHtml}${r.subHtml || ''}</div><div class="amt">${r.amount == null ? '' : money.format(num(r.amount))}</div></div>`;
  }).join('');
  const depPct = num(depositPercent);
  const dep = depPct || 30;
  const depAmountText = num(depositAmount) ? ` (${money.format(num(depositAmount))})` : '';
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const statusBadge = (normalizedStatus && !['draft', 'sent'].includes(normalizedStatus))
    ? `<span class="status">${escapeHtml(status)}</span>`
    : '';
  const metaRows = [[`${kindLabel} No.`, escapeHtml(number || '—')], ['Date', escapeHtml(documentDate(date) || '—')]];
  if (validUntil) metaRows.push(['Valid until', escapeHtml(documentDate(validUntil))]);
  if (dueDate) metaRows.push(['Due date', escapeHtml(documentDate(dueDate))]);
  const metaHtml = metaRows.map(([l, v]) => `<div class="mrow"><span class="ml">${l}</span><span class="mv">${v}</span></div>`).join('');
  const summaryRows = [];
  if (subtotal != null) summaryRows.push(['Total', money.format(num(subtotal))]);
  if (itemizedMode && num(finalPay) > 0) summaryRows.push(['Final markup', money.format(num(finalPay))]);
  if (itemizedMode && num(permitsFees) > 0) summaryRows.push(['Permits & fees', money.format(num(permitsFees))]);
  if (num(paymentsReceived) > 0) summaryRows.push(['Payments received', '−' + money.format(num(paymentsReceived))]);
  const summaryHtml = summaryRows.map(([l, v]) => `<div class="sumrow"><span>${escapeHtml(l)}</span><span>${v}</span></div>`).join('');
  const payTable = (paymentsRows && paymentsRows.length)
    ? `<div class="items paytable"><div class="ihead pay"><span>Date</span><span>Amount</span><span>Method</span><span>Reference</span></div><div class="ibody">${paymentsRows.map(p => `<div class="item-row pay"><div>${escapeHtml(documentDate(p.date) || '—')}</div><div>${money.format(num(p.amount))}</div><div>${escapeHtml(p.method || '')}</div><div>${escapeHtml(p.reference || '')}</div></div>`).join('')}</div></div>`
    : '';
  const paymentScheduleTable = (paymentScheduleRows && paymentScheduleRows.length)
    ? `<div class="items schedule-table"><div class="section-title">Payment Schedule</div><div class="ihead schedule"><span>Milestone</span><span>%</span><span>When Due</span><span>Amount</span></div><div class="ibody">${paymentScheduleRows.map(p => `<div class="item-row schedule"><div>${escapeHtml(p.label || '')}</div><div>${num(p.percent)}%</div><div>${escapeHtml(p.dueDescription || '')}</div><div>${money.format(num(p.amount))}</div></div>`).join('')}</div></div>`
    : '';
  const termsBlock = terms ? `<div class="terms"><div class="band">Terms &amp; Conditions</div><div class="tbody">${termsToHtml(terms)}</div></div>` : '';
  const sigsBlock = signatureBlockEnabled ? `<div class="sigs">
    <div class="sig"><div class="sigline"></div><div class="siglabel">Client signature</div></div>
    <div class="sig"><div class="sigline"></div><div class="siglabel">Date</div></div>
    <div class="sig"><div class="sigline"></div><div class="siglabel">Contractor signature (Harvest Renovation)</div></div>
    <div class="sig"><div class="sigline"></div><div class="siglabel">Date</div></div>
  </div>` : '';
  const hasComments = (comments || '').trim().length > 0;
  const hasBalance = balanceLabel != null && balance != null;
  const isPaidInvoice = hasBalance && kind === 'INVOICE' && num(balance) <= 0.01;
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
    .meta{border:1px solid #0f0c08;min-width:240px;border-radius:6px;overflow:visible}
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
    .items .ihead.commercial{grid-template-columns:minmax(0,1fr) 58px 62px 104px 110px}
    .items .ihead.lump-sum{grid-template-columns:1fr}
    .items .ihead span{padding:8px 12px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#caa05a}
    .items .ihead span:last-child{text-align:right}
    .items .ihead span:first-child{text-align:left}
    .items .ibody{border:1px solid #eadfce;border-top:none;min-height:240px}
    .items .line-items-body{display:flex;flex-direction:column}
    .items .line-items-body .item-row.scope{align-items:end;min-height:96px;margin-top:auto}
    .items.paytable{margin-top:14px}
    .items.paytable .ibody{min-height:0}
    .items.schedule-table .ibody{min-height:0}
    .items .section-title{background:#0f0c08;color:#caa05a;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:8px 12px;border-bottom:1px solid #3d3020}
    .items .ihead.pay{grid-template-columns:1fr 1fr 1fr 1.4fr}
    .items .ihead.pay span:last-child{text-align:left}
    .items .ihead.schedule{grid-template-columns:1.2fr 54px 1.5fr 110px}
    .items .ihead.schedule span:nth-child(2){text-align:center}
    .item-row{display:grid;grid-template-columns:1fr 150px;border-bottom:1px solid #f0e8da}
    .item-row.commercial{grid-template-columns:minmax(0,1fr) 58px 62px 104px 110px}
    .item-row.lump-sum{grid-template-columns:1fr}
    .item-row.pay{grid-template-columns:1fr 1fr 1fr 1.4fr}
    .item-row.pay div{padding:9px 12px;font-size:12px;color:#2c2419}
    .item-row.schedule{grid-template-columns:1.2fr 54px 1.5fr 110px}
    .item-row.schedule div{padding:9px 12px;font-size:12px;color:#2c2419}
    .item-row.schedule div:nth-child(2){text-align:center}
    .item-row.schedule div:last-child{text-align:right;font-weight:600}
    .item-row .desc{padding:11px 12px;font-size:13px;font-weight:700;color:#2c2419;white-space:pre-wrap}
    .item-row.scope .desc{font-weight:400}
    .item-row .amt{padding:11px 12px;font-size:13px;font-weight:600;text-align:right;color:#2c2419}
    .item-row .qty,.item-row .unit,.item-row .price{padding:11px 8px;font-size:12px;color:#2c2419}
    .item-row .qty,.item-row .unit{text-align:center}
    .item-row .price{text-align:right}
    .line-sub{font-size:11px;color:#8a7a5e;margin-top:2px}
    .scope-list{margin:0;padding-left:18px}
    .scope-list li{font-size:13px;color:#2c2419;line-height:1.5;margin-top:6px}
    .scope-list li:first-child,.scope-line:first-child{margin-top:0}
    .scope-line{margin-top:6px}
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
    .terms .tbody{border:1px solid #eadfce;border-top:none;padding:12px;font-size:11px;color:#6b5d46;line-height:1.6}
    .terms-list{list-style-type:disc;margin:0;padding-left:20px}
    .terms-list li{padding-left:2px;margin:0 0 4px}
    .terms-list li:last-child{margin-bottom:0}
    .sigs{display:grid;grid-template-columns:1fr 200px 1fr 200px;gap:24px;padding:22px 26px 8px}
    .sigs .siglabel{font-size:11px;color:#6b5d46;margin-top:6px;text-transform:uppercase;letter-spacing:.08em}
    .sigs .sigline{border-bottom:1px solid #b9a888;height:32px}
    .verse{background:#0f0c08;color:#caa05a;text-align:center;font-size:12px;letter-spacing:.02em;padding:12px 20px;margin-top:18px}
    .item-row,.summary,.sigs,.terms,.billto{break-inside:avoid;page-break-inside:avoid}
    html.measure-print .bar{display:none}
    html.measure-print .sheet{width:7.5in;max-width:none;margin:0;box-shadow:none}
    @media screen and (max-width:780px){body{overflow-x:hidden}.sheet{width:100%;max-width:none;margin:8px 0;box-shadow:none}.top{align-items:flex-start;flex-wrap:wrap;padding:18px 14px}.brand-logo{max-width:190px;height:auto}.title strong{font-size:28px}.contact{flex-direction:column;padding:12px 14px}.meta{width:100%;min-width:0}.billto,.items,.terms{padding-left:12px;padding-right:12px}.foot{grid-template-columns:1fr;padding:16px 14px 4px}.sigs{grid-template-columns:minmax(0,1fr) 86px;gap:16px;padding:20px 14px 8px}.item-row{grid-template-columns:minmax(0,1fr) 112px}.items .ihead{grid-template-columns:minmax(0,1fr) 112px}}
    html.desktop-print body{overflow:visible}
    html.desktop-print .sheet{width:7.5in;max-width:none;margin:0;box-shadow:none}
    html.desktop-print .top{align-items:center;flex-wrap:nowrap;padding:22px 26px}
    html.desktop-print .brand-logo{max-width:none;height:84px}
    html.desktop-print .title strong{font-size:38px}
    html.desktop-print .contact{flex-direction:row;padding:14px 26px}
    html.desktop-print .meta{width:auto;min-width:240px}
    html.desktop-print .billto,html.desktop-print .items,html.desktop-print .terms{padding-left:26px;padding-right:26px}
    html.desktop-print .foot{grid-template-columns:1fr 270px;padding:18px 26px 4px}
    html.desktop-print .sigs{grid-template-columns:1fr 200px 1fr 200px;gap:24px;padding:22px 26px 8px}
    html.desktop-print .item-row{grid-template-columns:1fr 150px}
    html.desktop-print .item-row.commercial{grid-template-columns:minmax(0,1fr) 58px 62px 104px 110px}
    html.desktop-print .item-row.lump-sum{grid-template-columns:1fr}
    html.desktop-print .item-row.pay{grid-template-columns:1fr 1fr 1fr 1.4fr}
    html.desktop-print .item-row.schedule{grid-template-columns:1.2fr 54px 1.5fr 110px}
    html.desktop-print .items .ihead{grid-template-columns:1fr 150px}
    html.desktop-print .items .ihead.commercial{grid-template-columns:minmax(0,1fr) 58px 62px 104px 110px}
    html.desktop-print .items .ihead.lump-sum{grid-template-columns:1fr}
    html.desktop-print .items .ihead.pay{grid-template-columns:1fr 1fr 1fr 1.4fr}
    html.desktop-print .items .ihead.schedule{grid-template-columns:1.2fr 54px 1.5fr 110px}
    html.continuous-print .sheet{width:7.5in;max-width:none;margin:.5in;box-shadow:none}
    @media print{@page{margin:0}body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.bar{display:none}.sheet{width:calc(100% - 1in);max-width:none;margin:.5in;padding:0;box-shadow:none}.item-row,.summary,.sigs,.terms,.billto{break-inside:avoid;page-break-inside:avoid}}
  </style>
  <script>
    function mobilePdfExportRequired() {
      return window.matchMedia('(max-width:780px)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    }
    function appleMobilePrintRequired() {
      return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }
    var preparedMobilePdf = null;
    var preparedMobilePdfPromise = null;
    async function prepareContinuousPdf() {
      if (preparedMobilePdf) return preparedMobilePdf;
      if (preparedMobilePdfPromise) return preparedMobilePdfPromise;
      var sheet = document.querySelector('.sheet');
      var button = document.querySelector('.bar button');
      if (!sheet) return;
      var originalLabel = button ? button.textContent : '';
      preparedMobilePdfPromise = (async function () {
        if (button) { button.disabled = true; button.textContent = 'Creating PDF…'; }
        var modules = await Promise.all([
          import('https://esm.sh/html2canvas@1.4.1'),
          import('https://esm.sh/jspdf@2.5.2')
        ]);
        var html2canvas = modules[0].default;
        var Pdf = modules[1].jsPDF;
        document.documentElement.classList.add('measure-print', 'desktop-print');
        await Promise.all(Array.from(sheet.querySelectorAll('img')).map(function (image) {
          return image.complete ? Promise.resolve() : new Promise(function (resolve) {
            var timeout = setTimeout(resolve, 3000);
            function finish() { clearTimeout(timeout); resolve(); }
            image.addEventListener('load', finish, { once: true });
            image.addEventListener('error', finish, { once: true });
          });
        }));
        await new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); });
        var canvas = await Promise.race([
          html2canvas(sheet, {
            backgroundColor: '#ffffff',
            logging: false,
            scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
            useCORS: false,
            windowWidth: 816
          }),
          new Promise(function (_, reject) {
            setTimeout(function () { reject(new Error('PDF rendering timed out')); }, 20000);
          })
        ]);
        var pageWidth = 612;
        var contentWidth = 540;
        var contentHeight = canvas.height * contentWidth / canvas.width;
        var pageHeight = Math.min(14400, Math.ceil(contentHeight + 72));
        var fittedHeight = Math.min(contentHeight, pageHeight - 72);
        var pdf = new Pdf({ orientation: 'portrait', unit: 'pt', format: [pageWidth, pageHeight], compress: true });
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 36, 36, contentWidth, fittedHeight, undefined, 'FAST');
        var blob = pdf.output('blob');
        var url = URL.createObjectURL(blob);
        preparedMobilePdf = {
          file: new File([blob], ${JSON.stringify(pdfFilename)}, { type: 'application/pdf' }),
          url: url,
          filename: ${JSON.stringify(pdfFilename)},
          size: blob.size,
          pages: pdf.getNumberOfPages()
        };
        return preparedMobilePdf;
      })();
      try {
        return await preparedMobilePdfPromise;
      } finally {
        document.documentElement.classList.remove('measure-print', 'desktop-print');
        if (button) { button.disabled = false; button.textContent = originalLabel; }
        if (!preparedMobilePdf) preparedMobilePdfPromise = null;
      }
    }
    async function downloadContinuousPdf() {
      try {
        var prepared = await prepareContinuousPdf();
        if (!prepared) return;
        window.location.href = prepared.url;
        return { filename: prepared.filename, size: prepared.size, pages: prepared.pages, opened: true };
      } catch (error) {
        console.error('Mobile PDF generation failed', error);
        alert('Unable to create the PDF file. Check your connection and try again.');
      }
    }
    async function shareAppleMobilePdf() {
      try {
        var prepared = preparedMobilePdf || await prepareContinuousPdf();
        if (!prepared) return;
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [prepared.file] }))) {
          await navigator.share({
            files: [prepared.file],
            title: prepared.filename,
            text: ${JSON.stringify(mobileShareText)}
          });
          return;
        }
        window.location.href = prepared.url;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
        console.error('Apple PDF sharing failed', error);
        alert('Unable to open the PDF. Please try again.');
      }
    }
    function printContinuousPdf() {
      if (appleMobilePrintRequired()) return shareAppleMobilePdf();
      if (mobilePdfExportRequired()) return downloadContinuousPdf();
      var sheet = document.querySelector('.sheet');
      if (!sheet) return window.print();
      document.documentElement.classList.add('measure-print', 'continuous-print');
      requestAnimationFrame(function () {
        var pageHeight = Math.min(200, Math.ceil((sheet.scrollHeight / 96 + 1) * 100) / 100);
        var pageStyle = document.createElement('style');
        pageStyle.textContent = '@media print{@page{size:8.5in ' + pageHeight + 'in;margin:0}}';
        document.head.appendChild(pageStyle);
        document.documentElement.classList.remove('measure-print');
        window.addEventListener('afterprint', function () {
          pageStyle.remove();
          document.documentElement.classList.remove('continuous-print');
        }, { once: true });
        window.print();
      });
    }
    window.addEventListener('load', function () {
      if (appleMobilePrintRequired()) prepareContinuousPdf().catch(function (error) {
        console.error('Apple PDF preparation failed', error);
      });
    }, { once: true });
  </script></head>
  <body>
    <div class="bar"><button onclick="printContinuousPdf()">Print / Save as PDF</button><button class="ghost" onclick="window.close()">Close</button></div>
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
        ${!itemizedMode
          ? '<div class="ihead lump-sum"><span>Description</span></div>'
          : commercialJob
          ? '<div class="ihead commercial"><span>Description</span><span>Qty</span><span>Unit</span><span>Unit price</span><span>Amount</span></div>'
          : '<div class="ihead"><span>Description</span><span>Amount</span></div>'}
        <div class="ibody line-items-body">${itemRows}${scopeRow}</div>
      </div>
      ${payTable}
      ${paymentScheduleTable}
      <div class="foot">
        <div class="foot-left">
          <div class="thanks">${escapeHtml(BRAND.thankYou)}</div>
          ${kind === 'ESTIMATE' && depPct > 0 ? `<div class="term"><strong>${dep}% Upfront:</strong> A deposit of ${dep}%${depAmountText} is required upfront to cover material costs.</div>` : ''}
          <div class="qnote">For questions concerning this ${kind.toLowerCase()}, please contact<br/>${escapeHtml(BRAND.contact)}, ${escapeHtml(BRAND.phone)}, ${escapeHtml(BRAND.email)}<br/><a href="https://${escapeHtml(BRAND.website)}">${escapeHtml(BRAND.website)}</a></div>
        </div>
        <div class="foot-right summary">
          ${summaryHtml}
          ${hasBalance ? `<div class="balance"><span>${escapeHtml(effBalanceLabel)}</span><strong${effBalanceColor ? ` style="color:${effBalanceColor}"` : ''}>${money.format(num(balance))}</strong></div>` : ''}
          ${hasComments ? `<div class="box"><div class="lbl">Comments</div><div class="val">${escapeHtml(comments)}</div></div>` : ''}
        </div>
      </div>
      ${paymentInstructions}
      ${termsBlock}
      ${sigsBlock}
      <div class="verse">${escapeHtml(BRAND.verse)}</div>
    </div>
  </body></html>`;
}

export function buildEstimateDocHtml(estimate) {
  const items = estimate.items || [];
  const itemizedMode = estimate.itemizedMode !== false;
  let rows;
  if (items.length) {
    rows = items.map(it => {
      const q = num(it.quantity);
      return {
        descHtml: escapeHtml(it.description || ''),
        quantity: q,
        unit: it.unit || '',
        unitPrice: num(it.unitPrice),
        amount: num(it.amount != null ? it.amount : q * num(it.unitPrice))
      };
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
  const itemizedSubtotal = estimate.subtotal != null ? num(estimate.subtotal) : rows.reduce((sum, row) => sum + num(row.amount), 0);
  const lumpSumTotal = num(estimate.lumpSumTotal != null ? estimate.lumpSumTotal : estimate.estimatedCost);
  const subtotal = itemizedMode ? itemizedSubtotal : lumpSumTotal;
  const taxFreeTotal = itemizedMode ? subtotal + num(estimate.finalPay) + num(estimate.permitsFees) : lumpSumTotal;
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
    commercialJob: estimate.commercialJob === true,
    itemizedMode,
    balanceLabel: 'TOTAL',
    balance: taxFreeTotal,
    depositPercent: num(estimate.depositPercent),
    depositAmount: num(estimate.depositAmount),
    validUntil: estimate.validUntil || '',
    preparedBy: estimate.user || currentUserName(),
    subtotal: null,
    taxPercent: num(estimate.taxPercent),
    taxAmount: num(estimate.taxAmount),
    terms: estimate.termsAndConditions || DEFAULT_ESTIMATE_TERMS,
    signatureBlockEnabled: estimate.signatureBlockEnabled === true
  });
}

export function printEstimate(estimate, { autoPrint = false } = {}) {
  const html = buildEstimateDocHtml(estimate);
  saveDocument('estimate', estimate.estimateNumber || estimate.id || autoNumber('EST'), estimate.clientName, estimate.estimatedCost, html, estimate.user || currentUserName());
  renderDocuments();
  openPrintWindow(html, { autoPrint });
}

export function buildInvoiceDocHtml(invoice) {
  const items = invoice.items || [];
  const itemizedMode = invoice.itemizedMode !== false;
  const rows = items.map(item => {
    const q = num(item.quantity);
    return {
      descHtml: escapeHtml(item.description || ''),
      quantity: q,
      unit: item.unit || '',
      unitPrice: num(item.unitPrice),
      amount: num(item.amount != null ? item.amount : q * num(item.unitPrice))
    };
  });
  const itemizedSubtotal = items.reduce((s, it) => s + num(it.amount != null ? it.amount : num(it.quantity) * num(it.unitPrice)), 0);
  const finalPercent = num(invoice.finalPercent);
  const finalPay = itemizedMode && finalPercent > 0 ? itemizedSubtotal * (finalPercent / 100) : 0;
  const fees = num(invoice.permitsFees);
  const lumpSumTotal = num(invoice.lumpSumTotal != null ? invoice.lumpSumTotal : invoice.total);
  const total = itemizedMode ? itemizedSubtotal + finalPay + fees : lumpSumTotal;
  const sub = itemizedMode ? itemizedSubtotal : lumpSumTotal;
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
    scope: invoice.scope,
    rows,
    commercialJob: invoice.commercialJob === true,
    itemizedMode,
    balanceLabel: 'BALANCE DUE',
    balance,
    balanceColor: balance > 0.01 ? '#c62828' : '#2e7d32',
    preparedBy: invoice.user || currentUserName(),
    subtotal: sub,
    taxPercent: 0,
    taxAmount: 0,
    permitsFees: fees,
    finalPay,
    paymentsReceived: paid,
    paymentsRows: payments,
    terms: invoice.terms || DEFAULT_INVOICE_TERMS,
    signatureBlockEnabled: false
  });
}

export function printInvoice(invoice) {
  const html = buildInvoiceDocHtml(invoice);
  saveDocument('invoice', invoice.invoiceNumber || invoice.id || autoNumber('INV'), invoice.clientName, invoice.total, html, invoice.user || currentUserName());
  renderDocuments();
  openPrintWindow(html);
}

function contractLines(value, fallback = '—') {
  const text = String(value || '').trim();
  return text ? escapeHtml(text).replace(/\n/g, '<br>') : fallback;
}

function contractDate(value) {
  return documentDate(value);
}

function contractSection(number, title, body, className = '') {
  return `<section class="agreement-section ${className}"><h2>${number}. ${title}</h2>${body}</section>`;
}

export function buildContractDocHtml(contract) {
  const number = escapeHtml(contract.contractNumber || '—');
  const date = escapeHtml(contractDate(contract.date) || '—');
  const clientName = String(contract.clientName || 'Client').trim() || 'Client';
  const clientFirstName = clientName.split(/\s+/)[0] || 'there';
  const senderName = String(currentUserName() || contract.user || BRAND.contact || 'Harvest Renovation').trim();
  const pdfFilename = `Harvest Renovation - Contract - ${clientName}- ${String(contract.contractNumber || 'Contract').trim() || 'Contract'}`
    .replace(/[\\/:*?"<>|]+/g, '-') + '.pdf';
  const mobileShareText = `Hi ${clientFirstName},\n\nYour contract is ready! I’ve attached it for you to review.\n\nIf you have any questions, would like to make any adjustments, or want to go over any of the details, please feel free to reach out. We’re happy to work with you and make sure everything fits what you have in mind.\n\nWe’d love the opportunity to bring your project to life and look forward to working with you!\n\nBest regards,\n${senderName}\nHarvest Renovation`;
  const propertyAddress = contract.propertyAddress || contract.billingAddress || '';
  const estimatedStartDate = contract.estimatedStartDate ? escapeHtml(contractDate(contract.estimatedStartDate)) : '________________';
  const estimatedCompletionDate = contract.estimatedCompletionDate ? escapeHtml(contractDate(contract.estimatedCompletionDate)) : '________________';
  const residentialProject = contract.residentialProject !== false;
  const signedAtClientHome = contract.signedAtClientHome !== false;
  const schedule = contract.paymentSchedule || [];
  const scheduleRows = schedule.length
    ? schedule.map(payment => `<tr><td>${escapeHtml(payment.label || '—')}</td><td>${money.format(num(payment.amount))}</td><td>${num(payment.percent)}%</td><td>${escapeHtml(payment.dueDescription || '—')}</td></tr>`).join('')
    : '<tr><td>—</td><td>—</td><td>—</td><td>—</td></tr>';
  const projectTerms = contract.terms && contract.terms !== DEFAULT_CONTRACT_TERMS
    ? `<div class="project-terms"><h3>Additional Project Terms</h3>${termsToHtml(contract.terms)}</div>`
    : '';
  const sections = [
    contractSection(1, 'CONTRACTOR', `<div class="party-block"><strong>Harvest Renovation LLC</strong><br>${escapeHtml(BRAND.contact)}<br>${escapeHtml(BRAND.phone)}<br>${escapeHtml(BRAND.email)}<br>${escapeHtml(BRAND.website)}<br>Houston, TX 77051</div>`),
    contractSection(2, 'CLIENT / PROPERTY OWNER', `<div class="field-grid"><span>Name</span><strong>${contractLines(contract.clientName)}</strong><span>Phone</span><strong>${contractLines(contract.billingPhone)}</strong><span>Email</span><strong>${contractLines(contract.billingEmail)}</strong><span>Property Address</span><strong>${contractLines(propertyAddress)}</strong></div><div class="spouse-block"><strong>Spouse (if applicable — Texas homestead law may require both spouses to sign)</strong><div class="fill-row"><span>Spouse Name</span><i></i></div><div class="fill-row"><span>Spouse Signature</span><i></i></div></div>`),
    contractSection(3, 'SCOPE OF WORK', `<p>Contractor agrees to furnish all labor, materials, equipment, and supervision necessary to complete the work described below.</p><div class="scope-box">${contractLines(contract.scope, 'Scope to be provided.')}</div>`),
    contractSection(4, 'EXCLUSIONS', `<p>Unless specifically listed in the Scope of Work, the following are excluded: permits, engineering, hidden or unforeseen conditions, repairs due to code violations, structural work, painting, low voltage/security, appliances, or any work not expressly stated above.</p>${contract.exclusions ? `<div class="project-exclusions"><strong>Project-specific exclusions or exceptions</strong><p>${contractLines(contract.exclusions)}</p></div>` : ''}`),
    contractSection(5, 'CONTRACT PRICE', `<p>The total price for the work described above is:</p><div class="price-box"><span>TOTAL CONTRACT PRICE</span><strong>${money.format(num(contract.contractAmount))}</strong></div><p>This price includes all labor, materials, equipment, and supervision unless otherwise noted.</p>`),
    contractSection(6, 'PAYMENT SCHEDULE', `<p>Payment shall be made as follows:</p><table><thead><tr><th>Milestone</th><th>Amount</th><th>%</th><th>When Due</th></tr></thead><tbody>${scheduleRows}</tbody></table>`),
    contractSection(7, 'ACCEPTED PAYMENT METHODS', '<p>We accept cash, check, Zelle, ACH bank transfer, and major credit cards. All payments must be made in U.S. dollars. If the final payment is not received within 10 business days, there will be a late fee of 5%.</p>'),
    contractSection(8, 'START & COMPLETION', `<div class="date-lines"><div class="fill-row"><span>Estimated Start Date</span><strong>${estimatedStartDate}</strong></div><div class="fill-row"><span>Estimated Completion Date</span><strong>${estimatedCompletionDate}</strong></div></div><p>Dates are estimates and may be adjusted due to weather, material availability, or unforeseen circumstances.</p>`),
    contractSection(9, 'CHANGE ORDERS', '<p>Any changes to the Scope of Work, materials, or cost must be approved in writing by both parties before additional work is performed. Change Orders will include a description of the change, cost adjustment, and any impact on the schedule.</p>'),
    contractSection(10, 'CUSTOMER RESPONSIBILITIES', '<ul><li>Provide access to the property</li><li>Ensure the work area is safe and free from hazards</li><li>Make timely payments as outlined</li><li>Secure pets and inform of any special instructions</li></ul>'),
    contractSection(11, 'WARRANTIES', '<p>Contractor provides a 1-year warranty on workmanship from the date of completion. Manufacturer warranties apply to materials as provided by the manufacturer.</p><p>This warranty does not cover damage caused by misuse, improper maintenance, or normal wear and tear.</p>'),
    contractSection(12, 'CANCELLATION', '<p>Customer may cancel this Agreement before work begins with a written notice.</p><p>If we have started any work and Client cancels, Client agrees to pay the fee associated with the work completed and any costs incurred up to the date of cancellation.</p>'),
    contractSection(13, 'LIMITATION OF LIABILITY', '<p>Contractor\'s liability is limited to the total amount paid under this Agreement. Contractor shall not be liable for any indirect, incidental, or consequential damages. (Only if Contractor or workers cause damage to the property, Contractor shall be responsible for repairing or replacing the damaged area.)</p>'),
    contractSection(14, 'INSURANCE', '<p>Contractor maintains general liability insurance. Proof of insurance is available upon request.</p>'),
    contractSection(15, 'DISPUTE RESOLUTION', '<p>Any disputes will first be attempted to be resolved through good faith negotiation. If unresolved, disputes shall be resolved in accordance with the laws of the State of Texas.</p>'),
    contractSection(16, 'GOVERNING LAW', '<p>This Agreement shall be governed by the laws of the State of Texas.</p>')
  ].join('');

  const disclosure = residentialProject ? contractSection(17, 'TEXAS RESIDENTIAL CONSTRUCTION DISCLOSURE STATEMENT', `<div class="statutory"><p><strong>KNOW YOUR RIGHTS AND RESPONSIBILITIES UNDER THE LAW.</strong> You are about to enter into a transaction to build a new home or remodel existing residential property. Texas law requires your contractor to provide you with this brief overview of some of your rights, responsibilities, and risks in this transaction.</p>
    <p><strong>CONVEYANCE TO CONTRACTOR NOT REQUIRED.</strong> Your contractor may not require you to convey your real property to your contractor as a condition to the agreement for the construction of improvements on your property.</p>
    <p><strong>KNOW YOUR CONTRACTOR.</strong> Before you enter into your agreement for the construction of improvements to your real property, make sure that you have investigated your contractor. Obtain and verify references from other people who have used the contractor for the type and size of construction project on your property.</p>
    <p><strong>GET IT IN WRITING.</strong> Make sure that you have a written agreement with your contractor that includes: (1) a description of the work the contractor is to perform; (2) the required or estimated time for completion of the work; (3) the cost of the work or how the cost will be determined; and (4) the procedure and method of payment, including provisions for statutory reservation of funds and conditions for final payment. If your contractor made a promise, warranty, or representation to you concerning the work the contractor is to perform, make sure that promise, warranty, or representation is specified in the written agreement. An oral promise that is not included in the written agreement may not be enforceable under Texas law.</p>
    <p><strong>READ BEFORE YOU SIGN.</strong> Do not sign any document before you have read and understood it. NEVER SIGN A DOCUMENT THAT INCLUDES AN UNTRUE STATEMENT. Take your time in reviewing documents. If you borrow money from a lender to pay for the improvements, you are entitled to have the loan closing documents furnished to you for review at least one business day before the closing. Do not waive this requirement unless a bona fide emergency or another good cause exists, and make sure you understand the documents before you sign them. If you fail to comply with the terms of the documents, you could lose your property. You are entitled to have your own attorney review any documents. If you have any question about the meaning of a document, consult an attorney.</p>
    <p><strong>GET A LIST OF SUBCONTRACTORS AND SUPPLIERS.</strong> Before construction commences, your contractor is required to provide you with a list of the subcontractors and suppliers the contractor intends to use on your project. Your contractor is required to supply updated information on any subcontractors and suppliers added after the list is provided. Your contractor is not required to supply this information if you sign a written waiver of your rights to receive this information.</p>
    <p><strong>MONITOR THE WORK.</strong> Lenders and governmental authorities may inspect the work in progress from time to time for their own purposes. These inspections are not intended as quality control inspections. Quality control is a matter for you and your contractor. To ensure that your home is being constructed in accordance with your wishes and specifications, you should inspect the work yourself or have your own independent inspector review the work in progress.</p>
    <p><strong>MONITOR PAYMENTS.</strong> If you use a lender, your lender is required to provide you with a periodic statement showing the money disbursed by the lender from the proceeds of your loan. Each time your contractor requests payment from you or your lender for work performed, your contractor is also required to furnish you with a disbursement statement that lists the name and address of each subcontractor or supplier that the contractor intends to pay from the requested funds. Review these statements and make sure that the money is being properly disbursed.</p>
    <p><strong>CLAIMS BY SUBCONTRACTORS AND SUPPLIERS.</strong> Under Texas law, if a subcontractor or supplier who furnishes labor or materials for the construction of improvements on your property is not paid, you may become liable and your property may be subject to a lien for the unpaid amount, even if you have not contracted directly with the subcontractor or supplier. To avoid liability, you should take the following actions:</p>
    <p>(1) If you receive a written notice from a subcontractor or supplier, you should withhold payment from your contractor for the amount of the claim stated in the notice until the dispute between your contractor and the subcontractor or supplier is resolved. If your lender is disbursing money directly to your contractor, you should immediately provide a copy of the notice to your lender and instruct the lender to withhold payment in the amount of the claim stated in the notice. If you continue to pay the contractor after receiving the written notice without withholding the amount of the claim, you may be liable and your property may be subject to a lien for the amount you failed to withhold.</p>
    <p>(2) During construction and for 30 days after final completion, termination, or abandonment of the contract by the contractor, you should reserve or cause your lender to reserve 10 percent of the amount of payments made for the work performed by your contractor. If you choose not to reserve the 10 percent for at least 30 days after final completion, termination, or abandonment of the contract by the contractor and if a valid claim is timely made by a claimant and your contractor fails to pay the claim, you may be personally liable and your property may be subject to a lien up to the amount that you failed to reserve.</p>
    <p>If a claim is not paid within a certain time period, the claimant is required to file a mechanic's lien affidavit in the real property records of the county where the property is located. A mechanic's lien affidavit must be filed by the claimant not later than the 15th day of the third month after the date the claimant's agreement with the contractor terminates, or the date of completion, abandonment, or termination of the work under the original contract, whichever is later.</p>
    <p><strong>ACKNOWLEDGMENT OF RECEIPT.</strong> By signing this Agreement, the Client acknowledges receipt of this Disclosure Statement before execution of this contract, as required by Texas Property Code §53.255.</p></div>`, 'page-break statutory-section') : '';

  const liabilityNotice = residentialProject ? contractSection(18, 'TEXAS RESIDENTIAL CONSTRUCTION LIABILITY ACT NOTICE', '<div class="statutory notice-box"><strong>This contract is subject to Chapter 27 of the Texas Property Code. The provisions of that chapter may affect your right to recover damages arising from a construction defect. If you have a complaint concerning a construction defect and that defect has not been corrected as may be required by law or by contract, you must provide the notice required by Chapter 27 of the Texas Property Code to the contractor by certified mail, return receipt requested, not later than the 60th day before the date you file suit to recover damages in a court of law or initiate arbitration. The notice must refer to Chapter 27 of the Texas Property Code and must describe the construction defect. If requested by the contractor, you must provide the contractor an opportunity to inspect and cure the defect as provided by Section 27.004 of the Texas Property Code.</strong></div>', 'statutory-section') : '';
  const homeownerNotice = residentialProject ? contractSection(19, 'IMPORTANT NOTICE — HOMEOWNER RIGHTS', '<div class="statutory notice-box"><strong>IMPORTANT NOTICE: You and your contractor are responsible for meeting the terms and conditions of this contract. If you sign this contract and you fail to meet the terms and conditions of this contract, you may lose your legal ownership rights in your home. KNOW YOUR RIGHTS AND DUTIES UNDER THE LAW.</strong></div>', 'statutory-section') : '';
  const cancellationNotice = signedAtClientHome ? contractSection(20, 'THREE-DAY RIGHT TO CANCEL (IF CONTRACT IS SIGNED AT CLIENT\'S HOME)', `<div class="statutory"><p><strong>NOTICE OF RIGHT TO CANCEL.</strong> You may cancel this transaction, without any penalty or obligation, within three (3) business days from the date of signing this Agreement.</p><p>To cancel, sign and date the Notice of Cancellation below and mail or deliver it to:</p><p><strong>Harvest Renovation LLC</strong><br>${escapeHtml(BRAND.contact)}<br>Houston, TX 77051<br>${escapeHtml(BRAND.email)}<br>${escapeHtml(BRAND.phone)}</p><div class="cancellation-form"><h3>NOTICE OF CANCELLATION</h3><p>(If you wish to cancel this Agreement, complete and return this form within 3 business days.)</p><p>I hereby cancel this Agreement entered into on the following date:</p><div class="fill-row"><span>Date of Agreement</span><i></i></div><div class="fill-row"><span>Signature</span><i></i></div><div class="fill-row"><span>Printed Name</span><i></i></div><div class="fill-row"><span>Date</span><i></i></div></div></div>`, 'page-break statutory-section') : '';
  const acknowledgmentItems = [residentialProject ? 'the Texas Residential Construction Disclosure Statement (Section 17), the Texas Residential Construction Liability Act Notice (Section 18), and the Important Notice (Section 19)' : '', signedAtClientHome ? 'the Notice of Right to Cancel (Section 20)' : ''].filter(Boolean);
  const acknowledgmentReceipt = acknowledgmentItems.length ? `<p>The Client acknowledges that they have received and read ${acknowledgmentItems.join(' and ')} before signing this Agreement.</p>` : '';
  const ownerSignatureNotice = residentialProject ? '<div class="signature-notice"><strong>IMPORTANT NOTICE: You and your contractor are responsible for meeting the terms and conditions of this contract. If you sign this contract and you fail to meet the terms and conditions of this contract, you may lose your legal ownership rights in your home. KNOW YOUR RIGHTS AND DUTIES UNDER THE LAW.</strong></div>' : '';
  const acknowledgments = contractSection(21, 'ACKNOWLEDGMENTS', `<p>By signing below, both parties agree to the terms and conditions outlined in this Service Agreement &amp; Contract. This Agreement represents the entire understanding between the parties and may only be modified in writing and signed by both parties.</p>${acknowledgmentReceipt}<div class="signature-party"><h3>CONTRACTOR: HARVEST RENOVATION LLC</h3><div class="signature-grid"><div><i></i><span>Signature</span></div><div><i></i><span>Printed Name</span></div><div><i></i><span>Date</span></div></div></div><div class="signature-party owner-signature"><h3>CLIENT / PROPERTY OWNER</h3>${ownerSignatureNotice}<div class="signature-grid"><div><i></i><span>Signature</span></div><div><i></i><span>Printed Name</span></div><div><i></i><span>Date</span></div></div></div><div class="signature-party"><h3>SPOUSE (if applicable — Texas homestead law may require both spouses to sign)</h3><div class="signature-grid"><div><i></i><span>Signature</span></div><div><i></i><span>Printed Name</span></div><div><i></i><span>Date</span></div></div></div>`, 'page-break');
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
  ${(typeof document !== 'undefined' && document.baseURI) ? `<base href="${escapeHtml(document.baseURI)}">` : ''}
  <title>Service Agreement &amp; Contract ${number} — Harvest Renovation</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;padding:0;background:#eee9e0;color:#181410;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .bar{position:sticky;top:0;z-index:5;display:flex;gap:10px;justify-content:center;padding:14px;background:#181410}.bar button{font:700 14px Arial;padding:10px 18px;border-radius:8px;border:1px solid #caa05a;background:#caa05a;color:#181410;cursor:pointer}.bar .ghost{background:transparent;color:#fff}
    .sheet{width:816px;max-width:96vw;margin:22px auto;background:#fff;box-shadow:0 18px 50px rgba(0,0,0,.16)}.masthead{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:24px 34px;background:#0f0c08;color:#fff;border-bottom:5px solid #caa05a}.brand{display:flex;align-items:center;gap:13px}.brand-logo{height:66px;width:auto}.brand-fallback{display:flex;align-items:center}.brand-copy{display:flex;flex-direction:column}.brand-name{font-size:20px;font-weight:800;color:#f5e7d0}.brand-contact{margin-top:4px;font-size:10px;line-height:1.45;color:#d8c5a6}.document-title{text-align:right}.document-title h1{margin:0;font-size:26px;letter-spacing:.06em}.document-title p{margin:6px 0 0;color:#caa05a;font-size:10px;text-transform:uppercase;letter-spacing:.12em}
    .agreement-intro{padding:20px 34px 8px;font-size:11px;line-height:1.55}.agreement-meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.meta-cell{border:1px solid #d8c9b2}.meta-cell span{display:block;padding:6px 10px;background:#181410;color:#caa05a;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}.meta-cell strong{display:block;padding:10px;font-size:12px}
    .agreement-body{padding:0 34px 26px}.agreement-section{margin-top:15px;break-inside:avoid;page-break-inside:avoid}.agreement-section h2{margin:0;padding:7px 10px;background:#181410;color:#caa05a;font-size:11px;letter-spacing:.07em}.agreement-section p,.agreement-section li,.party-block{font-size:10pt;line-height:1.48}.agreement-section p{margin:9px 2px}.agreement-section ul{margin:8px 0;padding-left:23px}.party-block{padding:10px;border:1px solid #ddd2c2;border-top:0}.field-grid{display:grid;grid-template-columns:120px 1fr;border:1px solid #ddd2c2;border-top:0}.field-grid span,.field-grid strong{padding:7px 10px;border-bottom:1px solid #eee6da;font-size:10pt}.field-grid span{font-weight:700;background:#faf7f1}.spouse-block{padding:10px;border:1px solid #ddd2c2;border-top:0;font-size:9pt}.fill-row{display:flex;align-items:flex-end;gap:9px;margin-top:12px;font-size:10pt}.fill-row span{white-space:nowrap}.fill-row i{display:block;flex:1;height:16px;border-bottom:1px solid #4d4438}.fill-row strong{flex:1;padding-bottom:2px;border-bottom:1px solid #4d4438}.scope-box{min-height:110px;padding:12px;border:1px solid #d8c9b2;line-height:1.55;white-space:normal;font-size:10pt}.project-exclusions{margin-top:9px;padding:10px;border:1px solid #d8c9b2;background:#faf7f1;font-size:10pt}.project-exclusions p{margin-bottom:0}.price-box{display:flex;justify-content:space-between;align-items:center;margin:10px 0;padding:12px 15px;background:#f7ead2;border:2px solid #caa05a}.price-box span{font-size:10px;font-weight:800;letter-spacing:.08em}.price-box strong{font-size:18px}
    table{width:100%;border-collapse:collapse;margin-top:8px;font-size:9pt}th{background:#181410;color:#caa05a;text-align:left;text-transform:uppercase;letter-spacing:.06em}th,td{padding:8px;border:1px solid #d8c9b2}th:nth-child(2),td:nth-child(2),th:nth-child(3),td:nth-child(3){text-align:right}.date-lines{display:grid;grid-template-columns:1fr 1fr;gap:24px}.project-terms{margin-top:16px;padding:12px;border:1px solid #d8c9b2;background:#faf7f1}.project-terms h3,.cancellation-form h3,.signature-party h3{margin:0 0 8px;font-size:10pt}.terms-list{margin:0;padding-left:20px}
    .statutory-section{break-inside:auto;page-break-inside:auto}.statutory{font-size:10pt;font-weight:700;line-height:1.48}.statutory p{font-size:10pt}.notice-box{margin-top:8px;padding:12px;border:2px solid #181410;background:#faf7f1}.cancellation-form{margin-top:14px;padding:14px;border:2px dashed #6b5d46;break-before:page;page-break-before:always;break-inside:avoid}.signature-party{margin-top:20px;break-inside:avoid}.signature-notice{margin:8px 0 12px;padding:10px;border:2px solid #181410;background:#faf7f1;font-size:10pt;line-height:1.4}.signature-grid{display:grid;grid-template-columns:1.6fr 1.2fr .7fr;gap:18px}.signature-grid div{display:flex;flex-direction:column}.signature-grid i{height:35px;border-bottom:1px solid #181410}.signature-grid span{padding-top:5px;font-size:8pt;color:#6b5d46}.verse{padding:12px 24px;background:#181410;color:#caa05a;text-align:center;font-size:9pt}.page-break{break-before:page;page-break-before:always}
    @media screen and (max-width:700px){.sheet{width:100%;max-width:none;margin:0;box-shadow:none}.masthead{align-items:flex-start;flex-direction:column;padding:18px}.document-title{text-align:left}.agreement-intro,.agreement-body{padding-left:16px;padding-right:16px}.agreement-meta,.date-lines,.signature-grid{grid-template-columns:1fr}.field-grid{grid-template-columns:100px 1fr}table{font-size:8pt}th,td{padding:6px 4px}}
    html.measure-print .bar{display:none}
    html.desktop-print .sheet{width:7.5in;max-width:none;margin:0;box-shadow:none}
    html.desktop-print .masthead{align-items:center;flex-direction:row;padding:24px 34px}
    html.desktop-print .document-title{text-align:right}
    html.desktop-print .agreement-intro{padding:20px 34px 8px}
    html.desktop-print .agreement-body{padding:0 34px 26px}
    html.desktop-print .agreement-meta{grid-template-columns:1fr 1fr}
    html.desktop-print .date-lines{grid-template-columns:1fr 1fr}
    html.desktop-print .signature-grid{grid-template-columns:1.6fr 1.2fr .7fr}
    html.desktop-print .field-grid{grid-template-columns:120px 1fr}
    html.desktop-print table{font-size:9pt}
    html.desktop-print th,html.desktop-print td{padding:8px}
    html.continuous-print .sheet{width:7.5in;max-width:none;margin:.5in;box-shadow:none}
    @media print{@page{size:letter;margin:0}body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.bar{display:none}.sheet{width:calc(100% - 1in);max-width:none;margin:.5in;padding:0;box-shadow:none}.agreement-section{orphans:3;widows:3}.agreement-section h2{break-after:avoid;page-break-after:avoid}}
  </style>${contractMobilePdfScript(pdfFilename, mobileShareText)}</head><body><div class="bar"><button onclick="printContinuousPdf()">Print / Save as PDF</button><button class="ghost" onclick="window.close()">Close</button></div><main class="sheet">
    <header class="masthead"><div class="brand"><span class="brand-fallback">${brandWheatSvg()}</span><img class="brand-logo" src="${BRAND_LOGO_PATH}" alt="Harvest Renovation LLC" style="display:none" onload="this.style.display='block';this.previousElementSibling.style.display='none'" onerror="this.style.display='none'" /><span class="brand-copy"><span class="brand-name">HARVEST RENOVATION LLC</span><span class="brand-contact">${escapeHtml(BRAND.contact)} | ${escapeHtml(BRAND.phone)} | ${escapeHtml(BRAND.email)}<br>${escapeHtml(BRAND.website)} | Houston, TX 77051</span></span></div><div class="document-title"><h1>SERVICE AGREEMENT<br>&amp; CONTRACT</h1><p>${escapeHtml(contract.status || 'Draft')}</p></div></header>
    <div class="agreement-intro"><p>THIS SERVICE AGREEMENT &amp; CONTRACT ("Agreement") is made and entered into on the date below by and between the parties listed herein.</p><div class="agreement-meta"><div class="meta-cell"><span>Agreement No.</span><strong>${number}</strong></div><div class="meta-cell"><span>Date</span><strong>${date}</strong></div></div></div>
    <div class="agreement-body">${sections}${projectTerms}${disclosure}${liabilityNotice}${homeownerNotice}${cancellationNotice}${acknowledgments}</div><footer class="verse">${escapeHtml(BRAND.verse)}</footer>
  </main></body></html>`;
}

export function printContract(contract) {
  const html = buildContractDocHtml(contract);
  saveDocument('contract', contract.contractNumber || contract.id || autoNumber('CON'), contract.clientName, contract.contractAmount, html, contract.user || currentUserName());
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
