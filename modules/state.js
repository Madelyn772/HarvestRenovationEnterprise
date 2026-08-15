import { portalConfig } from '../config.js';

export const config = portalConfig || {};
export const STORAGE_KEY = 'harvest-portal-pro-crm-v1';
export const DASHBOARD_VIEW_MODE_KEY = 'harvest-portal-pro-dashboard-view-mode';
export const BOOTSTRAP_STATE_KEY = '__HARVEST_PORTAL_BOOTSTRAP__';
export const TRASH_RETENTION_DAYS = 30;
export const THEME_KEY = 'harvest-portal-theme';
export const ADMIN_VIEW_KEY = 'harvest-portal-admin-view';

export const estimateTemplates = {
  'Kitchen Remodeling': { trade: 'Kitchen Remodeling', measurementType: 'SquareFoot', rate: 28, materialPercent: 12, laborPercent: 18, finalPercent: 8, scope: 'Cabinet updates, countertops, backsplash, lighting, paint, trim, and finish coordination.' },
  'Bathroom Remodeling': { trade: 'Bathroom Remodeling', measurementType: 'SquareFoot', rate: 30, materialPercent: 12, laborPercent: 18, finalPercent: 8, scope: 'Tile, vanity, plumbing coordination, lighting, drywall touchups, paint, and finish work.' },
  'Commercial Build-Out': { trade: 'Commercial Build-Out', measurementType: 'SquareFoot', rate: 42, materialPercent: 14, laborPercent: 20, finalPercent: 10, scope: 'Build-out coordination, framing, drywall, finishes, punch, and site organization.' },
  Flooring: { trade: 'Flooring', measurementType: 'SquareFoot', rate: 6, materialPercent: 10, laborPercent: 15, finalPercent: 8, scope: 'Demo, prep, install, transitions, trim reset, and cleanup.' },
  Painting: { trade: 'Painting', measurementType: 'SquareFoot', rate: 2.5, materialPercent: 10, laborPercent: 15, finalPercent: 8, scope: 'Prep, patching, caulking, primer as needed, paint, and cleanup.' },
  'Drywall / Framing / Electrical': { trade: 'Drywall / Framing / Electrical', measurementType: 'LinearFoot', rate: 24, materialPercent: 10, laborPercent: 15, finalPercent: 8, scope: 'Framing adjustments, drywall patch and finish, electrical support, and cleanup.' },
  'Whole Home Renovation': { trade: 'Whole Home Renovation', measurementType: 'SquareFoot', rate: 40, materialPercent: 12, laborPercent: 20, finalPercent: 10, scope: 'Multi-room renovation with planning, trade coordination, finishes, and punch completion.' },
  Roofing: { trade: 'Roofing', measurementType: 'SquareFoot', rate: 8.5, materialPercent: 14, laborPercent: 18, finalPercent: 8, scope: 'Remove and replace roofing materials, underlayment, flashing, cleanup, and final walkthrough.' },
  Other: { trade: 'General Scope', measurementType: 'FlatRate', rate: 0, materialPercent: 10, laborPercent: 15, finalPercent: 8, scope: 'Custom scope to be defined after field review.' }
};

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
  trash: []
};

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
  documents: 'Document'
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
    documentType: 'all'
  }
};

export const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
export const integer = new Intl.NumberFormat('en-US');

export const BRAND = {
  name: 'Harvest Renovation',
  contact: 'Juan Puentes',
  phone: '(832) 944-0267',
  website: 'www.harvestrenovation.net',
  email: 'jp@harvestrenovation.com',
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
  const collection = type === 'invoice' ? 'invoices' : 'estimates';
  const field = type === 'invoice' ? 'invoiceNumber' : 'estimateNumber';
  const inRecords = (state.store[collection] || []).some(row => row.id !== currentId && String(row[field] || '').trim().toLowerCase() === target);
  // Only uploaded documents count; generated documents mirror an existing record.
  const inUploads = (state.store.documents || []).some(doc => doc.uploaded && doc.type === type && String(doc.number || '').trim().toLowerCase() === target);
  const inReserved = (state.store.reservedNumbers || []).some(row => row.type === type && String(row.number || '').trim().toLowerCase() === target);
  return inRecords || inUploads || inReserved;
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

export function autoNumber(prefix) {
  return `${prefix}${Date.now().toString().slice(-6)}`;
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
