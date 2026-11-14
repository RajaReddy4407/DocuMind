import { AlertOctagon, AlertTriangle, Info, Sparkles } from 'lucide-react';

const SEV = {
  critical: { label: 'Critical', icon: AlertOctagon, cls: 'bg-rose-500/15 text-rose-600 ring-1 ring-rose-500/40 shadow-glow-red dark:text-rose-300', dot: 'bg-rose-500' },
  warning: { label: 'Warning', icon: AlertTriangle, cls: 'bg-amber-400/15 text-amber-700 ring-1 ring-amber-500/40 shadow-glow-amber dark:text-amber-300', dot: 'bg-amber-400' },
  info: { label: 'Info', icon: Info, cls: 'bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/30 dark:text-sky-300', dot: 'bg-sky-400' },
};

const TYPE_LABEL = {
  quantity_mismatch: 'Qty mismatch', over_billing: 'Over-billing', short_delivery: 'Short delivery', over_delivery: 'Over delivery',
  price_variance: 'Price variance', amount_variance: 'Amount variance', duplicate_invoice: 'Duplicate', possible_duplicate: 'Possible duplicate',
  missing_document: 'Missing doc', missing_field: 'Missing field', unordered_item: 'Unordered item', calculation_error: 'Math error',
  vendor_mismatch: 'Vendor mismatch', awaiting_invoice: 'Awaiting invoice', awaiting_delivery: 'Awaiting delivery', partial_invoice: 'Partial invoice',
  duplicate_po: 'Duplicate PO',
};

export const severityMeta = SEV;
export const findingLabel = (type) => TYPE_LABEL[type] || (type || 'issue').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Glowing pill badge for a discrepancy severity (optionally with its finding type). */
export default function DiscrepancyBadge({ severity = 'info', type, ai = false, pulse }) {
  const s = SEV[severity] || SEV.info;
  const Icon = s.icon;
  return (
    <span className={`pill ${s.cls}`}>
      <span className="relative flex h-2 w-2">
        {(pulse ?? severity === 'critical') && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${s.dot}`} />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`} />
      </span>
      <Icon size={12} />
      {type ? findingLabel(type) : s.label}
      {ai && <Sparkles size={11} className="opacity-80" />}
    </span>
  );
}
