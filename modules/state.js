import { portalConfig } from '../config.js';

export const config = portalConfig || {};
export const STORAGE_KEY = 'harvest-portal-pro-crm-v1';
export const DASHBOARD_VIEW_MODE_KEY = 'harvest-portal-pro-dashboard-view-mode';
export const BOOTSTRAP_STATE_KEY = '__HARVEST_PORTAL_BOOTSTRAP__';
export const TRASH_RETENTION_DAYS = 30;
export const THEME_KEY = 'harvest-portal-theme';
export const ADMIN_VIEW_KEY = 'harvest-portal-admin-view';

// Each template ships with realistic starter line items. Item amounts are
// computed on save (quantity * unitPrice). The legacy rate/materialPercent/
// laborPercent/finalPercent/scope fields remain for backwards compatibility.
export const estimateTemplates = {
  'Kitchen Remodeling': { trade: 'Kitchen Remodeling', measurementType: 'SquareFoot', rate: 28, materialPercent: 12, laborPercent: 18, finalPercent: 8, scope: 'Cabinet updates, countertops, backsplash, lighting, paint, trim, and finish coordination.', items: [
    { description: 'Demo & haul-away', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 1200 },
    { description: 'Cabinets — supply & install', category: 'Materials', quantity: 1, unit: 'LS', unitPrice: 8500 },
    { description: 'Countertops — measure, fabricate, install', category: 'Subcontractor', quantity: 1, unit: 'LS', unitPrice: 4200 },
    { description: 'Plumbing rough-in & fixtures', category: 'Subcontractor', quantity: 1, unit: 'LS', unitPrice: 1800 },
    { description: 'Finish carpentry, paint, punch', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 2400 }
  ] },
  'Bathroom Remodeling': { trade: 'Bathroom Remodeling', measurementType: 'SquareFoot', rate: 30, materialPercent: 12, laborPercent: 18, finalPercent: 8, scope: 'Tile, vanity, plumbing coordination, lighting, drywall touchups, paint, and finish work.', items: [
    { description: 'Demo & disposal', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 900 },
    { description: 'Shower/tub tile — supply & install', category: 'Materials', quantity: 1, unit: 'LS', unitPrice: 3800 },
    { description: 'Vanity, toilet & fixtures', category: 'Materials', quantity: 1, unit: 'LS', unitPrice: 2200 },
    { description: 'Plumbing & electrical rough-in', category: 'Subcontractor', quantity: 1, unit: 'LS', unitPrice: 1600 },
    { description: 'Drywall, paint & finish', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 1400 }
  ] },
  'Commercial Build-Out': { trade: 'Commercial Build-Out', measurementType: 'SquareFoot', rate: 42, materialPercent: 14, laborPercent: 20, finalPercent: 10, scope: 'Build-out coordination, framing, drywall, finishes, punch, and site organization.', items: [
    { description: 'Metal stud framing', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 6500 },
    { description: 'Drywall, tape & finish', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 5200 },
    { description: 'Electrical & lighting', category: 'Subcontractor', quantity: 1, unit: 'LS', unitPrice: 7800 },
    { description: 'HVAC modifications', category: 'Subcontractor', quantity: 1, unit: 'LS', unitPrice: 6400 },
    { description: 'Flooring, paint & final finishes', category: 'Materials', quantity: 1, unit: 'LS', unitPrice: 8900 }
  ] },
  Flooring: { trade: 'Flooring', measurementType: 'SquareFoot', rate: 6, materialPercent: 10, laborPercent: 15, finalPercent: 8, scope: 'Demo, prep, install, transitions, trim reset, and cleanup.', items: [
    { description: 'Remove existing flooring & prep', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 850 },
    { description: 'Flooring material', category: 'Materials', quantity: 500, unit: 'SF', unitPrice: 4.5 },
    { description: 'Installation labor', category: 'Labor', quantity: 500, unit: 'SF', unitPrice: 3 },
    { description: 'Transitions, trim & cleanup', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 600 }
  ] },
  Painting: { trade: 'Painting', measurementType: 'SquareFoot', rate: 2.5, materialPercent: 10, laborPercent: 15, finalPercent: 8, scope: 'Prep, patching, caulking, primer as needed, paint, and cleanup.', items: [
    { description: 'Surface prep, patch & caulk', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 700 },
    { description: 'Paint & primer material', category: 'Materials', quantity: 1, unit: 'LS', unitPrice: 650 },
    { description: 'Interior painting labor', category: 'Labor', quantity: 1400, unit: 'SF', unitPrice: 1.75 },
    { description: 'Cleanup & touch-up', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 350 }
  ] },
  'Drywall / Framing / Electrical': { trade: 'Drywall / Framing / Electrical', measurementType: 'LinearFoot', rate: 24, materialPercent: 10, laborPercent: 15, finalPercent: 8, scope: 'Framing adjustments, drywall patch and finish, electrical support, and cleanup.', items: [
    { description: 'Framing adjustments', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 1400 },
    { description: 'Drywall material & board', category: 'Materials', quantity: 1, unit: 'LS', unitPrice: 900 },
    { description: 'Hang, tape, finish drywall', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 1800 },
    { description: 'Electrical support & fixtures', category: 'Subcontractor', quantity: 1, unit: 'LS', unitPrice: 1500 }
  ] },
  'Whole Home Renovation': { trade: 'Whole Home Renovation', measurementType: 'SquareFoot', rate: 40, materialPercent: 12, laborPercent: 20, finalPercent: 10, scope: 'Multi-room renovation with planning, trade coordination, finishes, and punch completion.', items: [
    { description: 'Demo & site prep', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 4500 },
    { description: 'Framing, drywall & structural', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 12000 },
    { description: 'Plumbing, electrical & HVAC', category: 'Subcontractor', quantity: 1, unit: 'LS', unitPrice: 18000 },
    { description: 'Kitchen & bath finishes', category: 'Materials', quantity: 1, unit: 'LS', unitPrice: 16500 },
    { description: 'Flooring, paint, trim & punch', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 9500 }
  ] },
  Roofing: { trade: 'Roofing', measurementType: 'SquareFoot', rate: 8.5, materialPercent: 14, laborPercent: 18, finalPercent: 8, scope: 'Remove and replace roofing materials, underlayment, flashing, cleanup, and final walkthrough.', items: [
    { description: 'Tear-off & disposal', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 1800 },
    { description: 'Shingles & underlayment', category: 'Materials', quantity: 22, unit: 'EA', unitPrice: 165 },
    { description: 'Flashing, vents & accessories', category: 'Materials', quantity: 1, unit: 'LS', unitPrice: 900 },
    { description: 'Installation labor', category: 'Labor', quantity: 1, unit: 'LS', unitPrice: 3600 }
  ] },
  Other: { trade: 'General Scope', measurementType: 'FlatRate', rate: 0, materialPercent: 10, laborPercent: 15, finalPercent: 8, scope: 'Custom scope to be defined after field review.', items: [] }
};

