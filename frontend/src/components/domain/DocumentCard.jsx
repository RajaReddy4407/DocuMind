import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { DOC_TYPES, date, money } from '../../lib/format.js';
import { StatusPill } from './Badges.jsx';

/** Compact, tappable document row/card used across lists. */
export default function DocumentCard({ doc, active = false, to, index = 0 }) {
  const e = doc.extracted || {};
  const t = DOC_TYPES[doc.doc_type] || DOC_TYPES.unknown;
  const Icon = t.icon;
  const number = e.document_number || doc.document_number;
  const vendor = e.vendor_name || doc.vendor;
  const total = e.total_amount ?? doc.total;
  const docDate = e.document_date || doc.date;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 10) * 0.03 }}>
      <Link
        to={to || `/documents/${doc.id}`}
        className={`group flex items-center gap-3 rounded-2xl border p-3 transition ${
          active
            ? 'border-emerald-500/40 bg-emerald-500/10 shadow-glow'
            : 'border-transparent hover:border-slate-200 hover:bg-white/70 dark:hover:border-white/10 dark:hover:bg-white/5'
        }`}
      >
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${t.cls}`}>
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{number ? `${t.short} · ${number}` : doc.filename}</p>
          </div>
          <p className="muted truncate text-xs">{vendor || doc.filename} · {date(docDate || doc.created_at)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {total !== null && total !== undefined && <span className="text-sm font-semibold tabular-nums">{money(total, e.currency || doc.currency)}</span>}
          <StatusPill status={doc.status} />
        </div>
        <ChevronRight size={16} className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />
      </Link>
    </motion.div>
  );
}
