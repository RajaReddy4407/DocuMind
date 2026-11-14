import { ClipboardList, FileQuestion, PackageCheck, Receipt } from 'lucide-react';

export const DOC_TYPES = {
  purchase_order: { label: 'Purchase Order', short: 'PO', icon: ClipboardList, cls: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 ring-1 ring-indigo-500/20', dot: 'bg-indigo-500' },
  delivery_receipt: { label: 'Delivery Receipt', short: 'GRN', icon: PackageCheck, cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-300 ring-1 ring-sky-500/20', dot: 'bg-sky-500' },
  invoice: { label: 'Invoice', short: 'INV', icon: Receipt, cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-500/20', dot: 'bg-emerald-500' },
  unknown: { label: 'Unclassified', short: '?', icon: FileQuestion, cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 ring-1 ring-slate-500/20', dot: 'bg-slate-400' },
};

export const STATUS = {
  processing: { label: 'Processing', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-300' },
  processed: { label: 'Processed', cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  needs_review: { label: 'Needs review', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' },
  mismatch: { label: 'Mismatch', cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-300' },
  matched: { label: 'Matched', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' },
  failed: { label: 'Failed', cls: 'bg-rose-500/10 text-rose-500' },
};

export const RECOMMENDATION = {
  HOLD_PAYMENT: { label: 'Hold payment', cls: 'bg-rose-500 text-white shadow-glow-red', tone: 'critical' },
  REVIEW: { label: 'Needs review', cls: 'bg-amber-400 text-amber-950 shadow-glow-amber', tone: 'warning' },
  APPROVE: { label: 'Approve', cls: 'bg-emerald-500 text-white shadow-glow', tone: 'ok' },
  AWAIT_INVOICE: { label: 'Awaiting invoice', cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-300', tone: 'info' },
};

export function money(n, currency) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(Number(n));
  } catch {
    return `${currency || ''} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim();
  }
}

export function compactMoney(n, currency) {
  if (!n) return money(0, currency);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch { return money(n, currency); }
}

export function date(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const bytes = (b) => (b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export const cn = (...c) => c.filter(Boolean).join(' ');