export const DEFAULT_ESTIMATE_TERMS = [
  '1. This estimate is valid for 30 days from the date of issue unless otherwise stated.',
  '2. A deposit is required upfront to cover material costs and secure the job on the schedule. Work begins once the deposit is received.',
  '3. Any additional requests or changes to the agreed-upon scope will be documented as a Change Order and may result in a price adjustment.',
  '4. Client is responsible for any city permits or HOA approvals unless explicitly included above.',
  '5. Materials or fixtures supplied by the client are at the client\u2019s risk; Harvest Renovation is not responsible for defects, delays, or breakage of client-supplied items.',
  '6. Balance is due upon substantial completion. Balances 30+ days past due accrue 1.5% monthly interest.',
  '7. Warranty: 1 year on workmanship from date of completion. Manufacturer warranties apply to materials.',
  '8. Either party may terminate this agreement in writing. Client is responsible for work completed and materials purchased up to the date of termination.'
].join('\n');

export const DEFAULT_INVOICE_TERMS = [
  'Payment due within 15 days of invoice date unless otherwise agreed in writing.',
  'Balances 30+ days past due accrue 1.5% monthly interest.',
  'Please include the invoice number on your payment.',
  'Make checks payable to Harvest Renovation. For ACH, Zelle, or card options, contact us.'
].join('\n');

export const DEFAULT_CONTRACT_TERMS = [
  '1. This agreement is between Harvest Renovation ("Contractor") and the client ("Owner") named above.',
  '2. The Contractor agrees to perform the work described in the Scope of Work in a workmanlike manner, in accordance with applicable building codes and industry standards.',
  '3. The contract amount and payment schedule are as stated above. The Owner agrees to make payments according to the schedule.',
  '4. A deposit is due upon signing this agreement to secure the project on the schedule and cover initial material costs. Work begins once the deposit is received.',
  '5. Any changes to the agreed-upon scope will be documented in a written Change Order and may result in a price adjustment.',
  '6. The Owner is responsible for obtaining any HOA approvals unless explicitly included in the scope. The Contractor will obtain city permits if included in the scope.',
  '7. Materials or fixtures supplied by the Owner are at the Owner\u2019s risk; the Contractor is not responsible for defects, delays, or breakage of Owner-supplied items.',
  '8. Warranty: 1 year on workmanship from date of substantial completion. Manufacturer warranties apply to materials.',
  '9. Either party may terminate this agreement in writing. The Owner is responsible for work completed and materials purchased up to the date of termination.',
  '10. Balances 30+ days past due accrue 1.5% monthly interest.',
  '11. This agreement constitutes the entire understanding between the parties. No oral modifications are binding.'
].join('\n');

// HubSpot-style deal pipeline stages (order = left→right on the board).
export const PIPELINE_STAGES = ['New Lead', 'Contacted', 'Qualified', 'Estimate Scheduled', 'Estimate Completed', 'Proposal Sent', 'Won', 'Lost'];

// Lead sources tracked for KPI attribution.
export const LEAD_SOURCES = ['Yelp', 'Google', 'Referral', 'Website Form', 'Phone Call', 'Repeat Customer', 'Google Business Profile', 'Facebook', 'Other'];

// Categorized trade list (alphabetized within each category) for service dropdowns.
export const TRADE_CATEGORIES = [
  { category: 'Interior Remodels', trades: ['Bathroom Remodel', 'Kitchen Remodel'] },
  { category: 'Exterior Builds', trades: ['Patio Build'] },
  { category: 'Rough Trades', trades: ['Carpentry', 'Foundation', 'Framing'] },
  { category: 'Finish Trades', trades: ['Carpet', 'Countertops', 'Drywall', 'Epoxy', 'Flooring', 'FRP', 'Painting'] },
  { category: 'Mechanical Trades', trades: ['Chimney', 'Electric', 'HVAC', 'Insulation', 'Plumbing'] },
  { category: 'Exterior & Roofing', trades: ['Concrete', 'Fencing', 'Garage Doors', 'Glass', 'Gutters', 'Landscaping', 'Masonry', 'Roofing', 'Siding', 'Windows'] },
  { category: 'Specialty / Other', trades: ['Interior Design', 'Trash Removal', 'Welding'] }
];

// Build the <optgroup> options for a service/trade <select>, preserving a legacy
// value that isn't in the new list so old records still display + persist.
export function tradeOptionsHtml(selected = '') {
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sel = v => (v === selected ? ' selected' : '');
  let html = '<option value="">Select a trade…</option>';
  for (const g of TRADE_CATEGORIES) {
    html += `<optgroup label="${esc(g.category)}">`;
    for (const t of g.trades) html += `<option value="${esc(t)}"${sel(t)}>${esc(t)}</option>`;
    html += '</optgroup>';
  }
  html += `<option value="Other"${sel('Other')}>Other</option>`;
  const known = TRADE_CATEGORIES.some(g => g.trades.includes(selected)) || selected === 'Other' || selected === '';
  if (!known) html += `<optgroup label="Current"><option value="${esc(selected)}" selected>${esc(selected)}</option></optgroup>`;
  return html;
}

export const seedStore = {
  clients: [],
  leads: [],
  estimates: [],
  jobs: [],
  calendar: [],
  notes: [],
  invoices: [],
  campaigns: [],
  activity: [],
  documents: [],
  checklist: [],
  reservedNumbers: [],
  changeOrders: [],
  receipts: [],
  contracts: [],
  bugReports: [],
  tips: [],
  trash: []
};

export const DEFAULT_TIPS = [
  'Drag a deal between pipeline stages to move it forward — or use the ▸ menu on a card.',
  'Mark a deal Won or Lost and your KPIs update automatically.',
  'Quick Add Lead only needs a name and a source — great for logging calls fast.',
  'New deals and quick leads are added to Contacts automatically.',
  'On the pipeline, use “Closed deals” to view This month / quarter / year / All time. Nothing is ever deleted.',
  'Approve or decline an estimate to update the KPI scorecard.',
  'To change a signed (locked) estimate, create a Change Order instead of editing it.',
  'Use the Service Now tab to report a bug or request a change any time.'
];

// Human-readable labels for each deletable collection, used by the Trash view.
export const collectionLabels = {
  clients: 'Client',
  leads: 'Lead',
  estimates: 'Estimate',
  jobs: 'Project',
  calendar: 'Calendar item',
  notes: 'Note',
  invoices: 'Invoice',
  campaigns: 'KPI row',
  documents: 'Document',
  changeOrders: 'Change Order',
  receipts: 'Receipt',
  contracts: 'Contract',
  bugReports: 'Bug report'
};

export const state = {
  supabase: null,
  session: null,
  profile: null,
  bootstrapUsersSynced: false,
  appUiBound: false,
  teamProfiles: [],
  allProfiles: [],
  pendingUsers: [],
  presenceChannel: null,
  onlineUserIds: new Set(),
  portalSettings: {
    company_calendar_name: config.companyCalendarName || 'Harvest Renovation Company Calendar',
    company_calendar_embed_url: config.companyCalendarEmbedUrl || ''
  },
  analyticsSummary: null,
  trafficWindowSummary: null,
  adminViewAs: 'admin',
  store: structuredClone(seedStore),
  currentView: 'dashboard',
  selectedClientId: '',
  filters: {
    clientSearch: '',
    employeeSearch: '',
    documentType: 'all',
    pipelineRange: 'month',
    tradeCategory: 'all',
    leadSource: 'all',
    docSearch: '',
    docDateRange: '',
    docGroupByClient: false
  }
};

export const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
export const integer = new Intl.NumberFormat('en-US');

export const BRAND = {
  name: 'Harvest Renovation',
  contact: 'Juan Puentes',
  phone: '(832) 944-0267',
  website: 'www.harvestrenovation.net',
  email: 'jp@harvestrenovation.net',
  verse: '"For every house is built by someone, the builder of all things is God." Hebrews 3:4',
  thankYou: 'THANK YOU'
};

// Served logo asset (not embedded) so saved/printed documents stay small. A
// <base href> is injected into each document so this relative path resolves
// in the print popup and when a saved document is reopened. The wheat SVG is
// kept as an onerror fallback if the image cannot load.
export const BRAND_LOGO_PATH = 'assets/harvest-logo.png';

// Default priority checklist — seeded with green checks. Admins can toggle,
// delete, or add to it; everyone else sees it read-only.
export const PRIORITY_CHECKLIST = [
  'Log every new lead in the CRM the same day it comes in.',
  'Send estimates within 48 hours of the site visit.',
  'Collect the 30% deposit before ordering materials or scheduling crews.',
  'Keep each active job\u2019s status and notes current for the whole team.',
  'Follow up on every outstanding invoice until it is paid in full.',
  'Review the KPI dashboard and ad spend before the start of each week.'
];

export function isActive() {
  return state.profile?.status === 'active';
}

// True when the signed-in account actually has the admin role, regardless of
// the admin's chosen "view as staff" preview mode.
export function isRealAdmin() {
  return isActive() && state.profile?.role === 'admin';
}

export function isAdmin() {
  return isRealAdmin() && state.adminViewAs !== 'staff';
}

export function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function objectFromForm(form) {
  const fd = new FormData(form);
  return Object.fromEntries([...fd.entries()]);
}

export function debounce(fn, wait = 180) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function lookupClientName(clientId) {
  return state.store.clients.find(item => item.id === clientId)?.name || '';
}

export function findClient(clientId) {
  return state.store.clients.find(item => item.id === clientId) || null;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function isDuplicateNumber(collection, field, number, currentId) {
  const target = String(number || '').trim().toLowerCase();
  if (!target) return false;
  return (state.store[collection] || []).some(row => row.id !== currentId && String(row[field] || '').trim().toLowerCase() === target);
}

// True if an estimate/invoice number is already in use anywhere: saved records,
// uploaded (legacy) documents, or the manually reserved number registry.
// `type` is 'estimate' or 'invoice'. `currentId` excludes the record being saved.
export function numberInUse(type, number, currentId = '') {
  const target = String(number || '').trim().toLowerCase();
  if (!target) return false;
  const collection = type === 'invoice' ? 'invoices' : type === 'contract' ? 'contracts' : 'estimates';
  const field = type === 'invoice' ? 'invoiceNumber' : type === 'contract' ? 'contractNumber' : 'estimateNumber';
  const inRecords = (state.store[collection] || []).some(row => row.id !== currentId && String(row[field] || '').trim().toLowerCase() === target);
  // Only uploaded documents count; generated documents mirror an existing record.
  const inUploads = (state.store.documents || []).some(doc => doc.uploaded && doc.type === type && String(doc.number || '').trim().toLowerCase() === target);
  const inReserved = (state.store.reservedNumbers || []).some(row => row.type === type && String(row.number || '').trim().toLowerCase() === target);
  const inChangeOrders = (state.store.changeOrders || []).some(c => String(c.changeOrderNumber || '').trim().toLowerCase() === target);
  const inReceipts = (state.store.receipts || []).some(r => String(r.receiptNumber || '').trim().toLowerCase() === target);
  const inContracts = (state.store.contracts || []).some(c => String(c.contractNumber || '').trim().toLowerCase() === target);
  return inRecords || inUploads || inReserved || inChangeOrders || inReceipts || inContracts;
}

export function buildMailto(to, subject, body) {
  return `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function computeCplLabel() {
  const spend = state.store.campaigns.reduce((sum, item) => sum + num(item.spend), 0);
  const leads = state.store.campaigns.reduce((sum, item) => sum + num(item.leads), 0);
  return leads ? money.format(spend / leads) : '—';
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map(part => part[0] || '').join('').toUpperCase() || 'HR';
}

export function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

let _autoNumCounter = 0;
// Timestamp + a rolling 2-digit counter so same-millisecond calls never collide.
export function autoNumber(prefix) {
  _autoNumCounter = (_autoNumCounter + 1) % 100;
  return `${prefix}${Date.now().toString().slice(-6)}${String(_autoNumCounter).padStart(2, '0')}`;
}

export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatDate(value) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

export function currentUserName() {
  return state.profile?.full_name || state.session?.user?.user_metadata?.full_name || state.session?.user?.email || '';
}

export function sortDateDesc(a, b) { return new Date(b || 0) - new Date(a || 0); }
export function sortDateAsc(a, b) { return new Date(a || 0) - new Date(b || 0); }

// Add `days` to an ISO date string (falls back to today), returning YYYY-MM-DD.
function addDaysISO(dateStr, days) {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Backwards-compatibility: fill in fields added by the itemized redesign so old
// saved records open, print, and re-save cleanly. Only ADD missing keys.
export function migrateEstimate(record) {
  if (!record || typeof record !== 'object') return record;
  const r = { ...record };
  if (!Array.isArray(r.items)) r.items = [];
  if (r.commercialJob == null) r.commercialJob = false;
  // Legacy lumped-pricing subtotal — used only to rescue old records that were
  // saved before the line-item editor and therefore carry no items[].
  const laborBase = num(r.quantity) * num(r.rate);
  const materialMarkup = num(r.materialCost) * (num(r.materialPercent) / 100);
  const laborMarkup = laborBase * (num(r.laborPercent) / 100);
  const legacySubtotal = laborBase + num(r.materialCost) + materialMarkup + laborMarkup;
  if (!r.items.length && legacySubtotal > 0) {
    r.items = [{
      id: uid('ITM'),
      description: `${r.trade || 'Project'} \u2014 lumped total (migrated)`,
      category: 'Other',
      quantity: 1,
      unit: 'LS',
      unitPrice: legacySubtotal,
      amount: legacySubtotal
    }];
  }
  if (r.taxPercent == null) r.taxPercent = 0;
  if (r.permitsFees == null) r.permitsFees = 0;
  if (r.subtotal == null) r.subtotal = r.items.reduce((s, it) => s + num(it && it.amount), 0) || legacySubtotal;
  if (r.taxAmount == null) r.taxAmount = num(r.subtotal) * num(r.taxPercent) / 100;
  if (r.finalPercent == null) r.finalPercent = 0;
  if (r.finalPay == null) r.finalPay = 0;
  if (r.estimatedCost == null) r.estimatedCost = num(r.subtotal) + num(r.taxAmount) + num(r.permitsFees) + num(r.finalPay);
  if (!r.validUntil) r.validUntil = addDaysISO(r.date, 30);
  if (r.termsAndConditions == null) r.termsAndConditions = DEFAULT_ESTIMATE_TERMS;
  if (r.signatureBlockEnabled == null) r.signatureBlockEnabled = true;
  if (r.depositReceivedAt == null) r.depositReceivedAt = '';
  if (r.depositReceivedBy == null) r.depositReceivedBy = '';
  return r;
}

export function migrateInvoice(record) {
  if (!record || typeof record !== 'object') return record;
  const r = { ...record };
  if (!Array.isArray(r.items)) r.items = [];
  if (r.commercialJob == null) r.commercialJob = false;
  // Normalize legacy items {description, amount} while retaining extra keys.
  r.items = r.items.map(it => {
    if (!it || typeof it !== 'object') return it;
    const quantity = it.quantity != null ? num(it.quantity) : 1;
    const storedAmount = it.amount != null ? num(it.amount) : null;
    const unitPrice = it.unitPrice != null ? num(it.unitPrice) : num(storedAmount);
    return {
      ...it,
      id: it.id || uid('ITM'),
      description: it.description || '',
      category: it.category || 'Other',
      quantity,
      unit: it.unit || 'LS',
      unitPrice,
      amount: storedAmount != null ? storedAmount : quantity * unitPrice
    };
  });
  if (!Array.isArray(r.payments)) r.payments = [];
  if (!r.dueDate) r.dueDate = addDaysISO(r.date, 15);
  if (r.paymentTerms == null) r.paymentTerms = 'Net 15';
  if (r.permitsFees == null) r.permitsFees = 0;
  if (r.taxPercent == null) r.taxPercent = 0;
  if (r.depositPercent == null) r.depositPercent = 0;
  if (r.createdBy == null) r.createdBy = '';
  if (r.terms == null) r.terms = DEFAULT_INVOICE_TERMS;
  if (r.total == null) {
    const sub = r.items.reduce((s, it) => s + num(it && it.amount), 0);
    r.total = sub + sub * num(r.taxPercent) / 100 + num(r.permitsFees);
  }
  return r;
}

// Map any legacy/free-text lead status onto the canonical pipeline stages.
export function normalizeLeadStatus(status) {
  if (PIPELINE_STAGES.includes(status)) return status;
  if (status === 'Estimate Sent') return 'Proposal Sent';
  return 'New Lead';
}

// Backwards-compatibility: fill in the CRM pipeline fields on old lead records.
export function migrateLead(record) {
  if (!record || typeof record !== 'object') return record;
  const r = { ...record };
  r.status = normalizeLeadStatus(r.status);
  if (r.source == null) r.source = '';
  if (r.estimatedValue == null) r.estimatedValue = 0;
  if (r.followUpDate == null) r.followUpDate = '';
  if (r.lastContactedAt == null) r.lastContactedAt = '';
  if (!r.stageChangedAt) r.stageChangedAt = r.preferredDate || '';
  if (r.owner == null) r.owner = '';
  if (!Array.isArray(r.contactLog)) r.contactLog = [];
  return r;
}

// Backwards-compatibility defaults for change-order records.
export function migrateChangeOrder(record) {
  if (!record || typeof record !== 'object') return record;
  const r = { ...record };
  if (!Array.isArray(r.items)) r.items = [];
  if (r.deltaAmount == null) r.deltaAmount = r.items.reduce((s, it) => s + num(it && it.amount), 0);
  if (r.status == null) r.status = 'Draft';
  if (r.sentAt == null) r.sentAt = '';
  if (r.signedAt == null) r.signedAt = '';
  if (r.signedBy == null) r.signedBy = '';
  if (r.owner == null) r.owner = '';
  if (r.notes == null) r.notes = '';
  return r;
}

// Backwards-compatibility defaults for receipt records.
export function migrateReceipt(record) {
  if (!record || typeof record !== 'object') return record;
  const r = { ...record };
  if (r.amountReceived == null) r.amountReceived = 0;
  if (r.paymentType == null) r.paymentType = 'Progress';
  if (r.paymentMethod == null) r.paymentMethod = 'Check';
  if (r.balanceRemaining == null) r.balanceRemaining = 0;
  if (r.notes == null) r.notes = '';
  if (r.issuedBy == null) r.issuedBy = '';
  return r;
}

// Backwards-compatibility defaults for contract records.
export function migrateContract(record) {
  if (!record || typeof record !== 'object') return record;
  const r = { ...record };
  if (!Array.isArray(r.paymentSchedule)) r.paymentSchedule = [];
  if (r.status == null) r.status = 'Draft';
  if (r.sentAt == null) r.sentAt = '';
  if (r.signedAt == null) r.signedAt = '';
  if (r.signedBy == null) r.signedBy = '';
  if (r.contractorSignedAt == null) r.contractorSignedAt = '';
  if (r.terms == null) r.terms = DEFAULT_CONTRACT_TERMS;
  if (r.depositPercent == null) r.depositPercent = 30;
  if (r.linkedEstimateId == null) r.linkedEstimateId = '';
  if (r.owner == null) r.owner = '';
  if (r.scope == null) r.scope = '';
  if (r.notes == null) r.notes = '';
  return r;
}
